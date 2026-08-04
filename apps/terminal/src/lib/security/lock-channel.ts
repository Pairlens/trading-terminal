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
   * This device was erased by the destructive reset. Every other window is
   * holding a full in-memory copy of what was just deleted and would write it
   * straight back, so they reload into the first-run state instead.
   */
  | { type: 'reset'; at: number }

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
