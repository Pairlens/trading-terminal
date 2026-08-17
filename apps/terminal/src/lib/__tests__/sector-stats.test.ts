// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import type {
  InstrumentCategory,
  TopCoin,
} from '@pairlens/shared/instrument-types'
import { summarizeSectors } from '@/lib/sector-stats'

function coin(partial: Partial<TopCoin> & { symbol: string }): TopCoin {
  return {
    rank: 1,
    name: partial.symbol,
    slug: partial.symbol.toLowerCase(),
    price: 10,
    marketCap: 1_000_000,
    volume24h: 1000,
    percentChange1h: 0,
    percentChange24h: 0,
    percentChange7d: 0,
    logoUrl: null,
    ...partial,
  }
}

function snapshot(coins: Array<TopCoin>): Map<string, TopCoin> {
  return new Map(coins.map((c) => [c.symbol.toUpperCase(), c]))
}

function membership(
  entries: Array<[InstrumentCategory, Array<string>]>,
): Map<InstrumentCategory, Array<string>> {
  return new Map(entries)
}

describe('summarizeSectors', () => {
  test('weights the sector move by capitalisation', () => {
    const sectors = summarizeSectors(
      membership([['ai', ['TAO', 'DUST']]]),
      snapshot([
        coin({ symbol: 'TAO', marketCap: 9_000_000, percentChange24h: 10 }),
        coin({ symbol: 'DUST', marketCap: 1_000_000, percentChange24h: -10 }),
      ]),
      '24h',
    )
    expect(sectors).toHaveLength(1)
    expect(sectors[0]!.changePct).toBeCloseTo(8, 10)
    expect(sectors[0]!.members).toBe(2)
    expect(sectors[0]!.advancing).toBe(1)
    expect(sectors[0]!.declining).toBe(1)
  })

  test('only members the snapshot priced are counted', () => {
    const sectors = summarizeSectors(
      membership([['defi', ['AAVE', 'UNI', 'NOTLISTED']]]),
      snapshot([
        coin({ symbol: 'AAVE', percentChange24h: -2 }),
        coin({ symbol: 'UNI', percentChange24h: -1 }),
      ]),
      '24h',
    )
    expect(sectors[0]!.members).toBe(2)
    expect(sectors[0]!.changePct).toBeCloseTo(-1.5, 10)
  })

  test('a sector the snapshot cannot price at all is dropped', () => {
    const sectors = summarizeSectors(
      membership([
        ['ai', ['TAO']],
        ['gaming', ['IMX']],
      ]),
      snapshot([coin({ symbol: 'TAO', percentChange24h: 4 })]),
      '24h',
    )
    expect(sectors.map((s) => s.category)).toEqual(['ai'])
  })

  test('leader and laggard are the extremes of the window', () => {
    const sectors = summarizeSectors(
      membership([['meme', ['DOGE', 'PEPE', 'WIF']]]),
      snapshot([
        coin({ symbol: 'DOGE', percentChange24h: 1 }),
        coin({ symbol: 'PEPE', percentChange24h: 12 }),
        coin({ symbol: 'WIF', percentChange24h: -9 }),
      ]),
      '24h',
    )
    expect(sectors[0]!.leader).toEqual({ symbol: 'PEPE', changePct: 12 })
    expect(sectors[0]!.laggard).toEqual({ symbol: 'WIF', changePct: -9 })
  })

  test('the 7d window ranks a different sector first', () => {
    const members = membership([
      ['ai', ['TAO']],
      ['layer1', ['SOL']],
    ])
    const coins = snapshot([
      coin({ symbol: 'TAO', percentChange24h: 5, percentChange7d: 1 }),
      coin({ symbol: 'SOL', percentChange24h: 1, percentChange7d: 20 }),
    ])
    expect(summarizeSectors(members, coins, '24h')[0]!.category).toBe('ai')
    expect(summarizeSectors(members, coins, '7d')[0]!.category).toBe('layer1')
  })

  test('the trend line ends at 1 and reconstructs the week behind it', () => {
    const sectors = summarizeSectors(
      membership([['ai', ['TAO']]]),
      snapshot([
        coin({
          symbol: 'TAO',
          percentChange1h: 1,
          percentChange24h: 10,
          percentChange7d: 100,
        }),
      ]),
      '24h',
    )
    const line = sectors[0]!.trajectory
    expect(line).toHaveLength(4)
    expect(line[3]).toBe(1)
    // Doubled over the week, so a week ago it was half of today.
    expect(line[0]).toBeCloseTo(0.5, 10)
    expect(line[1]).toBeCloseTo(1 / 1.1, 10)
    // Monotone rising: every leg was up.
    expect(line[0]).toBeLessThan(line[1])
    expect(line[1]).toBeLessThan(line[2])
  })

  test('a total wipeout flattens the line instead of dividing by zero', () => {
    const sectors = summarizeSectors(
      membership([['meme', ['RUG']]]),
      snapshot([coin({ symbol: 'RUG', percentChange7d: -100 })]),
      '24h',
    )
    for (const point of sectors[0]!.trajectory) {
      expect(Number.isFinite(point)).toBe(true)
    }
  })

  test('sectors are ordered by the window move, strongest first', () => {
    const sectors = summarizeSectors(
      membership([
        ['layer1', ['SOL']],
        ['ai', ['TAO']],
        ['meme', ['DOGE']],
      ]),
      snapshot([
        coin({ symbol: 'SOL', percentChange24h: 0.8 }),
        coin({ symbol: 'TAO', percentChange24h: 4.2 }),
        coin({ symbol: 'DOGE', percentChange24h: -3.1 }),
      ]),
      '24h',
    )
    expect(sectors.map((s) => s.category)).toEqual(['ai', 'layer1', 'meme'])
  })
})
