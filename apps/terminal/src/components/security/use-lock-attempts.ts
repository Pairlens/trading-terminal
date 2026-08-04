// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'

import { blockedForMs, subscribeLock } from '@/lib/security/lock-store'

/**
 * Seconds left on the brute-force lockout.
 *
 * Lifted out of the lock overlay so the vault prompts share the counter rather
 * than each keeping their own — which matters because the backoff itself is
 * shared: a wrong vault password delays the screen unlock and vice versa. Two
 * copies of this hook would eventually disagree about how long is left, and
 * the one that disagreed downward would let a guess through.
 *
 * Ticks on a plain interval and setState-bails when the value hasn't changed,
 * so an unblocked prompt re-renders zero times.
 */
export function useBlockedSeconds(): number {
  const [seconds, setSeconds] = React.useState(() =>
    Math.max(0, Math.ceil(blockedForMs() / 1000)),
  )
  React.useEffect(() => {
    const sync = () => setSeconds(Math.max(0, Math.ceil(blockedForMs() / 1000)))
    // Another window's failed attempt counts against this one too.
    const unsubscribe = subscribeLock(sync)
    const timer = setInterval(sync, 500)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [])
  return seconds
}
