// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Live lock state — one module-level machine, a `useSyncExternalStore`
 * adapter for React, and a cheap `isTerminalLocked()` for the keydown
 * handlers that have to ask on every keystroke.
 *
 * Two things are persisted, both device-local and both off the sync bus:
 *
 *   `security.lock-state`    whether we are locked, plus a coarse
 *                            "the app was alive at" stamp. A window spawned
 *                            by ⌘N never receives past BroadcastChannel
 *                            traffic, and ⌘R would otherwise unlock the app,
 *                            so the mirror is what makes the very first
 *                            paint already know it is locked.
 *   `security.lock-attempts` the backoff counter, so a reload (or a second
 *                            window) doesn't clear a brute-force penalty.
 *
 * The keychain verifier is deliberately NOT read at boot: it is async, and
 * nothing needs it until someone actually types a password.
 */

import { useSyncExternalStore } from 'react'

import { onLockMessage, postLock } from './lock-channel'
import { getLockConfig, subscribeLockConfig } from './lock-config'
import type { LockReason } from './lock-config'
import { track } from '@/lib/analytics-events'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

export type LockUiState =
  | { mode: 'unlocked' }
  | { mode: 'locked'; reason: LockReason; since: number }
  | { mode: 'challenge'; prompt: 'trade' }

export type AttemptState = { fails: number; blockedUntil: number }

const STATE_KEY = 'pairlens:security.lock-state'
const ATTEMPTS_KEY = 'pairlens:security.lock-attempts'

/**
 * How recently the app must have been alive for a boot to count as a reload
 * (or a sibling window) rather than a cold start. The manager stamps
 * `lastActiveAt` on its 15s tick, so this only has to clear that interval
 * with room to spare.
 */
const STARTUP_GRACE_MS = 45_000

/** Failures before the backoff arms. */
const ATTEMPT_LIMIT = 5
const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 300_000

/** A challenge nobody answers must not pin an order promise forever. */
const CHALLENGE_TIMEOUT_MS = 120_000

type PersistedLockState = {
  locked: boolean
  since: number
  reason: LockReason
  lastActiveAt: number
  /**
   * When identity was last proved. The periodic trigger measures against this,
   * so it has to survive a reload and a second window — kept in memory only,
   * "lock every 4 hours" simply never fires for anyone who reloads more often
   * than that, while the mirror still reports one continuous session.
   */
  lastUnlockedAt: number
}

const UNLOCKED: LockUiState = { mode: 'unlocked' }

let state: LockUiState = UNLOCKED
let initialized = false
let lastUnlockedAt = Date.now()
/** When the user last proved identity — feeds the before-trade grace. */
let lastVerifiedAt = 0
let lastActiveAt = Date.now()

const listeners = new Set<() => void>()

let pendingChallenge: {
  promise: Promise<boolean>
  resolve: (ok: boolean) => void
  timer: ReturnType<typeof setTimeout>
} | null = null

function notify(): void {
  for (const listener of [...listeners]) listener()
}

// ── Persistence ──────────────────────────────────────────────────────

function readMirror(): PersistedLockState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedLockState>
    if (typeof parsed.locked !== 'boolean') return null
    return {
      locked: parsed.locked,
      since: typeof parsed.since === 'number' ? parsed.since : 0,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'manual',
      lastActiveAt:
        typeof parsed.lastActiveAt === 'number' ? parsed.lastActiveAt : 0,
      lastUnlockedAt:
        typeof parsed.lastUnlockedAt === 'number' ? parsed.lastUnlockedAt : 0,
    }
  } catch {
    return null
  }
}

function writeMirror(): void {
  if (typeof window === 'undefined') return
  const current = state
  const payload: PersistedLockState =
    current.mode === 'locked'
      ? {
          locked: true,
          since: current.since,
          reason: current.reason,
          lastActiveAt,
          lastUnlockedAt,
        }
      : {
          locked: false,
          since: 0,
          reason: 'manual',
          lastActiveAt,
          lastUnlockedAt,
        }
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(payload))
  } catch {
    // Quota — in-memory state still governs this window.
  }
}

/** Called from the manager's tick so a cold boot is distinguishable. */
export function stampActive(now: number = Date.now()): void {
  lastActiveAt = now
  writeMirror()
}

/** Wipe the persisted lock state — used by the destructive reset. */
export function clearLockState(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STATE_KEY)
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    // The reset reloads immediately after; nothing else to do.
  }
}

// ── Init ─────────────────────────────────────────────────────────────

function ensureInit(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const config = getLockConfig()
  const mirror = readMirror()
  if (mirror) {
    lastActiveAt = mirror.lastActiveAt
    // A reload is not a fresh unlock: restoring this is what lets the periodic
    // trigger measure a real session rather than restarting its clock every
    // ⌘R and every new window.
    if (mirror.lastUnlockedAt > 0) lastUnlockedAt = mirror.lastUnlockedAt
  }

  if (config.enabled) {
    if (mirror?.locked) {
      state = { mode: 'locked', reason: mirror.reason, since: mirror.since }
    } else {
      // A reload, or a second window opened while the app was already
      // running, must not re-lock; a genuine cold start should.
      const wasRecentlyAlive =
        mirror != null && Date.now() - mirror.lastActiveAt < STARTUP_GRACE_MS
      if (config.triggers.onStartup && !wasRecentlyAlive) {
        state = { mode: 'locked', reason: 'startup', since: Date.now() }
      }
    }
  }
  writeMirror()

  onLockMessage((message) => {
    if (message.type === 'lock') applyLock(message.reason, false)
    else if (message.type === 'unlock') applyUnlock(false)
    else if (message.type === 'attempts') {
      attempts = { fails: message.fails, blockedUntil: message.blockedUntil }
      notify()
    } else if (message.type === 'reset') {
      // Another window erased this device. Everything this one holds — the
      // zustand stores, every usePersistedState value, the cached lock config
      // — is a copy of data that no longer exists, and it would re-persist all
      // of it (and self-heal its lock off against the now-deleted verifier).
      // Reload into the first-run state the reset just created.
      window.location.replace('/')
    }
  })

  // Turning the lock off elsewhere (or a fresh install after a reset) must
  // not leave this window staring at an overlay it can never dismiss.
  subscribeLockConfig(() => {
    if (!getLockConfig().enabled && state.mode !== 'unlocked') {
      applyUnlock(false)
    }
  })
}

// ── Reads ────────────────────────────────────────────────────────────

export function getLockState(): LockUiState {
  ensureInit()
  return state
}

/** Hot path: called from three window-level keydown handlers. */
export function isTerminalLocked(): boolean {
  ensureInit()
  return state.mode === 'locked'
}

export function subscribeLock(listener: () => void): () => void {
  ensureInit()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLockState(): LockUiState {
  return useSyncExternalStore(subscribeLock, getLockState, () => UNLOCKED)
}

export function getLastUnlockedAt(): number {
  return lastUnlockedAt
}

// ── Transitions ──────────────────────────────────────────────────────

function applyLock(reason: LockReason, broadcast: boolean): void {
  if (state.mode === 'locked') return
  // A full lock supersedes a trade challenge: the order is abandoned, not
  // queued behind the overlay.
  settleChallenge(false, 'failed')
  state = { mode: 'locked', reason, since: Date.now() }
  lastVerifiedAt = 0
  writeMirror()
  // Never stack two focus traps, and never drop the user back into a
  // half-filled settings form on unlock.
  useSettingsDialogStore.getState().close()
  notify()
  if (broadcast) {
    postLock({ type: 'lock', reason, at: Date.now() })
    track('security_locked', { reason })
  }
}

function applyUnlock(broadcast: boolean): void {
  if (state.mode === 'unlocked') return
  const reason = state.mode === 'locked' ? state.reason : 'manual'
  // A blanket unlock (config turned off, remote unlock) is not an answer to
  // a pending trade challenge — drop that order rather than wave it through.
  settleChallenge(false, 'cancelled')
  state = UNLOCKED
  lastUnlockedAt = Date.now()
  lastVerifiedAt = Date.now()
  lastActiveAt = Date.now()
  clearAttempts(broadcast)
  writeMirror()
  notify()
  if (broadcast) {
    postLock({ type: 'unlock', at: Date.now() })
    track('security_unlocked', { reason })
  }
}

/** Lock every window. Idempotent, and a no-op while the lock is off. */
export function lockNow(reason: LockReason): void {
  ensureInit()
  if (!getLockConfig().enabled) return
  applyLock(reason, true)
}

/** Unlock every window. Callers must have verified the password first. */
export function unlockNow(): void {
  ensureInit()
  applyUnlock(true)
}

// ── Attempt backoff ──────────────────────────────────────────────────

let attempts: AttemptState | null = null

function readAttempts(): AttemptState {
  if (attempts) return attempts
  attempts = { fails: 0, blockedUntil: 0 }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(ATTEMPTS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AttemptState>
        attempts = {
          fails: typeof parsed.fails === 'number' ? parsed.fails : 0,
          blockedUntil:
            typeof parsed.blockedUntil === 'number' ? parsed.blockedUntil : 0,
        }
      }
    } catch {
      // Corrupt counter — start clean rather than lock the user out.
    }
  }
  return attempts
}

function persistAttempts(broadcast: boolean): void {
  const next = readAttempts()
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next))
    } catch {
      // In-memory penalty still applies to this window.
    }
  }
  if (broadcast) {
    postLock({
      type: 'attempts',
      fails: next.fails,
      blockedUntil: next.blockedUntil,
    })
  }
  notify()
}

export function getAttempts(): AttemptState {
  return readAttempts()
}

/** Milliseconds left on the lockout, 0 when unblocked. */
export function blockedForMs(now: number = Date.now()): number {
  return Math.max(0, readAttempts().blockedUntil - now)
}

/**
 * Doubling lockout after five misses, capped at five minutes. On top of a
 * PBKDF2 verify that already costs a good fraction of a second, this makes
 * guessing pointless without ever bricking a legitimate user for long.
 */
export function recordFailedAttempt(): AttemptState {
  const current = readAttempts()
  const fails = current.fails + 1
  const over = fails - ATTEMPT_LIMIT
  const blockedUntil =
    over >= 0
      ? Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** over, BACKOFF_MAX_MS)
      : 0
  attempts = { fails, blockedUntil }
  persistAttempts(true)
  return attempts
}

export function clearAttempts(broadcast = true): void {
  attempts = { fails: 0, blockedUntil: 0 }
  persistAttempts(broadcast)
}

// ── Before-trade challenge ───────────────────────────────────────────

export type ChallengeOutcome = 'passed' | 'failed' | 'cancelled'

function settleChallenge(ok: boolean, outcome: ChallengeOutcome): void {
  const pending = pendingChallenge
  if (!pending) return
  pendingChallenge = null
  clearTimeout(pending.timer)
  if (ok) lastVerifiedAt = Date.now()
  track('security_trade_challenge', { outcome })
  pending.resolve(ok)
}

/**
 * Identity check in front of an order.
 *
 * Resolves `true` immediately when the lock is off, the trigger is off, or
 * the grace window is still open. Otherwise it flips the store to
 * `challenge` and the dialog resolves it. Resolving `false` is what the
 * guarded order path turns into a cancelled order — never a silent success.
 */
export function requireUnlockForTrade(): Promise<boolean> {
  ensureInit()
  const config = getLockConfig()
  if (!config.enabled || !config.triggers.beforeTrade.enabled) {
    return Promise.resolve(true)
  }
  // Already fully locked: nobody is there to answer, so abandon the order
  // rather than queue it behind the overlay.
  if (state.mode === 'locked') return Promise.resolve(false)

  const graceMs = config.triggers.beforeTrade.graceMinutes * 60_000
  if (graceMs > 0 && Date.now() - lastVerifiedAt < graceMs) {
    return Promise.resolve(true)
  }

  // Two orders racing share one prompt.
  if (pendingChallenge) return pendingChallenge.promise

  let resolve!: (ok: boolean) => void
  const promise = new Promise<boolean>((res) => {
    resolve = res
  })
  const timer = setTimeout(() => {
    if (state.mode === 'challenge') {
      state = UNLOCKED
      notify()
    }
    settleChallenge(false, 'failed')
  }, CHALLENGE_TIMEOUT_MS)
  pendingChallenge = { promise, resolve, timer }
  state = { mode: 'challenge', prompt: 'trade' }
  notify()
  return promise
}

/** Called by the challenge dialog once the password checked out. */
export function passTradeChallenge(): void {
  if (state.mode === 'challenge') {
    state = UNLOCKED
    notify()
  }
  settleChallenge(true, 'passed')
}

export function cancelTradeChallenge(): void {
  if (state.mode === 'challenge') {
    state = UNLOCKED
    notify()
  }
  settleChallenge(false, 'cancelled')
}
