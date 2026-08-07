// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { findArbEdge, premiumPct, summarizeQuotes } from '../venue-spread'
import type { VenuePrice } from '../venue-spread'

function q(
  market: string,
  last: number | null,
  bid: number | null = null,
  ask: number | null = null,
): VenuePrice {
  return { market, last, bid, ask }
}

describe('summarizeQuotes', () => {
  test('finds the cheapest and dearest venue and the gap between them', () => {
    const s = summarizeQuotes([
      q('okx', 100),
      q('binance', 102),
      q('kraken', 101),
    ])

    expect(s.low).toEqual({ market: 'okx', price: 100 })
    expect(s.high).toEqual({ market: 'binance', price: 102 })
    expect(s.spreadAbs).toBe(2)
    expect(s.spreadPct).toBeCloseTo(2, 10)
    expect(s.median).toBe(101)
    expect(s.pricedCount).toBe(3)
  })

  test('averages the middle pair for an even count', () => {
    expect(summarizeQuotes([q('a', 10), q('b', 20)]).median).toBe(15)
  })

  test('skips unpriced venues instead of ranking them as zero', () => {
    const s = summarizeQuotes([q('okx', 100), q('gate', null), q('mexc', 0)])

    expect(s.low).toEqual({ market: 'okx', price: 100 })
    expect(s.high).toEqual({ market: 'okx', price: 100 })
    expect(s.pricedCount).toBe(1)
    expect(s.spreadPct).toBe(0)
  })

  test('reports nothing when no venue has a price', () => {
    const s = summarizeQuotes([q('okx', null), q('gate', null)])

    expect(s.low).toBeNull()
    expect(s.high).toBeNull()
    expect(s.median).toBeNull()
    expect(s.pricedCount).toBe(0)
  })
})

describe('premiumPct', () => {
  test('signs the distance from the reference', () => {
    expect(premiumPct(102, 100)).toBeCloseTo(2, 10)
    expect(premiumPct(98, 100)).toBeCloseTo(-2, 10)
  })

  test('stays null when either side is missing', () => {
    expect(premiumPct(null, 100)).toBeNull()
    expect(premiumPct(100, null)).toBeNull()
    expect(premiumPct(100, 0)).toBeNull()
  })
})

describe('findArbEdge', () => {
  test('buys the lowest ask and sells the highest bid', () => {
    const edge = findArbEdge([
      q('okx', 100, 99.95, 100.05),
      q('binance', 103, 102.92, 103.04),
      q('kraken', 101, 100.94, 101.03),
    ])

    expect(edge).not.toBeNull()
    expect(edge?.buyMarket).toBe('okx')
    expect(edge?.buyAsk).toBe(100.05)
    expect(edge?.sellMarket).toBe('binance')
    expect(edge?.sellBid).toBe(102.92)
    expect(edge?.edgePct).toBeCloseTo(((102.92 - 100.05) / 100.05) * 100, 10)
  })

  test('reports a negative edge rather than hiding it', () => {
    // The normal case: books do not cross, so the round trip loses money and
    // the pane has to say so instead of showing nothing.
    const edge = findArbEdge([
      q('okx', 100, 99.91, 100.03),
      q('binance', 100, 99.97, 100.09),
    ])

    expect(edge?.buyMarket).toBe('okx')
    expect(edge?.sellMarket).toBe('binance')
    expect(edge?.edgePct).toBeLessThan(0)
  })

  test('ignores venues that report no book', () => {
    // MEXC sends zeroes; with only one real book left there is no round trip.
    expect(
      findArbEdge([q('okx', 100, 99.95, 100.05), q('mexc', 105, 0, 0)]),
    ).toBeNull()
  })

  test('never sells into the AMM providers fabricated ±0.1% book', () => {
    // `base` would carry both the best bid and the widest apparent edge, but
    // its book is `last * 0.999 / last * 1.001` — an AMM mid in disguise.
    const last = 120
    const edge = findArbEdge([
      q('okx', 100, 99.95, 100.05),
      q('binance', 100.5, 100.45, 100.55),
      q('base', last, last * 0.999, last * 1.001),
    ])

    expect(edge?.buyMarket).toBe('okx')
    expect(edge?.sellMarket).toBe('binance')
  })

  test('keeps a genuinely wide book — illiquid is not fabricated', () => {
    // 0.39% wide, far past the fabricated pattern, but its shape is nothing
    // like `last * 0.999 / last * 1.001`. Illiquid venues are where the edge
    // usually is, so a width test here would throw away the signal.
    const edge = findArbEdge([
      q('okx', 100, 99.95, 100.05),
      q('upbit', 104, 103.5, 103.9),
    ])

    expect(edge?.buyMarket).toBe('okx')
    expect(edge?.sellMarket).toBe('upbit')
  })

  test('drops a real book that happens to sit at exactly ±0.1%', () => {
    // The deliberate false negative. Understating the edge costs a missed
    // opportunity; claiming one against a fabricated quote costs a trade.
    expect(
      findArbEdge([
        q('okx', 100, 99.9, 100.1),
        q('binance', 101, 100.94, 101.03),
      ]),
    ).toBeNull()
  })

  test('never proposes a round trip inside one venue', () => {
    expect(findArbEdge([q('okx', 100, 99.95, 100.05)])).toBeNull()
    expect(
      findArbEdge([q('okx', 100, 99.95, 100.05), q('gate', null, null, null)]),
    ).toBeNull()
    // One venue holding both the best bid and the best ask is not an edge.
    expect(
      findArbEdge([
        q('okx', 100, 99.99, 100.01),
        q('binance', 100, 99.95, 100.2),
      ]),
    ).toBeNull()
  })

  test('drops a crossed book rather than treating it as free money', () => {
    expect(
      findArbEdge([
        q('okx', 100, 100.5, 100.05),
        q('binance', 100, 99.95, 100.05),
      ]),
    ).toBeNull()
  })
})
