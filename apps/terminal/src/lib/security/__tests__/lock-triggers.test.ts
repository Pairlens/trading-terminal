// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `evaluateTriggers` is a wall-clock comparison, not a timer callback, and
 * that is the whole point: a suspended machine stops firing timeouts and
 * then delivers them arbitrarily late. These cases pin the behaviour that
 * makes a frozen-then-resumed clock produce exactly one lock, and that a
 * disabled trigger stays silent no matter how much time passed.
 */
import { describe, expect, test } from 'bun:test'

import { evaluateTriggers } from '../lock-manager'
import { DEFAULT_LOCK_CONFIG } from '../lock-config'
import type { LockTriggers } from '../lock-config'

const MINUTE = 60_000

function triggers(patch: Partial<LockTriggers> = {}): LockTriggers {
  return { ...DEFAULT_LOCK_CONFIG.triggers, ...patch }
}

describe('evaluateTriggers', () => {
  test('idle fires exactly at the boundary, not before', () => {
    const config = triggers({ onIdle: { enabled: true, minutes: 15 } })
    const now = 1_000_000_000

    expect(
      evaluateTriggers(now, {
        lastActivityAt: now - 15 * MINUTE + 1,
        lastUnlockedAt: now,
        triggers: config,
      }),
    ).toBeNull()

    expect(
      evaluateTriggers(now, {
        lastActivityAt: now - 15 * MINUTE,
        lastUnlockedAt: now,
        triggers: config,
      }),
    ).toBe('idle')
  })

  test('periodic fires on time since unlock, regardless of activity', () => {
    const config = triggers({
      onIdle: { enabled: false, minutes: 15 },
      periodic: { enabled: true, minutes: 240 },
    })
    const now = 1_000_000_000

    // Constantly active, but four hours since the last unlock.
    expect(
      evaluateTriggers(now, {
        lastActivityAt: now,
        lastUnlockedAt: now - 240 * MINUTE,
        triggers: config,
      }),
    ).toBe('periodic')

    expect(
      evaluateTriggers(now, {
        lastActivityAt: now,
        lastUnlockedAt: now - 239 * MINUTE,
        triggers: config,
      }),
    ).toBeNull()
  })

  test('idle wins when both fire — the more specific reason to show', () => {
    const config = triggers({
      onIdle: { enabled: true, minutes: 15 },
      periodic: { enabled: true, minutes: 60 },
    })
    const now = 1_000_000_000
    expect(
      evaluateTriggers(now, {
        lastActivityAt: now - 10 * 60 * MINUTE,
        lastUnlockedAt: now - 10 * 60 * MINUTE,
        triggers: config,
      }),
    ).toBe('idle')
  })

  test('disabled triggers never fire, however long it has been', () => {
    const config = triggers({
      onIdle: { enabled: false, minutes: 1 },
      periodic: { enabled: false, minutes: 60 },
    })
    const now = 1_000_000_000
    expect(
      evaluateTriggers(now, {
        lastActivityAt: 0,
        lastUnlockedAt: 0,
        triggers: config,
      }),
    ).toBeNull()
  })

  test('a frozen-then-resumed clock produces one lock, not a backlog', () => {
    // The laptop lid was shut for two hours: the 15s tick simply arrives
    // very late with a very old activity stamp.
    const config = triggers({ onIdle: { enabled: true, minutes: 15 } })
    const resumedAt = 1_000_000_000
    const lastActivityAt = resumedAt - 120 * MINUTE

    expect(
      evaluateTriggers(resumedAt, {
        lastActivityAt,
        lastUnlockedAt: lastActivityAt,
        triggers: config,
      }),
    ).toBe('idle')

    // The manager only calls this while unlocked, so the follow-up tick is
    // the interesting one: after the user unlocks, activity is fresh and
    // nothing re-fires.
    expect(
      evaluateTriggers(resumedAt + 15_000, {
        lastActivityAt: resumedAt,
        lastUnlockedAt: resumedAt,
        triggers: config,
      }),
    ).toBeNull()
  })

  test('activity in another window keeps this one unlocked', () => {
    // The cross-window heartbeat advances lastActivityAt even when this
    // window saw no pointer events at all.
    const config = triggers({ onIdle: { enabled: true, minutes: 15 } })
    const now = 1_000_000_000
    expect(
      evaluateTriggers(now, {
        lastActivityAt: now - MINUTE,
        lastUnlockedAt: now - 60 * MINUTE,
        triggers: config,
      }),
    ).toBeNull()
  })
})
