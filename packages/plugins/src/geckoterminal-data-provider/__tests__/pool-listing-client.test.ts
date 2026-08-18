// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { ProviderThrottledError } from '@pairlens/market-engine/errors'
import { resetProviderThrottles } from '@pairlens/market-engine/provider-throttle'

import {
  aggregateChainStats,
  clearListingCache,
  fetchNewPools,
  fetchTopPools,
  mergePoolPages,
  parsePoolCreatedAt,
  parsePoolListing,
  parseTradeCounts,
  stripNetworkPrefix,
} from '../pool-listing-client'
import { geckoLimiter } from '../rate-limiter'
import type { PoolListingEntry } from '@pairlens/shared/instrument-types'
import type { RawGeckoPoolRow } from '../pool-listing-client'

const ROWS: Array<RawGeckoPoolRow> = [
  {
    id: 'solana_A',
    attributes: {
      address: 'A',
      name: 'SOL / USDC',
      base_token_price_usd: '74.42',
      price_change_percentage: { h24: '2.1' },
      volume_usd: { h24: '1000' },
      reserve_in_usd: '400',
      // Shapes copied from a live `/networks/solana/pools?page=1` response:
      // counts are JSON numbers, fdv is a string like the money fields.
      transactions: {
        h1: { buys: 0, sells: 0, buyers: 0, sellers: 0 },
        h24: { buys: 333_617, sells: 134_917, buyers: 5_223, sellers: 1_425 },
      },
      fdv_usd: '11178.1223040879',
    },
    relationships: {
      dex: { data: { id: 'orca' } },
      base_token: { data: { id: 'solana_So111' } },
    },
  },
  {
    id: 'solana_B',
    attributes: {
      address: 'B',
      name: 'RAY / USDC',
      base_token_price_usd: '2.10',
      price_change_percentage: { h24: '-8.4' },
      volume_usd: { h24: '250' },
      // No reserve published for this one.
    },
    relationships: { dex: { data: { id: 'raydium' } } },
  },
]

describe('stripNetworkPrefix', () => {
  it('reduces a network-scoped token id to its address', () => {
    expect(stripNetworkPrefix('solana_So111', 'solana')).toBe('So111')
    expect(stripNetworkPrefix('0xabc', 'eth')).toBe('0xabc')
    expect(stripNetworkPrefix(undefined, 'eth')).toBeNull()
  })
})

describe('parsePoolListing', () => {
  it('maps rows and keeps the base address for identity routing', () => {
    const pools = parsePoolListing(ROWS, 'solana')
    expect(pools.length).toBe(2)
    expect(pools[0].dexName).toBe('orca')
    expect(pools[0].baseSymbol).toBe('SOL')
    expect(pools[0].baseAddress).toBe('So111')
    expect(pools[1].reserveUsd).toBeNull()
    expect(pools[1].baseAddress).toBeNull()
  })

  it('skips a row with no address', () => {
    expect(parsePoolListing([{ attributes: { name: 'x' } }], 'eth')).toEqual([])
  })

  it('carries the 24h trade counts and FDV the listing publishes', () => {
    // Verified live against `/networks/{solana,base}/pools` and
    // `/networks/solana/new_pools` before this was parsed: `transactions.h24`
    // and `fdv_usd` are on the LIST endpoint, not just the pool endpoint.
    const pools = parsePoolListing(ROWS, 'solana')
    expect(pools[0].trades24h).toEqual({
      buys: 333_617,
      sells: 134_917,
      buyers: 5_223,
      sellers: 1_425,
    })
    expect(pools[0].fdvUsd).toBeCloseTo(11178.1223, 3)
  })

  it('leaves counts null on a row that published none', () => {
    // Null, never a zeroed pair: a trades-sized map has to tell "nobody traded
    // this" from "this listing carries no counts", and the second one must not
    // draw as an empty pool.
    const pools = parsePoolListing(ROWS, 'solana')
    expect(pools[1].trades24h).toBeNull()
    expect(pools[1].fdvUsd).toBeNull()
  })
})

describe('parseTradeCounts', () => {
  it('reads a window and keeps wallet counts optional', () => {
    expect(parseTradeCounts({ buys: 12, sells: 3 })).toEqual({
      buys: 12,
      sells: 3,
      buyers: null,
      sellers: null,
    })
  })

  it('treats one missing side as zero once the window exists', () => {
    // A window that reported buys and omitted sells traded in one direction;
    // that is a real reading, unlike a window that reported neither.
    expect(parseTradeCounts({ buys: 5 })).toEqual({
      buys: 5,
      sells: 0,
      buyers: null,
      sellers: null,
    })
  })

  it('has nothing to report for an absent or empty window', () => {
    expect(parseTradeCounts(undefined)).toBeNull()
    expect(parseTradeCounts(null)).toBeNull()
    expect(parseTradeCounts({})).toBeNull()
  })

  it('leaves createdAtMs absent on the ranked listing', () => {
    // `/pools` publishes no creation time. An age column reading "now" for
    // every row would be a fabricated one.
    expect('createdAtMs' in parsePoolListing(ROWS, 'solana')[0]).toBe(false)
  })

  it('carries pool_created_at through as epoch ms', () => {
    const pools = parsePoolListing(
      [
        {
          id: 'solana_N',
          attributes: {
            address: 'N',
            name: 'NEW / SOL',
            pool_created_at: '2026-08-14T09:12:03Z',
          },
          relationships: { dex: { data: { id: 'raydium' } } },
        },
      ],
      'solana',
    )
    expect(pools[0].createdAtMs).toBe(Date.parse('2026-08-14T09:12:03Z'))
  })
})

describe('parsePoolCreatedAt', () => {
  it('drops what it cannot read rather than guessing an age', () => {
    expect(parsePoolCreatedAt('2026-08-14T09:12:03Z')).toBe(
      Date.parse('2026-08-14T09:12:03Z'),
    )
    expect(parsePoolCreatedAt(null)).toBeUndefined()
    expect(parsePoolCreatedAt(undefined)).toBeUndefined()
    expect(parsePoolCreatedAt('')).toBeUndefined()
    expect(parsePoolCreatedAt('yesterday')).toBeUndefined()
  })
})

describe('aggregateChainStats', () => {
  it('sums only what the pools published, and says what it covers', () => {
    const stats = aggregateChainStats(
      'solana',
      'jupiter',
      'Solana',
      parsePoolListing(ROWS, 'solana'),
    )
    expect(stats.volume24hUsd).toBe(1250)
    expect(stats.reserveUsd).toBe(400)
    expect(stats.market).toBe('jupiter')
    expect(stats.coverage).toBe('top-pools')
    expect(stats.sampledPools).toBe(2)
  })

  it('leaves a figure null when no pool published it', () => {
    // A dash and a "$0" say opposite things about a chain, and the second one
    // is a claim we did not measure.
    const stats = aggregateChainStats('eth', 'ethereum', 'Ethereum', [])
    expect(stats.volume24hUsd).toBeNull()
    expect(stats.reserveUsd).toBeNull()
    expect(stats.sampledPools).toBe(0)
  })
})

/**
 * The chain rail and the pool map read this endpoint for the same chain from two
 * unconnected queries. Both halves of the dedupe matter: the in-flight map for
 * a board opening cold (they ask at once), the TTL for the refreshes after
 * (they ask seconds apart).
 */
describe('fetchTopPools — one request per chain per minute', () => {
  const realFetch = globalThis.fetch

  const stub = (impl: (url: string) => Promise<Response>) => {
    const calls: Array<string> = []
    globalThis.fetch = mock(async (url: unknown) => {
      calls.push(String(url))
      return impl(String(url))
    }) as unknown as typeof fetch
    return calls
  }

  const page = (address: string) =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: `solana_${address}`,
            attributes: {
              address,
              name: 'SOL / USDC',
              volume_usd: { h24: '1000' },
            },
            relationships: { dex: { data: { id: 'orca' } } },
          },
        ],
      }),
      { status: 200 },
    )

  beforeEach(() => {
    clearListingCache()
    resetProviderThrottles()
    geckoLimiter.reset()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    clearListingCache()
    resetProviderThrottles()
    geckoLimiter.reset()
  })

  it('collapses concurrent asks for the same chain into one request', async () => {
    const calls = stub(async () => page('pool1'))
    const [a, b, c] = await Promise.all([
      fetchTopPools('solana'),
      fetchTopPools('solana'),
      fetchTopPools('solana'),
    ])
    expect(calls.length).toBe(1)
    expect(a[0].address).toBe('pool1')
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  it('serves a repeat ask from the cache', async () => {
    const calls = stub(async () => page('pool1'))
    await fetchTopPools('solana')
    await fetchTopPools('solana')
    expect(calls.length).toBe(1)
  })

  it('keeps chains and pages apart', async () => {
    const calls = stub(async (url) => page(url.includes('base') ? 'b' : 's'))
    await fetchTopPools('solana')
    await fetchTopPools('base')
    await fetchTopPools('solana', 2)
    expect(calls.length).toBe(3)
  })

  it('keeps the new-pools feed on its own cache key', async () => {
    // Same chain, two different questions. A shared key would serve a ranked
    // page as a listing feed, which is a silently wrong answer rather than a
    // missing one.
    const calls = stub(async (url) =>
      page(url.includes('new_pools') ? 'fresh' : 'ranked'),
    )
    const ranked = await fetchTopPools('solana')
    const fresh = await fetchNewPools('solana')
    expect(calls.length).toBe(2)
    expect(calls[1]).toContain('/networks/solana/new_pools')
    expect(ranked[0].address).toBe('ranked')
    expect(fresh[0].address).toBe('fresh')
  })

  it('collapses concurrent new-pools asks for the same chain', async () => {
    const calls = stub(async () => page('fresh'))
    const [a, b] = await Promise.all([
      fetchNewPools('solana'),
      fetchNewPools('solana'),
    ])
    expect(calls.length).toBe(1)
    expect(b).toEqual(a)
  })

  it('never caches a throttle as an answer', async () => {
    // Caching a failure would turn one 429 into a minute of empty chain rows,
    // which is the same class of bug as the availability verdict.
    let attempt = 0
    const calls = stub(async () => {
      attempt += 1
      if (attempt === 1) {
        throw new ProviderThrottledError('GeckoTerminal', 429, 15_000)
      }
      return page('pool1')
    })

    await expect(fetchTopPools('solana')).rejects.toThrow(/rate limiting/)
    const pools = await fetchTopPools('solana')
    expect(pools[0].address).toBe('pool1')
    expect(calls.length).toBe(2)
  })
})

describe('fetchTopPools — volume ranking', () => {
  const realFetch = globalThis.fetch

  const stub = (impl: (url: string) => Promise<Response>) => {
    const calls: Array<string> = []
    globalThis.fetch = mock(async (url: unknown) => {
      calls.push(String(url))
      return impl(String(url))
    }) as unknown as typeof fetch
    return calls
  }

  const page = (address: string) =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: `solana_${address}`,
            attributes: {
              address,
              name: 'SOL / USDC',
              volume_usd: { h24: '1000' },
            },
            relationships: { dex: { data: { id: 'orca' } } },
          },
        ],
      }),
      { status: 200 },
    )

  beforeEach(() => {
    clearListingCache()
    resetProviderThrottles()
    geckoLimiter.reset()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    clearListingCache()
    resetProviderThrottles()
    geckoLimiter.reset()
  })

  it('asks the provider for the volume order, on its own cache key', async () => {
    const calls = stub(async () => page('pool1'))
    await fetchTopPools('solana', 1, 'volume')
    await fetchTopPools('solana', 1)
    expect(calls.length).toBe(2)
    expect(calls[0]).toContain('sort=h24_volume_usd_desc')
    expect(calls[1]).not.toContain('sort=')
  })
})

describe('mergePoolPages', () => {
  const entry = (network: string, address: string): PoolListingEntry => ({
    network,
    address,
    name: 'SOL / USDC',
    dexName: 'orca',
    priceUsd: null,
    change24hPct: null,
    volume24hUsd: null,
    reserveUsd: null,
    baseSymbol: null,
    quoteSymbol: null,
    baseAddress: null,
  })

  it('keeps first appearance when the ranking repeats a pool across pages', () => {
    const merged = mergePoolPages([
      [entry('solana', 'a'), entry('solana', 'b')],
      [entry('solana', 'b'), entry('solana', 'c')],
    ])
    expect(merged.map((p) => p.address)).toEqual(['a', 'b', 'c'])
  })

  it('never collapses the same address on two different chains', () => {
    const merged = mergePoolPages([
      [entry('solana', 'a')],
      [entry('base', 'a')],
    ])
    expect(merged.length).toBe(2)
  })
})
