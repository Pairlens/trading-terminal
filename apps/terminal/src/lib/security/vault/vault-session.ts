// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The live vault — one module-level machine plus a `useSyncExternalStore`
 * adapter, shaped exactly like lock-store.ts so the render-invariant story is
 * unchanged (no per-tick setState, nothing on a pointermove path).
 *
 * Two pieces of state, and they are not the same thing:
 *
 *   the record   what is enrolled. Async to read (an OS keychain entry on
 *                desktop), cached after the first load, invalidated when a
 *                sibling window changes it.
 *   the DEK      whether the vault is open. In memory only, never persisted,
 *                non-extractable.
 *
 * THE AUTOMATIONS POLICY, which is the load-bearing decision here: a UI lock
 * does NOT zeroize the DEK. Armed bots and workflow automations keep trading
 * behind the lock screen — that is what the existing Security copy already
 * promises, and a vault that broke it would turn "my laptop locked" into
 * "my stop-loss stopped running". Only a hard lock (vault-hard-lock.ts) drops
 * the key, and its confirm copy says so.
 *
 * Cross-window: sibling windows share the DEK over the lock channel as a
 * non-extractable `CryptoKey`, request/offer rather than broadcast-on-unlock
 * so the key never sits unasked-for in a passive listener's queue. If the
 * clone fails — the WKWebView has surprised this codebase before — the
 * requester simply times out and that window stays sealed until someone
 * unlocks it. Annoying, never unsafe.
 */

import { useSyncExternalStore } from 'react'

import { onLockMessage, postLock } from '../lock-channel'
import { readUiMirror, readVaultRecord, writeUiMirror } from './vault-storage'
import { VaultSealedError } from './vault-errors'
import type { VaultRecord } from './vault-record'

/** How long a joining window waits for a sibling to hand over the DEK. */
export const KEY_REQUEST_TIMEOUT_MS = 500

type Session = { dek: CryptoKey; unlockedAt: number }

let session: Session | null = null
let record: VaultRecord | null = null
let loaded = false
let loading: Promise<VaultRecord | null> | null = null
let bridged = false
let joinAttempt: Promise<boolean> | null = null

const listeners = new Set<() => void>()
const pendingKeyRequests = new Map<string, (key: CryptoKey) => void>()

export type VaultState = {
  /** The record has been read at least once. Until then `enrolled` is a hint. */
  loaded: boolean
  enrolled: boolean
  unlocked: boolean
  protectors: number
  hasPasskey: boolean
  /**
   * Whether a password protector is enrolled. Separate from `hasPasskey`
   * because "add a way in" has to offer exactly the kinds that are missing,
   * and a vault with both is not the same as a vault with one of each.
   */
  hasPassword: boolean
  migrating: boolean
}

const SERVER_STATE: VaultState = Object.freeze({
  loaded: false,
  enrolled: false,
  unlocked: false,
  protectors: 0,
  hasPasskey: false,
  hasPassword: false,
  migrating: false,
})

let snapshot: VaultState = SERVER_STATE

function computeSnapshot(): VaultState {
  // Before the first load the UI has to paint something, and an async
  // keychain probe is not available at first paint on desktop. The mirror
  // fills that gap and ONLY that gap — `isVaultEnrolled()` below stays
  // strict, so no crypto decision is ever made from it.
  const mirror = loaded ? null : readUiMirror()
  return {
    loaded,
    enrolled: loaded ? record !== null : (mirror?.enrolled ?? false),
    unlocked: session !== null,
    protectors: loaded
      ? (record?.protectors.length ?? 0)
      : (mirror?.protectors ?? 0),
    hasPasskey: loaded
      ? (record?.protectors.some((p) => p.type === 'passkey') ?? false)
      : (mirror?.hasPasskey ?? false),
    hasPassword: loaded
      ? (record?.protectors.some((p) => p.type === 'password') ?? false)
      : (mirror?.hasPassword ?? false),
    migrating: loaded
      ? record?.state === 'migrating'
      : mirror?.state === 'migrating',
  }
}

function notify(): void {
  snapshot = computeSnapshot()
  for (const listener of [...listeners]) listener()
}

// ── Cross-window bridge ──────────────────────────────────────────────

function isUsableDek(value: unknown): value is CryptoKey {
  if (typeof CryptoKey === 'undefined') return false
  if (!(value instanceof CryptoKey)) return false
  // The storage-event fallback transport JSON-round-trips messages, which
  // turns a CryptoKey into `{}`; the instanceof above already rejects that.
  // This is the second belt: an offer must actually be a vault DEK.
  return value.algorithm.name === 'AES-GCM' && value.usages.includes('decrypt')
}

function ensureBridge(): void {
  if (bridged || typeof window === 'undefined') return
  bridged = true
  // First paint happens before anything calls `notify()`, and on desktop the
  // record is an async keychain read — so seed the snapshot from the mirror.
  snapshot = computeSnapshot()

  onLockMessage((message) => {
    switch (message.type) {
      case 'vault:key-request': {
        // Only a window that actually holds the key answers.
        if (!session) return
        postLock({
          type: 'vault:key-offer',
          nonce: message.nonce,
          key: session.dek,
        })
        return
      }
      case 'vault:key-offer': {
        const resolve = pendingKeyRequests.get(message.nonce)
        if (!resolve) return
        if (!isUsableDek(message.key)) return
        resolve(message.key)
        return
      }
      case 'vault:unlocked': {
        // A sibling opened the vault. Follow along rather than making the user
        // unlock every window — but only ask, never assume.
        if (!session && loaded && record) void requestDekFromSiblings()
        return
      }
      case 'vault:sealed': {
        if (!session) return
        session = null
        notify()
        return
      }
      case 'vault:enrolled': {
        invalidateVaultRecord()
        void ensureVaultLoaded()
        return
      }
      case 'reset': {
        // The device was erased. Whatever this window holds is a key to data
        // that no longer exists; lock-store reloads the page right after.
        session = null
        record = null
        loaded = false
        loading = null
        notify()
        return
      }
      default:
        return
    }
  })
}

/**
 * Ask sibling windows for the DEK.
 *
 * Resolves `true` if one answered in time. A `false` is not an error — it is
 * the normal answer when this is the only window, or when the webview cannot
 * structured-clone a CryptoKey. Either way this window stays sealed and
 * prompts on demand.
 */
export function requestDekFromSiblings(
  timeoutMs: number = KEY_REQUEST_TIMEOUT_MS,
): Promise<boolean> {
  ensureBridge()
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (session) return Promise.resolve(true)

  const nonce =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pendingKeyRequests.delete(nonce)
      resolve(false)
    }, timeoutMs)
    pendingKeyRequests.set(nonce, (key) => {
      clearTimeout(timer)
      pendingKeyRequests.delete(nonce)
      // Adopted, not announced: the sibling already knows.
      setDek(key, { broadcast: false })
      resolve(true)
    })
    postLock({ type: 'vault:key-request', nonce })
  })
}

// ── Record ───────────────────────────────────────────────────────────

/**
 * Read the vault record, once.
 *
 * A backend failure propagates rather than resolving `null`: on desktop this
 * is an OS keychain call, and "the keychain is locked" must not look like
 * "there is no vault" — that would downgrade the next credential write to the
 * pre-vault format while the real record is still there.
 */
export async function ensureVaultLoaded(): Promise<VaultRecord | null> {
  ensureBridge()
  if (loaded) return record
  loading ??= readVaultRecord().then(
    (next) => {
      record = next
      loaded = true
      loading = null
      writeUiMirror(next)
      notify()
      return next
    },
    (err: unknown) => {
      loading = null
      throw err
    },
  )
  return loading
}

/**
 * Startup entry point. Call once per window, as early as there is a DOM.
 *
 * `ensureVaultLoaded` is deliberately not the place for this: it sits on the
 * credential hot path (every `getCredential` awaits it) and must not spend
 * half a second waiting on a handshake. But a window that opens *after* a
 * sibling unlocked has no other way to learn the key exists — the
 * `vault:unlocked` announcement it would have followed was broadcast before it
 * was listening. So the join happens once, here, at startup.
 *
 * Resolves to the state afterwards. A `false` handshake is not an error: it is
 * the normal answer with one window open, and the only consequence is that
 * this window prompts when something needs a credential.
 */
export async function initVaultSession(
  timeoutMs: number = KEY_REQUEST_TIMEOUT_MS,
): Promise<VaultState> {
  ensureBridge()
  let current: VaultRecord | null = null
  try {
    current = await ensureVaultLoaded()
  } catch {
    // A keychain backend that will not answer is not "there is no vault".
    // Leave the record unloaded so the next read tries again, and stay sealed
    // — which makes credential reads throw rather than report emptiness.
    return getVaultState()
  }
  if (current && !session) {
    joinAttempt ??= requestDekFromSiblings(timeoutMs).finally(() => {
      joinAttempt = null
    })
    await joinAttempt
  }
  return getVaultState()
}

/** Cached record. `null` both before the first load and when unenrolled. */
export function getVaultRecord(): VaultRecord | null {
  return loaded ? record : null
}

/**
 * Strict: false until the record has actually been read.
 *
 * Deliberately not backed by the UI mirror. A stale mirror claiming
 * "enrolled" would let a policy check pass and a credential then land in the
 * pre-vault format — a silent downgrade. Callers that must be right await
 * `ensureVaultLoaded()`; callers that only paint use `useVaultState()`.
 */
export function isVaultEnrolled(): boolean {
  return loaded && record !== null
}

export function isVaultUnlocked(): boolean {
  return session !== null
}

/**
 * Authoritative "is a password protector enrolled?" — awaits the record, and
 * propagates a backend failure rather than answering `false`.
 *
 * Everything that decides what to do with the LOCK VERIFIER has to ask this
 * and not `useVaultState()`: that snapshot is backed by the untrusted UI
 * mirror until the record has loaded, and a `false` from a stale mirror is how
 * a password rotation rewrites the verifier while leaving the vault's password
 * protector wrapped under the old secret. There is no way back from that
 * divergence except the destructive reset.
 */
export async function hasPasswordProtector(): Promise<boolean> {
  const current = await ensureVaultLoaded()
  return current?.protectors.some((p) => p.type === 'password') ?? false
}

/** Adopt a record this window just wrote, and tell the others. */
export function setVaultRecord(
  next: VaultRecord | null,
  opts: { broadcast: boolean },
): void {
  record = next
  loaded = true
  loading = null
  writeUiMirror(next)
  notify()
  if (opts.broadcast) {
    postLock({ type: 'vault:enrolled', revision: next?.revision ?? 0 })
  }
}

/** Force the next read to hit storage. */
export function invalidateVaultRecord(): void {
  loaded = false
  loading = null
  record = null
}

// ── The key ──────────────────────────────────────────────────────────

export function getDek(): CryptoKey | null {
  return session?.dek ?? null
}

/** The keychain's accessor: sealed is a throw, never a null. */
export function getDekOrThrow(): CryptoKey {
  const dek = session?.dek
  if (!dek) throw new VaultSealedError()
  return dek
}

export function getUnlockedAt(): number | null {
  return session?.unlockedAt ?? null
}

export function setDek(dek: CryptoKey, opts: { broadcast: boolean }): void {
  ensureBridge()
  session = { dek, unlockedAt: Date.now() }
  notify()
  if (opts.broadcast) postLock({ type: 'vault:unlocked', at: Date.now() })
}

/**
 * Drop the key. This stops live automations, which is why nothing calls it on
 * a UI lock — see the module note and vault-hard-lock.ts.
 */
export function sealVault(opts: { broadcast: boolean }): void {
  ensureBridge()
  if (!session) {
    if (opts.broadcast) postLock({ type: 'vault:sealed', at: Date.now() })
    return
  }
  session = null
  notify()
  if (opts.broadcast) postLock({ type: 'vault:sealed', at: Date.now() })
}

// ── React ────────────────────────────────────────────────────────────

export function subscribeVault(listener: () => void): () => void {
  ensureBridge()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getVaultState(): VaultState {
  ensureBridge()
  return snapshot
}

export function useVaultState(): VaultState {
  return useSyncExternalStore(subscribeVault, getVaultState, () => SERVER_STATE)
}

/** Test seam: drop every scrap of module state. */
export function __resetVaultSessionForTests(): void {
  session = null
  record = null
  loaded = false
  loading = null
  joinAttempt = null
  pendingKeyRequests.clear()
  snapshot = computeSnapshot()
}
