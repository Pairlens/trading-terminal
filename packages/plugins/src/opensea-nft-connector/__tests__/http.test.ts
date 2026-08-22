// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The read budget, over a virtual clock.
 *
 * Nothing here touches the network: what is pinned is the SHAPE of the pacing,
 * because the bug it replaces was a limiter whose window could not express the
 * ceiling it was sized against (100 a minute is 6000 an hour against a ~600
 * budget, so it never engaged and the user met OpenSea's real limit instead).
 */
import { describe, expect, test } from 'bun:test'

import { BURST_BUDGET, HOURLY_BUDGET, createOpenSeaBudget } from '../http'

/**
 * A clock that only moves when something waits, so an hour of pacing costs a
 * test nothing and the delays are readable afterwards.
 */
function virtualClock() {
  let now = 0
  const waits: Array<number> = []
  return {
    waits,
    now: () => now,
    delay: async (ms: number) => {
      waits.push(ms)
      now += ms
    },
  }
}

describe('the read budget', () => {
  test('is sized under the hourly ceiling, not ten times over it', () => {
    expect(HOURLY_BUDGET).toBeLessThanOrEqual(600)
    expect(HOURLY_BUDGET).toBeGreaterThanOrEqual(400)
  })

  test('a cold board opens without being paced', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    for (let i = 0; i < BURST_BUDGET; i += 1) await budget.acquire()
    expect(clock.waits).toHaveLength(0)
    expect(clock.now()).toBe(0)
  })

  test('the read past the burst is spaced, not refused', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    for (let i = 0; i < BURST_BUDGET + 1; i += 1) await budget.acquire()
    expect(clock.waits).toHaveLength(1)
    // Only until the oldest read leaves the short window, never the hour.
    expect(clock.now()).toBeLessThan(60_000)
  })

  test('the hourly ceiling is what actually binds a steady state', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    for (let i = 0; i < HOURLY_BUDGET; i += 1) await budget.acquire()
    const spentOnBursts = clock.now()
    // The whole hourly budget went out inside a few minutes of burst pacing,
    // which is exactly what a per-minute limiter would have allowed forever.
    expect(spentOnBursts).toBeLessThan(600_000)

    await budget.acquire()
    // The next read waits out the rest of the hour instead of spending a key
    // the board would then have to show throttle banners for.
    expect(clock.now()).toBeGreaterThanOrEqual(3_600_000)
  })

  test('a 429 stops both windows, it does not merely slow one', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    budget.cooldown(30_000)
    await budget.acquire()
    expect(clock.now()).toBeGreaterThanOrEqual(30_000)
  })
})
