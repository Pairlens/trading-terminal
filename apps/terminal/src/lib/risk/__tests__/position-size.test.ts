// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  evaluatePositionSize,
  orderNotionalUsd,
  priceUsdFor,
} from '../position-size'

const prices = new Map<string, number>([
  ['BTC', 60000],
  ['ETH', 3000],
])

describe('priceUsdFor', () => {
  it('prices stablecoins at $1', () => {
    expect(priceUsdFor('USDT', prices)).toBe(1)
    expect(priceUsdFor('usdc', prices)).toBe(1)
  })
  it('uses the price map for other assets, null when unknown', () => {
    expect(priceUsdFor('BTC', prices)).toBe(60000)
    expect(priceUsdFor('DOGE', prices)).toBeNull()
  })
})

describe('orderNotionalUsd', () => {
  it('base-denominated buy on a USDT pair: size × price', () => {
    const n = orderNotionalUsd(
      { pair: 'BTC-USDT', size: 0.5, quoteDenominated: false, price: 60000 },
      prices,
    )
    expect(n).toBe(30000)
  })

  it('quote-denominated order: size is already the quote (USD) amount', () => {
    const n = orderNotionalUsd(
      { pair: 'BTC-USDT', size: 250, quoteDenominated: true, price: 60000 },
      prices,
    )
    expect(n).toBe(250)
  })

  it('falls back to a direct base→USD price when no order price given', () => {
    const n = orderNotionalUsd(
      { pair: 'ETH-USDT', size: 2, quoteDenominated: false, price: null },
      prices,
    )
    expect(n).toBe(6000)
  })

  it('returns null when the asset cannot be priced', () => {
    const n = orderNotionalUsd(
      { pair: 'DOGE-USDT', size: 100, quoteDenominated: false, price: null },
      prices,
    )
    expect(n).toBeNull()
  })
})

describe('evaluatePositionSize', () => {
  it('flags an order exceeding the % limit', () => {
    // 30000 / 100000 = 30% > 25%
    const v = evaluatePositionSize(30000, 100000, 25)
    expect(v.exceeds).toBe(true)
    expect(v.ratioPct).toBeCloseTo(30, 6)
  })

  it('allows an order within the limit', () => {
    const v = evaluatePositionSize(20000, 100000, 25)
    expect(v.exceeds).toBe(false)
    expect(v.ratioPct).toBeCloseTo(20, 6)
  })

  it('fail-open: disabled limit, zero portfolio, or unknown notional never blocks', () => {
    expect(evaluatePositionSize(30000, 100000, 0).exceeds).toBe(false)
    expect(evaluatePositionSize(30000, 0, 25).exceeds).toBe(false)
    expect(evaluatePositionSize(null, 100000, 25).exceeds).toBe(false)
  })
})
