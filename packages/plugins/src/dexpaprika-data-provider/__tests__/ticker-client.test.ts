// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { assertTickerConformant } from '../../test-utils/conformance'
import { toTicker } from '../ticker-client'

// Real DexPaprika pool-details shape (SOL/USDC on Solana), captured live.
const POOL_DETAIL = {
  last_price: 64.875,
  last_price_usd: 64.8786,
  price_time: '2026-06-07T16:07:33Z',
  price_stats: { high_24h: 66.108, low_24h: 61.269 },
  '24h': { last_price_usd_change: 4.6976, volume_usd: 104980146.17 },
}

describe('dexpaprika toTicker — real API field mapping', () => {
  it('maps last_price_usd_change straight to change24h as a percent', () => {
    const t = toTicker(POOL_DETAIL)
    expect(t.change24h).toBeCloseTo(4.6976, 4)
  })

  it('verifies the percent reading is self-consistent (implied prior price in 24h range)', () => {
    // If change24h is a percent, price 24h ago = last / (1 + pct/100) must fall
    // within [low_24h, high_24h]. The absolute reading would fall below the low.
    const t = toTicker(POOL_DETAIL)
    const impliedPrior = t.last / (1 + t.change24h / 100)
    expect(impliedPrior).toBeGreaterThanOrEqual(POOL_DETAIL.price_stats.low_24h)
    expect(impliedPrior).toBeLessThanOrEqual(POOL_DETAIL.price_stats.high_24h)
  })

  it('maps price, volume, high/low and parses price_time to epoch ms', () => {
    const t = toTicker(POOL_DETAIL)
    expect(t.last).toBe(64.8786)
    expect(t.high24h).toBe(66.108)
    expect(t.low24h).toBe(61.269)
    expect(t.volume24h).toBeCloseTo(104980146.17, 2)
    expect(t.ts).toBe(Date.parse('2026-06-07T16:07:33Z'))
  })

  it('produces a non-crossed, conformant ticker', () => {
    const t = toTicker(POOL_DETAIL)
    expect(t.bid).toBeLessThan(t.ask)
    assertTickerConformant(t)
  })

  it('falls back gracefully when 24h/price_stats are missing', () => {
    const t = toTicker({ last_price_usd: 10 })
    expect(t.change24h).toBe(0)
    expect(t.last).toBe(10)
  })
})
