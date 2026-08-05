// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { buildMarketResults } from '../market-results'
import type { MarketOption } from '@/hooks/use-available-markets'

const MARKETS: Array<MarketOption> = [
  { value: 'okx', label: 'OKX', assetClasses: ['crypto-spot'] },
  { value: 'binance', label: 'Binance', assetClasses: ['crypto-spot'] },
  { value: 'gate', label: 'Gate.io', assetClasses: ['crypto-spot'] },
  {
    value: 'kucoin',
    label: 'KuCoin',
    assetClasses: ['crypto-spot'],
    requiresDesktop: true,
  },
  { value: 'jupiter', label: 'Jupiter', assetClasses: ['dex'] },
  { value: 'alpaca', label: 'Alpaca', assetClasses: ['stocks'] },
]

const ids = (query: string, markets = MARKETS, active = 'okx') =>
  buildMarketResults(query, markets, active).items.map((m) => m.marketId)

describe('buildMarketResults', () => {
  test('an exact venue name leads the results', () => {
    expect(ids('okx')[0]).toBe('okx')
    expect(ids('binance')[0]).toBe('binance')
  })

  test('matches the connector id when it differs from the label', () => {
    expect(ids('gate')[0]).toBe('gate')
  })

  test('matches a partial name', () => {
    expect(ids('kuc')).toContain('kucoin')
    expect(ids('jup')[0]).toBe('jupiter')
  })

  test('only offers venues it was given — a disabled connector is absent', () => {
    const withoutOkx = MARKETS.filter((m) => m.value !== 'okx')
    expect(ids('okx', withoutOkx)).toEqual([])
  })

  test('an unrelated query matches no venue', () => {
    expect(ids('btc-usdt')).toEqual([])
  })

  test('an asset-class alias narrows to that class', () => {
    expect(ids('dex')).toEqual(['jupiter'])
    expect(ids('stocks')).toEqual(['alpaca'])
  })

  test('a generic alias lists every venue', () => {
    expect(ids('exchange').sort()).toEqual(MARKETS.map((m) => m.value).sort())
  })

  test('short queries never match generic aliases', () => {
    // 'ex' is a substring of "exchange" but of no venue name; matching the
    // alias would bury the pair the user is typing under every connector.
    expect(ids('ex')).toEqual([])
    expect(ids('exc').sort()).toEqual(MARKETS.map((m) => m.value).sort())
  })

  test('flags the active venue and carries the desktop-only mark', () => {
    const { items } = buildMarketResults('', MARKETS, 'binance')
    expect(items[0].marketId).toBe('binance')
    expect(items[0].isActive).toBe(true)
    expect(items.filter((m) => m.isActive)).toHaveLength(1)
    expect(items.find((m) => m.marketId === 'kucoin')?.requiresDesktop).toBe(
      true,
    )
  })

  test('empty query browses every venue, active one first', () => {
    expect(ids('', MARKETS, 'gate')).toEqual([
      'gate',
      'okx',
      'binance',
      'kucoin',
      'jupiter',
      'alpaca',
    ])
  })

  test('reports when the query names a venue outright', () => {
    // The caller lifts venues above pairs on this flag.
    expect(buildMarketResults('okx', MARKETS, 'okx').namesVenue).toBe(true)
    expect(buildMarketResults('OKX', MARKETS, 'okx').namesVenue).toBe(true)
    expect(buildMarketResults('gate.io', MARKETS, 'okx').namesVenue).toBe(true)
    expect(buildMarketResults('ok', MARKETS, 'okx').namesVenue).toBe(false)
    expect(buildMarketResults('exchange', MARKETS, 'okx').namesVenue).toBe(
      false,
    )
  })

  test('highlight ranges index into the rendered label', () => {
    const { items } = buildMarketResults('bin', MARKETS, 'okx')
    expect(items[0].matchRanges).toEqual([[0, 3]])
  })
})
