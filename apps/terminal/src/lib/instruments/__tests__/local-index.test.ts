// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pins the local index's contract: tier-first ranking (exact > prefix >
 * name-prefix > substring), positional output ranks (consumers sort by rank
 * and must preserve the tiered order), snapshot merging with synthesized
 * long-tail rows, and "absence is unknown" listing semantics.
 *
 * In bun there is no IndexedDB, so the venue-tables source resolves empty and
 * the snapshot source is seeded through the same in-memory KV fallback the
 * production code uses.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { writeCcxtKv } from '@pairlens/plugins/ccxt-connector'
import {
  INSTRUMENTS_SNAPSHOT_KV_KEY,
  getSymbolListings,
  rebuildLocalInstrumentIndex,
  searchLocalInstruments,
} from '../local-index'
import type {
  Instrument,
  InstrumentsIndexSnapshot,
} from '@pairlens/shared/instrument-types'

function catalogRow(
  symbol: string,
  name: string,
  rank: number,
  quote = 'USDT',
): Instrument {
  const base = symbol.split('-')[0]
  return {
    id: symbol,
    kind: 'cex-pair',
    market: '',
    symbol,
    name,
    base,
    quote,
    assetClass: 'crypto',
    categories: [],
    rank,
    featured: false,
  }
}

const CATALOG: Array<Instrument> = [
  catalogRow('BTC-USDT', 'Bitcoin', 1),
  catalogRow('ETH-USDT', 'Ethereum', 2),
  catalogRow('PEPE-USDT', 'Pepe', 20),
  catalogRow('OP-USDT', 'Optimism', 25),
  // A name-substring trap: "Ethereum Classic" must rank below prefix hits
  // for the query "eth" but above nothing relevant for "classic".
  catalogRow('ETC-USDT', 'Ethereum Classic', 30),
]

const SNAPSHOT: InstrumentsIndexSnapshot = {
  schemaVersion: 1,
  builtAt: 1_700_000_000_000,
  ccxtVersion: '4.5.71',
  venues: [
    { venue: 'gate', sweptAt: 1_700_000_000_000, status: 'ok', rows: 2 },
  ],
  pairs: [
    // Annotates an existing catalog row
    {
      symbol: 'PEPE-USDT',
      base: 'PEPE',
      quote: 'USDT',
      venues: { gate: 'PEPE_USDT', mexc: 'PEPEUSDT' },
    },
    // A long-tail listing the catalog has never heard of
    {
      symbol: 'TURBO-USDT',
      base: 'TURBO',
      quote: 'USDT',
      venues: { gate: 'TURBO_USDT' },
    },
  ],
  tokens: [],
  equities: [],
}

const manager = {
  execute: async () => ({
    items: CATALOG,
    total: CATALOG.length,
    hasMore: false,
  }),
}

beforeAll(async () => {
  await writeCcxtKv(INSTRUMENTS_SNAPSHOT_KV_KEY, SNAPSHOT)
  await rebuildLocalInstrumentIndex(manager)
})

describe('searchLocalInstruments', () => {
  test('exact base match beats prefix and substring tiers', () => {
    const { items } = searchLocalInstruments('ETH')
    expect(items[0].symbol).toBe('ETH-USDT')
    // 'Ethereum Classic' is a name hit, never above the exact match
    const etc = items.findIndex((i) => i.symbol === 'ETC-USDT')
    expect(etc).toBeGreaterThan(0)
  })

  test('prefix beats substring: "PE" surfaces PEPE first', () => {
    const { items } = searchLocalInstruments('PE')
    expect(items[0].base).toBe('PEPE')
  })

  test('output ranks are positional, so rank-sorting consumers preserve order', () => {
    const { items } = searchLocalInstruments('USDT')
    expect(items.map((i) => i.rank)).toEqual(items.map((_, i) => i))
  })

  test('long-tail snapshot listings are searchable without any catalog entry', () => {
    const { items } = searchLocalInstruments('TURBO')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].symbol).toBe('TURBO-USDT')
    expect(items[0].kind).toBe('cex-pair')
  })

  test('an unmatched query returns empty, not an error', () => {
    expect(searchLocalInstruments('ZZZZZZ').items).toEqual([])
  })
})

describe('getSymbolListings', () => {
  test('snapshot evidence is reported separately from local evidence', () => {
    const listings = getSymbolListings('PEPE-USDT')
    expect(listings).not.toBeNull()
    expect(listings?.local).toEqual([])
    expect(listings?.snapshot?.sort()).toEqual(['gate', 'mexc'])
  })

  test('a pair the index knows nothing about is unknown, not unlisted', () => {
    expect(getSymbolListings('NOPE-USDT')).toBeNull()
  })

  test('catalog rows without listing evidence report empty evidence', () => {
    const listings = getSymbolListings('BTC-USDT')
    expect(listings).toEqual({ local: [], snapshot: [] })
  })
})
