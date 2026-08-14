// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The cached-listings read is the terminal's only path from "what does this
 * venue list" to an answer without touching the network. These tests pin the
 * trim semantics (active spot rows only, dash-canonical symbols, venue-native
 * ids preserved) and the venue-id registry against drift: CCXT_VENUE_IDS is a
 * hand-kept light list precisely so app code never imports 14 venue modules,
 * which makes a mismatch with the real venue configs a silent discovery hole.
 */
import { describe, expect, test } from 'bun:test'
import {
  CCXT_VENUE_IDS,
  memoryMarketsStorage,
  readCachedVenueListings,
} from '../markets'
import { binanceCcxtVenue } from '../venues/binance'
import { bitfinexCcxtVenue } from '../venues/bitfinex'
import { bitgetCcxtVenue } from '../venues/bitget'
import { bitvavoCcxtVenue } from '../venues/bitvavo'
import { bybitCcxtVenue } from '../venues/bybit'
import { coinbaseCcxtVenue } from '../venues/coinbase'
import { cryptocomCcxtVenue } from '../venues/cryptocom'
import { gateCcxtVenue } from '../venues/gate'
import { htxCcxtVenue } from '../venues/htx'
import { krakenCcxtVenue } from '../venues/kraken'
import { kucoinCcxtVenue } from '../venues/kucoin'
import { mexcCcxtVenue } from '../venues/mexc'
import { okxCcxtVenue } from '../venues/okx'
import { upbitCcxtVenue } from '../venues/upbit'
import type { CcxtMarketSeed } from '../types'

const ALL_VENUE_CONFIGS = [
  binanceCcxtVenue,
  bitfinexCcxtVenue,
  bitgetCcxtVenue,
  bitvavoCcxtVenue,
  bybitCcxtVenue,
  coinbaseCcxtVenue,
  cryptocomCcxtVenue,
  gateCcxtVenue,
  htxCcxtVenue,
  krakenCcxtVenue,
  kucoinCcxtVenue,
  mexcCcxtVenue,
  okxCcxtVenue,
  upbitCcxtVenue,
]

function seed(overrides: Partial<CcxtMarketSeed>): CcxtMarketSeed {
  return {
    id: 'BTCUSDT',
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    type: 'spot',
    spot: true,
    active: true,
    ...overrides,
  }
}

describe('CCXT_VENUE_IDS registry', () => {
  test('matches every bundled venue config (marketId === exchangeId)', () => {
    const fromConfigs = ALL_VENUE_CONFIGS.map((v) => v.marketId).sort()
    expect([...CCXT_VENUE_IDS].sort()).toEqual(fromConfigs)
    for (const venue of ALL_VENUE_CONFIGS) {
      expect(venue.exchangeId).toBe(venue.marketId)
    }
  })
})

describe('readCachedVenueListings', () => {
  test('trims cached tables to active listing rows with venue-native ids', async () => {
    const storage = memoryMarketsStorage()
    await storage.set('binance:v2', {
      savedAt: 1_000,
      markets: [
        seed({}),
        seed({ id: 'ETHUSDT', symbol: 'ETH/USDT', base: 'ETH' }),
        seed({ id: 'DEADUSDT', base: 'DEAD', active: false }),
      ],
    })

    const result = await readCachedVenueListings(['binance', 'okx'], storage)
    expect(result).toHaveLength(1)
    const [binance] = result
    expect(binance.venue).toBe('binance')
    expect(binance.savedAt).toBe(1_000)
    expect(binance.listings).toEqual([
      { symbol: 'BTC-USDT', base: 'BTC', quote: 'USDT', marketId: 'BTCUSDT' },
      { symbol: 'ETH-USDT', base: 'ETH', quote: 'USDT', marketId: 'ETHUSDT' },
    ])
  })

  test('a venue with no cached table is absent, not empty', async () => {
    const storage = memoryMarketsStorage()
    const result = await readCachedVenueListings(['kraken'], storage)
    expect(result).toEqual([])
  })

  test('an empty cached table is treated as unknown', async () => {
    const storage = memoryMarketsStorage()
    await storage.set('kraken:v2', { savedAt: 5, markets: [] })
    const result = await readCachedVenueListings(['kraken'], storage)
    expect(result).toEqual([])
  })
})
