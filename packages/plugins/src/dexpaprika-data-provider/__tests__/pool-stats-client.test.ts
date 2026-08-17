// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  normalizeFee,
  parseNetworkStats,
  parsePoolStats,
  scaleReserve,
} from '../pool-stats-client'
import type { RawDexPaprikaPool } from '../pool-stats-client'

/** Trimmed from a live `/networks/solana/pools/{id}` response. */
const RAW: RawDexPaprikaPool = {
  id: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
  chain: 'solana',
  dex_name: 'Raydium',
  fee: null,
  created_at: '2021-03-30T07:53:19Z',
  base_token_id: 'So11111111111111111111111111111111111111112',
  quote_token_id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  last_price: 74.4653726,
  last_price_usd: 74.4231071,
  liquidity_usd: 10323074.03,
  tokens: [
    {
      id: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      decimals: 9,
    },
    {
      id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      decimals: 6,
    },
  ],
  token_reserves: [
    {
      token_id: 'So11111111111111111111111111111111111111112',
      reserve: 69508766849564,
      reserve_usd: 5167439.07,
    },
    {
      token_id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      reserve: 5155431290169,
      reserve_usd: 5155634.95,
    },
  ],
  '24h': {
    last_price_usd_change: -1.88,
    volume_usd: 1832094.72,
    buy_usd: 917231.22,
    sell_usd: 914863.5,
    buys: 23033,
    sells: 19204,
  },
}

describe('scaleReserve', () => {
  it('scales raw on-chain units by the token decimals', () => {
    expect(scaleReserve(69508766849564, 9)).toBeCloseTo(69508.766849564, 6)
  })

  it('is null when the decimals are unknown', () => {
    // Rendering an unscaled reserve would show a 9-lamport pool as 69 trillion
    // SOL, which is the kind of wrong that reads as a data outage.
    expect(scaleReserve(69508766849564, undefined)).toBeNull()
    expect(scaleReserve(undefined, 9)).toBeNull()
  })
})

describe('normalizeFee', () => {
  it('turns the published percentage into a fraction', () => {
    expect(normalizeFee(0.05)).toBeCloseTo(0.0005, 10)
    expect(normalizeFee(1)).toBeCloseTo(0.01, 10)
  })

  it('drops values that cannot be a fee tier', () => {
    expect(normalizeFee(null)).toBeNull()
    expect(normalizeFee(0)).toBeNull()
    expect(normalizeFee(100)).toBeNull()
  })
})

describe('parsePoolStats', () => {
  const stats = parsePoolStats(RAW, 'solana')!

  it('fills the fields GeckoTerminal cannot', () => {
    // This provider exists for exactly these three: both reserves and the
    // 24h buy/sell split.
    expect(stats.baseReserve).toBeCloseTo(69508.766849564, 6)
    expect(stats.quoteReserve).toBeCloseTo(5155431.290169, 6)
    expect(stats.buyVolume24hUsd).toBe(917231.22)
    expect(stats.sellVolume24hUsd).toBe(914863.5)
  })

  it('derives the quote leg price from the two prices that are published', () => {
    expect(stats.quotePriceUsd).toBeCloseTo(74.4231071 / 74.4653726, 10)
  })

  it('names the pool from its two legs', () => {
    expect(stats.name).toBe('SOL / USDC')
    expect(stats.source).toBe('dexpaprika')
  })

  it('returns null with no pool id', () => {
    expect(parsePoolStats({}, 'solana')).toBeNull()
  })
})

describe('parseNetworkStats', () => {
  const rows = [
    {
      id: 'solana',
      display_name: 'Solana',
      volume_usd_24h: 3.8e9,
      txns_24h: 12,
      pools_count: 900,
    },
    { id: 'base', display_name: 'Base', volume_usd_24h: 1.2e9 },
  ]

  it('answers for exactly the chains asked about, in order', () => {
    const stats = parseNetworkStats(rows, [
      { market: 'base', network: 'base' },
      { market: 'jupiter', network: 'solana' },
    ])
    expect(stats.map((s) => s.market)).toEqual(['base', 'jupiter'])
    expect(stats[1].volume24hUsd).toBe(3.8e9)
    expect(stats[1].coverage).toBe('network')
  })

  it('keeps a row for a chain the provider does not list', () => {
    // The pane still has a chain to draw; it just has nothing to put in the
    // number columns, which is the honest reading of "not covered".
    const [row] = parseNetworkStats(rows, [
      { market: 'polygon', network: 'polygon' },
    ])
    expect(row.displayName).toBe('polygon')
    expect(row.volume24hUsd).toBeNull()
    expect(row.poolsCount).toBeNull()
  })
})
