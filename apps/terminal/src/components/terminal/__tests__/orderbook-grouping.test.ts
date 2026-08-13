// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Auto grouping: which tick the order book pane picks for a given raw book.
 *
 * The rule has two halves and they pull against each other. "Largest tick that
 * still fills the rows" is what stops a dense book from rendering a ladder of
 * dust, and `MAX_AUTO_BAND_FRACTION` is what stops a book that reaches most of
 * the way to zero from quoting a price range nobody trades in. Both halves have
 * shipped as bugs, so both are pinned here.
 */
import { describe, expect, it } from 'bun:test'

import type { OrderBookLevel } from '@/hooks/use-orderbook-stream'
import {
  MAX_AUTO_BAND_FRACTION,
  computeAutoTickIndex,
  computeTickOptions,
} from '@/components/terminal/orderbook-pane'

const ROWS = 13

/** A bid ladder descending from `best`, one level every `step`. */
function ladder(
  best: number,
  step: number,
  count: number,
): Array<OrderBookLevel> {
  return Array.from({ length: count }, (_, i) => ({
    price: best - i * step,
    size: 1,
  }))
}

describe('computeAutoTickIndex', () => {
  it('groups a dense book up to the coarsest tick that still fills the rows', () => {
    // 500 cent-spaced levels under $63k: plenty of room to coarsen.
    const options = computeTickOptions(0.01, 100_000)
    const index = computeAutoTickIndex(options, ladder(63_000, 0.01, 500), ROWS)
    expect(options[index]).toBeGreaterThan(0.01)
    // Every row lands on a distinct bucket.
    expect(options[index]).toBeLessThanOrEqual(5 / ROWS)
  })

  it('leaves a book with fewer raw levels than rows ungrouped', () => {
    const options = computeTickOptions(0.01, 100_000)
    expect(computeAutoTickIndex(options, ladder(63_000, 0.01, 5), ROWS)).toBe(0)
  })

  it('never spans more than MAX_AUTO_BAND_FRACTION of the price', () => {
    // A ladder that reaches nearly to zero — the shape a venue pushes for a
    // sub-cent coin whose entire book fits in one frame.
    const best = 0.000012
    const options = computeTickOptions(1e-8, 0.0001)
    const levels = ladder(best, 4e-8, 280)
    const tick = options[computeAutoTickIndex(options, levels, ROWS)]
    expect(tick * ROWS).toBeLessThanOrEqual(best * MAX_AUTO_BAND_FRACTION)
  })

  it('leaves a liquid book well clear of the band cap', () => {
    // BTC-scale books land two decades under the cap, so the guard added for
    // the degenerate case must not perturb them.
    const best = 63_000
    const options = computeTickOptions(0.01, 100_000)
    const tick =
      options[computeAutoTickIndex(options, ladder(best, 0.01, 500), ROWS)]
    expect(tick * ROWS).toBeLessThan(best * MAX_AUTO_BAND_FRACTION * 0.1)
  })

  it('falls back to the finest tick when every option overshoots the cap', () => {
    // Exchange tick alone already spans more than the cap allows.
    const options = [0.5, 1, 2]
    const levels = ladder(1, 0.5, 40)
    expect(computeAutoTickIndex(options, levels, ROWS)).toBe(0)
  })
})
