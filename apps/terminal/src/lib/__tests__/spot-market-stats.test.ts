// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import type { TopCoin } from '@pairlens/shared/instrument-types'
import { summarizeMarket } from '@/lib/spot-market-stats'

function coin(partial: Partial<TopCoin> & { symbol: string }): TopCoin {
  return {
    rank: 1,
    name: partial.symbol,
    slug: partial.symbol.toLowerCase(),
    price: 1,
    marketCap: 0,
    volume24h: 0,
    percentChange1h: 0,
    percentChange24h: 0,
    percentChange7d: 0,
    logoUrl: null,
    ...partial,
  }
}

describe('summarizeMarket', () => {
  test('an empty snapshot claims nothing', () => {
    const pulse = summarizeMarket([])
    expect(pulse.totalCap).toBe(0)
    expect(pulse.totalVolume24h).toBe(0)
    expect(pulse.capChange24hPct).toBeNull()
    expect(pulse.btcDominancePct).toBeNull()
    expect(pulse.breadthCount).toBe(0)
  })

  test('sums capitalisation and volume', () => {
    const pulse = summarizeMarket([
      coin({ symbol: 'BTC', marketCap: 1_200_000, volume24h: 50_000 }),
      coin({ symbol: 'ETH', marketCap: 800_000, volume24h: 30_000 }),
    ])
    expect(pulse.totalCap).toBe(2_000_000)
    expect(pulse.totalVolume24h).toBe(80_000)
    expect(pulse.btcDominancePct).toBeCloseTo(60, 10)
  })

  test('the 24h move is capitalisation-weighted, not averaged', () => {
    // A $1M coin up 10% and a $1k coin down 50%. The mean of the percentages
    // is −20%; what actually happened to the market is +9.96%.
    const pulse = summarizeMarket([
      coin({ symbol: 'BIG', marketCap: 1_100_000, percentChange24h: 10 }),
      coin({ symbol: 'TINY', marketCap: 500, percentChange24h: -50 }),
    ])
    const previous = 1_100_000 / 1.1 + 500 / 0.5
    const expected = ((1_100_500 - previous) / previous) * 100
    expect(pulse.capChange24hPct).toBeCloseTo(expected, 10)
    expect(pulse.capChange24hPct).toBeGreaterThan(9)
  })

  test('a −100% row cannot take the total with it', () => {
    const pulse = summarizeMarket([
      coin({ symbol: 'BTC', marketCap: 1_000_000, percentChange24h: 5 }),
      coin({ symbol: 'DEAD', marketCap: 10, percentChange24h: -100 }),
    ])
    expect(Number.isFinite(pulse.capChange24hPct)).toBe(true)
    expect(pulse.capChange24hPct).toBeCloseTo(5, 10)
    // It still counts as breadth: the coin did move, and it moved down.
    expect(pulse.declining).toBe(1)
  })

  test('breadth counts moves, and flat is neither', () => {
    const pulse = summarizeMarket([
      coin({ symbol: 'A', percentChange24h: 1 }),
      coin({ symbol: 'B', percentChange24h: -1 }),
      coin({ symbol: 'C', percentChange24h: -3 }),
      coin({ symbol: 'D', percentChange24h: 0 }),
    ])
    expect(pulse.advancing).toBe(1)
    expect(pulse.declining).toBe(2)
    expect(pulse.breadthCount).toBe(4)
  })

  test('dominance needs a BTC row', () => {
    const pulse = summarizeMarket([coin({ symbol: 'ETH', marketCap: 100 })])
    expect(pulse.btcDominancePct).toBeNull()
  })
})
