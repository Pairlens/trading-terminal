// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  aggregateChainStats,
  parsePoolListing,
  stripNetworkPrefix,
} from '../pool-listing-client'
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
