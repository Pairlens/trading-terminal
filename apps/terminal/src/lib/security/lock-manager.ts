// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one timer, the one wake subscription, and the activity listeners that
 * decide when to lock.
 *
 * Two rules shape this file:
 *
 * 1. Nothing here touches React state. Activity tracking runs on
 *    `pointermove`; writing a state variable there would re-render the root
 *    tree on every mouse movement, which is exactly what the per-tick render
 *    invariant exists to prevent. It is a module-level `let` and a
 *    `Date.now()` compare.
 * 2. Everything time-based is a wall-clock comparison inside a repeating
 *    tick, never "the timeout fired, therefore N minutes elapsed". Timers do
 *    not run while the OS is suspended and come back arbitrarily late.
 */

import { wakeMonitor } from '@pairlens/market-engine/wake-monitor'

import { onLockMessage, postLock } from './lock-channel'
import { getLockConfig } from './lock-config'
import {
  getLastUnlockedAt,
  getLockState,
  lockNow,
  stampActive,
} from './lock-store'
import type { LockReason, LockTriggers } from './lock-config'

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
] as const

/** Local write throttle — a mousemove burst must cost one comparison. */
const ACTIVITY_THROTTLE_MS = 1_000
/** Cross-window heartbeat, so an idle second monitor can't lock the one
 * you're typing in. */
const ACTIVITY_BROADCAST_MS = 60_000
/** The single evaluation tick. */
const EVAL_INTERVAL_MS = 15_000
/**
 * WakeMonitor's own 20s threshold is tuned for killing half-open sockets,
 * where a false positive costs one reconnect. Here it would cost the user
 * their password, so the lock filters harder — without raising the shared
 * monitor's threshold, which would regress WS liveness recovery.
 */
const WAKE_MIN_GAP_MS = 60_000

let lastActivityAt = Date.now()
let lastBroadcastAt = 0

/**
 * Which trigger, if any, fires right now. Pure on purpose: this is the part
 * worth unit-testing, and it must behave identically whether the clock
 * advanced smoothly or jumped after a suspend.
 */
export function evaluateTriggers(
  now: number,
  ctx: {
    lastActivityAt: number
    lastUnlockedAt: number
    triggers: LockTriggers
  },
): LockReason | null {
  const { triggers } = ctx
  if (
    triggers.onIdle.enabled &&
    now - ctx.lastActivityAt >= triggers.onIdle.minutes * 60_000
  ) {
    // Idle wins ties: it is the more specific answer to "why am I looking at
    // a password prompt".
    return 'idle'
  }
  if (
    triggers.periodic.enabled &&
    now - ctx.lastUnlockedAt >= triggers.periodic.minutes * 60_000
  ) {
    return 'periodic'
  }
  return null
}

let stop: (() => void) | null = null

/** Idempotent. Wired from the root shell's lazy-import effect. */
export function initLockManager(): () => void {
  if (stop) return stop
  if (typeof window === 'undefined') return () => {}

  const onActivity = () => {
    const now = Date.now()
    if (now - lastActivityAt < ACTIVITY_THROTTLE_MS) return
    lastActivityAt = now
    if (now - lastBroadcastAt >= ACTIVITY_BROADCAST_MS) {
      lastBroadcastAt = now
      postLock({ type: 'activity', at: now })
    }
  }

  for (const type of ACTIVITY_EVENTS) {
    window.addEventListener(type, onActivity, { passive: true })
  }

  const unsubMessages = onLockMessage((message) => {
    if (message.type === 'activity') {
      lastActivityAt = Math.max(lastActivityAt, message.at)
    } else if (message.type === 'unlock') {
      lastActivityAt = Math.max(lastActivityAt, message.at)
    }
  })

  const timer = setInterval(() => {
    const now = Date.now()
    const config = getLockConfig()
    // Nothing to evaluate, and nothing to record: an install that never
    // turned the lock on shouldn't be writing to localStorage every 15s.
    if (!config.enabled) return
    // Doubles as the "the app was alive at" stamp a cold boot is measured
    // against — see lock-store's startup handling.
    stampActive(now)
    if (getLockState().mode !== 'unlocked') return
    const reason = evaluateTriggers(now, {
      lastActivityAt,
      lastUnlockedAt: getLastUnlockedAt(),
      triggers: config.triggers,
    })
    if (reason) lockNow(reason)
  }, EVAL_INTERVAL_MS)

  const unsubWake = wakeMonitor.subscribe((event) => {
    if (event.reason !== 'resume') return
    if (event.gapMs < WAKE_MIN_GAP_MS) return
    const config = getLockConfig()
    if (!config.enabled || !config.triggers.onWake) return
    lockNow('wake')
  })

  stop = () => {
    for (const type of ACTIVITY_EVENTS) {
      window.removeEventListener(type, onActivity)
    }
    unsubMessages()
    unsubWake()
    clearInterval(timer)
    stop = null
  }
  return stop
}
