// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Window leader election — exactly one window per app instance runs
 * process-wide side effects (notification evaluation, OS alerts) so they
 * don't fire once per open window.
 *
 * Uses the Web Locks API: the first window to request the lock becomes
 * leader and holds it until closed; the browser then grants the lock to
 * the next waiting window, which takes over automatically. Environments
 * without Web Locks treat every window as leader — identical to today's
 * single-window behavior.
 */

type LeaderListener = (isLeader: boolean) => void

const LOCK_NAME = 'pairlens:window-leader'

let leader = false
let requested = false
const listeners = new Set<LeaderListener>()

function becomeLeader(): void {
  if (leader) return
  leader = true
  for (const fn of listeners) fn(true)
}

function requestLeadership(): void {
  if (requested || typeof navigator === 'undefined') return
  requested = true

  const locks = (
    navigator as Navigator & {
      locks?: {
        request: (
          name: string,
          callback: () => Promise<never>,
        ) => Promise<unknown>
      }
    }
  ).locks

  if (!locks) {
    becomeLeader()
    return
  }

  // The callback's promise never resolves — the lock is held for the
  // lifetime of this window and auto-released when it closes.
  void locks
    .request(LOCK_NAME, () => {
      becomeLeader()
      return new Promise<never>(() => {})
    })
    .catch(() => {
      // Lock request failed (e.g. document destroyed) — stay follower.
    })
}

/** True when this window currently runs process-wide side effects. */
export function isWindowLeader(): boolean {
  return leader
}

/**
 * Subscribe to leadership. The callback fires with `true` as soon as this
 * window becomes leader (immediately if it already is). Leadership is never
 * revoked while a window lives, so `false` is never delivered after `true`.
 * Returns an unsubscribe function.
 */
export function onWindowLeader(cb: LeaderListener): () => void {
  // Deliver the current state first: if leadership arrives during
  // requestLeadership() below (sync no-locks fallback), becomeLeader()
  // notifies cb via the listener set — invoking it here too would double-fire.
  const alreadyLeader = leader
  listeners.add(cb)
  if (alreadyLeader) cb(true)
  requestLeadership()
  return () => {
    listeners.delete(cb)
  }
}
