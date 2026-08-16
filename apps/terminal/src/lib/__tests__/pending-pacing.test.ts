// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  PENDING_MIN_VISIBLE_MS,
  PENDING_SHOW_AFTER_MS,
  pendingFloorDelay,
} from '@/lib/pending-pacing'

const FLOOR = PENDING_SHOW_AFTER_MS + PENDING_MIN_VISIBLE_MS

describe('pendingFloorDelay', () => {
  it('never holds a chunk that beat the show threshold', () => {
    // Nothing was painted, so there is no flash to prevent and no reason to
    // make the fast path slower.
    expect(pendingFloorDelay(0)).toBe(0)
    expect(pendingFloorDelay(PENDING_SHOW_AFTER_MS - 1)).toBe(0)
    expect(pendingFloorDelay(PENDING_SHOW_AFTER_MS)).toBe(0)
  })

  it('holds a chunk that lands just after it, so the skeleton cannot flash', () => {
    // This is the whole point: 1ms past the threshold the skeleton is on
    // screen, and showing it for 1ms is worse than not showing it at all.
    expect(pendingFloorDelay(PENDING_SHOW_AFTER_MS + 1)).toBe(
      FLOOR - PENDING_SHOW_AFTER_MS - 1,
    )
    expect(pendingFloorDelay(FLOOR - 1)).toBe(1)
  })

  it('tops the skeleton up to exactly the minimum visible window', () => {
    for (const elapsed of [200, 250, 300, 350, 399]) {
      const visible =
        elapsed - PENDING_SHOW_AFTER_MS + pendingFloorDelay(elapsed)
      expect(visible).toBe(PENDING_MIN_VISIBLE_MS)
    }
  })

  it('never delays a chunk that already outlasted the window', () => {
    expect(pendingFloorDelay(FLOOR)).toBe(0)
    expect(pendingFloorDelay(FLOOR + 1)).toBe(0)
    expect(pendingFloorDelay(10_000)).toBe(0)
  })

  it('adds no more latency than the window itself', () => {
    for (let elapsed = 0; elapsed <= 1000; elapsed += 7) {
      const held = pendingFloorDelay(elapsed)
      expect(held).toBeGreaterThanOrEqual(0)
      expect(held).toBeLessThan(PENDING_MIN_VISIBLE_MS)
    }
  })
})
