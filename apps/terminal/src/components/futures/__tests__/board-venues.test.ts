// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which venues get a column while the board is still filling.
 *
 * This is the rule the whole perps loading state rests on: a venue that has
 * not answered yet must hold its place so the matrix draws its full width on
 * the first paint, and a venue that answered with nothing must not, or the
 * board carries a permanently empty column. Getting it backwards is invisible
 * in a screenshot of a loaded board and obvious on every page load.
 */
import { describe, expect, test } from 'bun:test'

import type { FundingRateEntry } from '@pairlens/shared/instrument-types'
import type { FundingVenueResult } from '@/hooks/use-funding-rates'
import {
  answeringVenues,
  boardVenues,
} from '@/components/futures/funding-scanner'

function venue(
  market: string,
  patch: Partial<FundingVenueResult> = {},
): FundingVenueResult {
  return {
    market,
    label: market,
    entries: [],
    error: null,
    desktopOnly: false,
    pending: false,
    ...patch,
  }
}

const entry: FundingRateEntry = { pair: 'BTC-USDT-USDT', rate: 0.0001 }
const withRates = (market: string) => venue(market, { entries: [entry] })

describe('boardVenues', () => {
  test('keeps a venue that is still sweeping', () => {
    const columns = boardVenues([
      withRates('binance-futures'),
      venue('okx-futures', { pending: true }),
    ])
    expect(columns.map((c) => c.market)).toEqual([
      'binance-futures',
      'okx-futures',
    ])
  })

  test('drops a venue that answered with nothing', () => {
    const columns = boardVenues([
      withRates('binance-futures'),
      venue('bybit-futures'),
    ])
    expect(columns.map((c) => c.market)).toEqual(['binance-futures'])
  })

  test('drops a venue this build cannot reach', () => {
    const columns = boardVenues([
      withRates('binance-futures'),
      venue('kucoin-futures', { desktopOnly: true }),
    ])
    expect(columns.map((c) => c.market)).toEqual(['binance-futures'])
  })

  test('answeringVenues never counts a pending venue', () => {
    const results = [
      withRates('binance-futures'),
      venue('okx-futures', { pending: true }),
    ]
    // The panes that pick ONE venue per row read this list, and a pending
    // venue with no entries would win the pick and print a blank row.
    expect(answeringVenues(results).map((r) => r.market)).toEqual([
      'binance-futures',
    ])
  })
})
