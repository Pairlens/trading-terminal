// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Row assembly for the funding matrix: what shares a row, what order rows come
 * in, and what happens to a contract the sorted-on venue does not list.
 *
 * The first of those is the pane's whole reason to exist. Binance settles BTC
 * in USDT and Kraken in USD; keyed on the full pair they would be two rows with
 * one cell each and nothing to compare.
 */

import { describe, expect, it } from 'bun:test'
import {
  buildFundingRows,
  fundingExtremes,
  primaryCell,
  sortRowsByVenue,
} from '../funding-rows'
import type { FundingVenueResult } from '@/hooks/use-funding-rates'
import type { FundingRateEntry } from '@pairlens/shared/instrument-types'

function entry(
  pair: string,
  fundingRate: number,
  over: Partial<FundingRateEntry> = {},
): FundingRateEntry {
  const [base = '', quote = ''] = pair.split('-')
  return {
    pair,
    base,
    quote,
    fundingRate,
    intervalHours: 8,
    intervalKnown: true,
    ...over,
  }
}

function venue(
  market: string,
  entries: Array<FundingRateEntry>,
): FundingVenueResult {
  return { market, label: market, entries, error: null, desktopOnly: false }
}

/** BTC first, ETH second, everything else unranked. */
const RANK = (base: string) =>
  ({ BTC: 1, ETH: 2 })[base] ?? Number.POSITIVE_INFINITY

describe('buildFundingRows', () => {
  it('puts the same base on one row whatever each venue settles in', () => {
    const rows = buildFundingRows(
      [
        venue('binance-futures', [entry('BTC-USDT-USDT', 0.0001)]),
        venue('kraken-futures', [
          entry('BTC-USD-USD', 0.00001, { intervalHours: 1 }),
        ]),
      ],
      RANK,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].coverage).toBe(2)
    expect(rows[0].cells['kraken-futures'].quote).toBe('USD')
  })

  it('annualises each cell on its own venue clock', () => {
    const rows = buildFundingRows(
      [
        venue('binance-futures', [entry('BTC-USDT-USDT', 0.0001)]),
        venue('kraken-futures', [
          entry('BTC-USD-USD', 0.0001, { intervalHours: 1 }),
        ]),
      ],
      RANK,
    )
    const cells = rows[0].cells
    expect(cells['binance-futures'].annualized!).toBeCloseTo(0.1095, 6)
    expect(cells['kraken-futures'].annualized!).toBeCloseTo(0.876, 6)
    // The spread column is the carry trade: long the cheapest, short the
    // dearest, in points of annualised funding.
    expect(rows[0].spreadPoints!).toBeCloseTo(76.65, 2)
  })

  it('keeps one cell per venue, preferring the deepest settlement leg', () => {
    const rows = buildFundingRows(
      [
        venue('binance-futures', [
          entry('BTC-USDC-USDC', 0.0009),
          entry('BTC-USDT-USDT', 0.0001),
        ]),
      ],
      RANK,
    )
    expect(Object.keys(rows[0].cells)).toEqual(['binance-futures'])
    expect(rows[0].cells['binance-futures'].quote).toBe('USDT')
  })

  it('orders by the asset ranking, then coverage, then name', () => {
    const rows = buildFundingRows(
      [
        venue('binance-futures', [
          entry('ZZZ-USDT-USDT', 0.02),
          entry('ETH-USDT-USDT', 0.0001),
          entry('AAA-USDT-USDT', 0.03),
          entry('BTC-USDT-USDT', 0.0001),
        ]),
        venue('kraken-futures', [entry('ZZZ-USD-USD', 0.00001)]),
      ],
      RANK,
    )
    // Ranked assets first in rank order; then the unranked one two venues
    // carry, then the leftovers alphabetically. Never by rate: an illiquid
    // outlier would take the top of the board on every refresh.
    expect(rows.map((r) => r.base)).toEqual(['BTC', 'ETH', 'ZZZ', 'AAA'])
  })

  it('has no spread with a single venue quoting', () => {
    const rows = buildFundingRows(
      [venue('binance-futures', [entry('SOL-USDT-USDT', -0.0012)])],
      RANK,
    )
    expect(rows[0].spreadPoints).toBeNull()
  })
})

describe('sortRowsByVenue', () => {
  const rows = buildFundingRows(
    [
      venue('binance-futures', [
        entry('BTC-USDT-USDT', 0.0001),
        entry('SOL-USDT-USDT', -0.0012),
      ]),
      venue('kraken-futures', [entry('ETH-USD-USD', 0.00002)]),
    ],
    RANK,
  )

  it('ranks by that venue, dearest first', () => {
    const sorted = sortRowsByVenue(rows, 'binance-futures', 'desc')
    expect(sorted.map((r) => r.base)).toEqual(['BTC', 'SOL', 'ETH'])
  })

  it('sinks rows the venue does not list rather than dropping them', () => {
    // The contract still exists on the other venues; removing it on a sort
    // click would read as data loss.
    const sorted = sortRowsByVenue(rows, 'binance-futures', 'asc')
    expect(sorted.map((r) => r.base)).toEqual(['SOL', 'BTC', 'ETH'])
    expect(sorted).toHaveLength(rows.length)
  })
})

describe('fundingExtremes', () => {
  const rows = buildFundingRows(
    [
      venue('binance-futures', [
        entry('TAO-USDT-USDT', 0.00057),
        entry('SOL-USDT-USDT', -0.00121),
        entry('BTC-USDT-USDT', 0.0001),
      ]),
      venue('kraken-futures', [
        entry('TAO-USD-USD', 0.00002, { intervalHours: 1 }),
      ]),
    ],
    RANK,
  )

  it('lists one entry per contract per venue', () => {
    // "TAO on Binance" and "TAO on Kraken" are two trades, and collapsing them
    // would hide the leg that makes the pair work.
    const { positive } = fundingExtremes(rows, 5)
    // Ordered by ANNUALISED rate, so the hourly venue's smaller printed number
    // is ranked on the same footing as the eight-hourly one.
    expect(positive.map((e) => `${e.base}:${e.cell.market}`)).toEqual([
      'TAO:binance-futures',
      'TAO:kraken-futures',
      'BTC:binance-futures',
    ])
  })

  it('splits the two signs and honours the limit', () => {
    const { positive, negative } = fundingExtremes(rows, 1)
    expect(positive).toHaveLength(1)
    expect(negative).toHaveLength(1)
    expect(negative[0].base).toBe('SOL')
  })
})

describe('primaryCell', () => {
  it('prefers a venue that publishes both legs of the basis', () => {
    const rows = buildFundingRows(
      [
        venue('binance-futures', [
          entry('BTC-USDT-USDT', 0.0001, { markPrice: 63_121 }),
        ]),
        venue('kraken-futures', [
          entry('BTC-USD-USD', 0.00001, {
            intervalHours: 1,
            markPrice: 63_100,
            indexPrice: 63_050,
          }),
        ]),
      ],
      RANK,
    )
    const cell = primaryCell(rows[0], ['binance-futures', 'kraken-futures'])
    expect(cell!.market).toBe('kraken-futures')
  })

  it('falls back to the caller-declared venue order', () => {
    const rows = buildFundingRows(
      [
        venue('binance-futures', [entry('BTC-USDT-USDT', 0.0001)]),
        venue('kraken-futures', [entry('BTC-USD-USD', 0.00001)]),
      ],
      RANK,
    )
    expect(
      primaryCell(rows[0], ['kraken-futures', 'binance-futures'])!.market,
    ).toBe('kraken-futures')
  })
})
