// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { ProviderThrottledError } from '@pairlens/market-engine/errors'
import { resetProviderThrottles } from '@pairlens/market-engine/provider-throttle'

import {
  aggregateChainStats,
  clearListingCache,
  fetchTopPools,
  parsePoolListing,
  stripNetworkPrefix,
} from '../pool-listing-client'
import { geckoLimiter } from '../rate-limiter'
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
