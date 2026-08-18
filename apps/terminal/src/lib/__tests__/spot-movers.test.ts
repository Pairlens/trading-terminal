// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import type { TopCoin } from '@pairlens/shared/instrument-types'
import {
  changeBarFraction,
  medianTurnover,
  rankEquityMovers,
  rankMovers,
  turnover,
  volatilityScore,
} from '@/lib/spot-movers'

function coin(partial: Partial<TopCoin> & { symbol: string }): TopCoin {
  return {
    rank: 1,
    name: partial.symbol,
    slug: partial.symbol.toLowerCase(),
    price: 10,
    marketCap: 1_000_000,
    volume24h: 100_000,
    percentChange1h: 0,
    percentChange24h: 0,
    percentChange7d: 0,
    logoUrl: null,
    ...partial,
  }
}

describe('turnover', () => {
  test('is 24h volume over capitalisation', () => {
    expect(
      turnover(coin({ symbol: 'A', volume24h: 250, marketCap: 1000 })),
    ).toBe(0.25)
  })

  test('withholds a figure without both sides', () => {
    expect(turnover(coin({ symbol: 'A', marketCap: 0 }))).toBeNull()
    expect(turnover(coin({ symbol: 'A', volume24h: 0 }))).toBeNull()
  })

  test('the median ignores coins that cannot report one', () => {
    const median = medianTurnover([
      coin({ symbol: 'A', volume24h: 100, marketCap: 1000 }), // 0.1
      coin({ symbol: 'B', volume24h: 300, marketCap: 1000 }), // 0.3
      coin({ symbol: 'C', volume24h: 500, marketCap: 1000 }), // 0.5
      coin({ symbol: 'D', marketCap: 0 }),
    ])
    expect(median).toBeCloseTo(0.3, 10)
  })
})

describe('rankMovers', () => {
  const universe = [
    coin({ symbol: 'UP', percentChange24h: 12, percentChange1h: 0.5 }),
    coin({ symbol: 'MILD', percentChange24h: 3, percentChange1h: 0.1 }),
    coin({ symbol: 'DOWN', percentChange24h: -8, percentChange1h: -0.2 }),
    coin({ symbol: 'FLAT', percentChange24h: 0 }),
  ]

  test('gainers exclude anything that did not rise', () => {
    const rows = rankMovers(universe, 'gainers', '24h')
    expect(rows.map((r) => r.symbol)).toEqual(['UP', 'MILD'])
  })

  test('losers are ordered by how far they fell', () => {
    const rows = rankMovers(
      [...universe, coin({ symbol: 'WORSE', percentChange24h: -20 })],
      'losers',
      '24h',
    )
    expect(rows.map((r) => r.symbol)).toEqual(['WORSE', 'DOWN'])
    expect(rows[0]!.changePct).toBe(-20)
  })

  test('the window changes what is ranked', () => {
    const rows = rankMovers(
      [
        coin({ symbol: 'HOUR', percentChange1h: 9, percentChange24h: 1 }),
        coin({ symbol: 'DAY', percentChange1h: 0.1, percentChange24h: 30 }),
      ],
      'gainers',
      '1h',
    )
    expect(rows.map((r) => r.symbol)).toEqual(['HOUR', 'DAY'])
    expect(rows[0]!.changePct).toBe(9)
  })

  test('ties break on symbol so a re-rank never shuffles rows', () => {
    const rows = rankMovers(
      [
        coin({ symbol: 'ZZZ', percentChange24h: 5 }),
        coin({ symbol: 'AAA', percentChange24h: 5 }),
      ],
      'gainers',
      '24h',
    )
    expect(rows.map((r) => r.symbol)).toEqual(['AAA', 'ZZZ'])
  })

  test('unusual ranks by turnover against the median coin', () => {
    const rows = rankMovers(
      [
        coin({ symbol: 'QUIET', volume24h: 10, marketCap: 1000 }),
        coin({ symbol: 'NORMAL', volume24h: 100, marketCap: 1000 }),
        coin({ symbol: 'BUSY', volume24h: 900, marketCap: 1000 }),
      ],
      'unusual',
      '24h',
    )
    expect(rows[0]!.symbol).toBe('BUSY')
    // Median turnover is NORMAL's 0.1, so BUSY trades nine times as much of
    // itself as the typical coin did.
    expect(rows[0]!.turnoverMultiple).toBeCloseTo(9, 10)
    expect(rows[1]!.turnoverMultiple).toBeCloseTo(1, 10)
  })

  test('a coin with no price is never ranked', () => {
    const rows = rankMovers(
      [coin({ symbol: 'NOPRICE', price: 0, percentChange24h: 99 })],
      'gainers',
      '24h',
    )
    expect(rows).toEqual([])
  })

  test('the limit is honoured', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      coin({ symbol: `C${i}`, percentChange24h: i + 1 }),
    )
    expect(rankMovers(many, 'gainers', '24h', 5)).toHaveLength(5)
  })
})

describe('volatilityScore', () => {
  test('an hour of movement outranks the same move spread over a day', () => {
    const sudden = coin({ symbol: 'SUDDEN', percentChange1h: 4 })
    const gradual = coin({ symbol: 'GRADUAL', percentChange24h: 9 })
    expect(volatilityScore(sudden)).toBeGreaterThan(volatilityScore(gradual))
  })

  test('direction does not matter, only size', () => {
    expect(volatilityScore(coin({ symbol: 'A', percentChange24h: -12 }))).toBe(
      volatilityScore(coin({ symbol: 'B', percentChange24h: 12 })),
    )
  })

  test('a week-long drift is discounted against a one-day move', () => {
    const weekly = coin({ symbol: 'WEEK', percentChange7d: 10 })
    const daily = coin({ symbol: 'DAY', percentChange24h: 5 })
    expect(volatilityScore(weekly)).toBeLessThan(volatilityScore(daily))
  })
})

describe('rankEquityMovers', () => {
  const tape = [
    { symbol: 'WMT', price: 81.24, change24h: 6.2 },
    { symbol: 'NVDA', price: 128.44, change24h: 3.12 },
    { symbol: 'DE', price: 380.1, change24h: -4.9 },
  ]

  test('ranks a broker snapshot the same way', () => {
    expect(rankEquityMovers(tape, 'gainers').map((r) => r.symbol)).toEqual([
      'WMT',
      'NVDA',
    ])
    expect(rankEquityMovers(tape, 'losers').map((r) => r.symbol)).toEqual([
      'DE',
    ])
  })

  test('refuses the tabs a bulk ticker cannot serve', () => {
    // No capitalisation in a bulk quote, so no share of float to call unusual;
    // one window, so nothing to score a volatility ranking against.
    expect(rankEquityMovers(tape, 'unusual')).toEqual([])
    expect(rankEquityMovers(tape, 'volatility')).toEqual([])
  })

  test('carries no volume or turnover it does not have', () => {
    const row = rankEquityMovers(tape, 'gainers')[0]!
    expect(row.volume24h).toBeNull()
    expect(row.turnoverMultiple).toBeNull()
  })

  const traded = [
    { symbol: 'WMT', price: 81.24, change24h: 6.2, volume24h: 2_100_000_000 },
    {
      symbol: 'NVDA',
      price: 128.44,
      change24h: 3.12,
      volume24h: 9_400_000_000,
    },
    { symbol: 'DE', price: 380.1, change24h: -4.9, volume24h: 310_000_000 },
    // A pre-market row that has not traded yet: absent, not zero.
    { symbol: 'ARKK', price: 62.1, change24h: 0.4 },
  ]

  test('ranks by traded value when the venue reports one', () => {
    expect(rankEquityMovers(traded, 'volume').map((r) => r.symbol)).toEqual([
      'NVDA',
      'WMT',
      'DE',
    ])
  })

  test('a row that has not traded is left out rather than ranked at zero', () => {
    const symbols = rankEquityMovers(traded, 'volume').map((r) => r.symbol)
    expect(symbols).not.toContain('ARKK')
  })

  test('the value rides along on every tab, not just its own', () => {
    const row = rankEquityMovers(traded, 'gainers')[0]!
    expect(row.symbol).toBe('WMT')
    expect(row.volume24h).toBe(2_100_000_000)
  })

  test('ties break on symbol so a refresh never reshuffles', () => {
    const tied = [
      { symbol: 'ZM', price: 70, change24h: 1, volume24h: 500 },
      { symbol: 'ABNB', price: 130, change24h: 1, volume24h: 500 },
    ]
    expect(rankEquityMovers(tied, 'volume').map((r) => r.symbol)).toEqual([
      'ABNB',
      'ZM',
    ])
  })
})

describe('changeBarFraction', () => {
  test('the strongest move fills the bar and the rest scale to it', () => {
    const rows = rankMovers(
      [
        coin({ symbol: 'BIG', percentChange24h: 20 }),
        coin({ symbol: 'HALF', percentChange24h: 10 }),
      ],
      'gainers',
      '24h',
    )
    expect(changeBarFraction(rows[0], rows)).toBe(1)
    expect(changeBarFraction(rows[1], rows)).toBeCloseTo(0.5, 10)
  })

  test('an all-flat list draws no bars rather than dividing by zero', () => {
    const rows = [
      {
        symbol: 'A',
        name: null,
        price: 1,
        changePct: 0,
        volume24h: null,
        turnoverMultiple: null,
        logoUrl: null,
      },
    ]
    expect(changeBarFraction(rows[0], rows)).toBe(0)
  })
})
