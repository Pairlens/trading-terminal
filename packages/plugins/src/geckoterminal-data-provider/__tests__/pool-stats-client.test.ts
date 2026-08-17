// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  feeTierFromName,
  numberOrNull,
  parsePoolStats,
  splitPoolName,
} from '../pool-stats-client'
import type { RawGeckoPool } from '../pool-stats-client'

/** Trimmed from a live `/networks/solana/pools/{address}` response. */
const RAW: RawGeckoPool = {
  id: 'solana_58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
  attributes: {
    address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    name: 'SOL / USDC',
    base_token_price_usd: '74.423107',
    quote_token_price_usd: '0.99981',
    base_token_price_quote_token: '74.4653726',
    pool_created_at: '2021-03-30T07:53:19Z',
    fdv_usd: '723283646.68',
    price_change_percentage: { h1: '0.37', h24: '-1.88' },
    volume_usd: { h1: '142403.91', h24: '1832094.72' },
    reserve_in_usd: '10323074.03',
    transactions: {
      h24: { buys: 23033, sells: 19204, buyers: 4102, sellers: 3980 },
    },
  },
  relationships: { dex: { data: { id: 'raydium' } } },
}

describe('numberOrNull', () => {
  it('parses the numeric strings the API sends', () => {
    expect(numberOrNull('74.42')).toBe(74.42)
    expect(numberOrNull(12)).toBe(12)
  })

  it('is null for everything that is not a number', () => {
    // The distinction the panes depend on: a field the API omitted must not
    // arrive as 0, or "no fee published" renders as a free pool.
    expect(numberOrNull(null)).toBeNull()
    expect(numberOrNull(undefined)).toBeNull()
    expect(numberOrNull('')).toBeNull()
    expect(numberOrNull('  ')).toBeNull()
    expect(numberOrNull('NaN')).toBeNull()
    expect(numberOrNull(Infinity)).toBeNull()
  })
})

describe('splitPoolName', () => {
  it('splits the two legs', () => {
    expect(splitPoolName('SOL / USDC')).toEqual({
      base: 'SOL',
      quote: 'USDC',
    })
  })

  it('drops the fee suffix from the quote leg', () => {
    expect(splitPoolName('BRETT / WETH 1%')).toEqual({
      base: 'BRETT',
      quote: 'WETH',
    })
  })

  it('reports nothing for a label that is not a pair', () => {
    expect(splitPoolName('Whirlpool')).toEqual({ base: null, quote: null })
  })
})

describe('feeTierFromName', () => {
  it('reads the percentage EVM venues append', () => {
    expect(feeTierFromName('BRETT / WETH 1%')).toBe(0.01)
    expect(feeTierFromName('USDC / WETH 0.05%')).toBeCloseTo(0.0005, 10)
  })

  it('is null when the venue wrote no fee', () => {
    // Most Solana labels carry none, and a default tier is a number a user
    // could size against that nobody measured.
    expect(feeTierFromName('SOL / USDC')).toBeNull()
    expect(feeTierFromName('')).toBeNull()
  })

  it('rejects a percentage that cannot be a fee tier', () => {
    expect(feeTierFromName('SCAM / WETH 100%')).toBeNull()
    expect(feeTierFromName('SCAM / WETH 0%')).toBeNull()
  })
})

describe('parsePoolStats', () => {
  const stats = parsePoolStats(RAW, 'solana')!

  it('maps the published fields', () => {
    expect(stats.address).toBe('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2')
    expect(stats.dexName).toBe('raydium')
    expect(stats.baseSymbol).toBe('SOL')
    expect(stats.quoteSymbol).toBe('USDC')
    expect(stats.priceUsd).toBe(74.423107)
    expect(stats.quotePriceUsd).toBe(0.99981)
    expect(stats.volume24hUsd).toBe(1832094.72)
    expect(stats.reserveUsd).toBe(10323074.03)
    expect(stats.change24hPct).toBe(-1.88)
    expect(stats.trades24h).toEqual({
      buys: 23033,
      sells: 19204,
      buyers: 4102,
      sellers: 3980,
    })
    expect(stats.source).toBe('geckoterminal')
  })

  it('leaves per-side reserves null rather than halving the USD figure', () => {
    // The invariant a user notices when it breaks: a concentrated-liquidity
    // pool would show two invented token balances that do not add up to the
    // swap they then get.
    expect(stats.baseReserve).toBeNull()
    expect(stats.quoteReserve).toBeNull()
    expect(stats.buyVolume24hUsd).toBeNull()
    expect(stats.sellVolume24hUsd).toBeNull()
  })

  it('returns null for a payload with no address', () => {
    expect(parsePoolStats({ attributes: { name: 'x' } }, 'solana')).toBeNull()
    expect(parsePoolStats({}, 'solana')).toBeNull()
  })
})
