// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Cross-window bus for the terminal lock.
 *
 * Deliberately NOT the shared `pairlens:sync` channel. That bus is wired to
 * `emitHydrate`, which the SyncCoordinator drives from whatever the App
 * Server returns — routing lock state over it would mean a compromised
 * server could unlock someone's terminal. A separate channel makes "the
 * server cannot reach this" a structural property instead of a review
 * promise.
 *
 * Falls back to a `storage`-event ping for webviews without
 * BroadcastChannel, same shape as lib/sync/sync-channel.ts.
 */

import type { LockConfig, LockReason } from './lock-config'

export type LockMessage =
  | { type: 'lock'; reason: LockReason; at: number }
  | { type: 'unlock'; at: number }
  /** Coarse activity heartbeat — at most one per window per minute. */
  | { type: 'activity'; at: number }
  | { type: 'config'; config: LockConfig }
  | { type: 'attempts'; fails: number; blockedUntil: number }
  /**
   * Biometric unlock was enrolled or removed. Carries the flag, not the
   * record: a sibling window only needs to know whether to draw the button,
   * and the credential id belongs in one place.
   */
  | { type: 'lock-biometric'; enrolled: boolean }
  /**
   * This device was erased by the destructive reset. Every other window is
   * holding a full in-memory copy of what was just deleted and would write it
   * straight back, so they reload into the first-run state instead.
   */
  | { type: 'reset'; at: number }
  // ── Credential vault ───────────────────────────────────────────────
  //
  // Same bus as the lock, on purpose: it is the one channel the App Server
  // provably cannot reach (see the note above), and one channel means one
  // blocklist story. The DEK itself travels as a non-extractable `CryptoKey`,
  // which structured clone carries without ever exposing key material.
  /** A window unlocked the vault. Sealed windows may ask it for the key. */
  | { type: 'vault:unlocked'; at: number }
  /** A joining window asking whoever holds the DEK to hand it over. */
  | { type: 'vault:key-request'; nonce: string }
  /**
   * The answer. Sent only in response to a request — never broadcast on
   * unlock — so the key is not sitting in every passive listener's queue.
   */
  | { type: 'vault:key-offer'; nonce: string; key: CryptoKey }
  /** A hard lock. Every window drops its DEK. */
  | { type: 'vault:sealed'; at: number }
  /** The record changed (protector added/removed, migration finished). */
  | { type: 'vault:enrolled'; revision: number }

const CHANNEL_NAME = 'pairlens:security-lock'
/**
 * Fallback transport. Written and immediately cleared, so it is a signal
 * rather than state — the real state lives in `security.lock-state`.
 */
const FALLBACK_KEY = 'pairlens:security.lock-bus'

const listeners = new Set<(message: LockMessage) => void>()

let channel: BroadcastChannel | null = null
let started = false

function deliver(message: LockMessage): void {
  for (const listener of [...listeners]) listener(message)
}

function start(): void {
  if (started || typeof window === 'undefined') return
  started = true

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent<LockMessage>) => {
      if (event.data && typeof event.data.type === 'string') {
        deliver(event.data)
      }
    }
    return
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== FALLBACK_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as {
        message?: LockMessage
      }
      if (parsed.message && typeof parsed.message.type === 'string') {
        deliver(parsed.message)
      }
    } catch {
      // Not one of ours.
    }
  })
}

export function postLock(message: LockMessage): void {
  if (typeof window === 'undefined') return
  start()
  if (channel) {
    try {
      channel.postMessage(message)
    } catch {
      // Not structured-cloneable — local state is still correct.
    }
    return
  }
  try {
    // The nonce makes two identical messages distinct writes, so the
    // `storage` event fires for both.
    localStorage.setItem(
      FALLBACK_KEY,
      JSON.stringify({ nonce: Math.random(), message }),
    )
  } catch {
    // Quota — cross-window sync degrades, this window stays correct.
  }
}

/** Subscribe to messages from sibling windows. Returns unsubscribe. */
export function onLockMessage(
  listener: (message: LockMessage) => void,
): () => void {
  start()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
