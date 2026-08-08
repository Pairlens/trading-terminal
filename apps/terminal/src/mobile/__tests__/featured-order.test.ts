// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { orderFeatured } from '../panels/featured-order'

const POOL = ['BTC', 'AAPL', 'MSFT', 'ETH', 'NVDA', 'SOL', 'TSLA']
const CRYPTO = new Set(['BTC', 'ETH', 'SOL'])

describe('orderFeatured', () => {
  it('puts priced entries first and keeps the catalog order inside each group', () => {
    expect(orderFeatured(POOL, (s) => CRYPTO.has(s), 7)).toEqual([
      'BTC',
      'ETH',
      'SOL',
      'AAPL',
      'MSFT',
      'NVDA',
      'TSLA',
    ])
  })

  it('fills the strip with what it can price — the reported bug', () => {
    // Rank order alone gave BTC · AAPL · MSFT · ETH · NVDA, three of them dead.
    expect(orderFeatured(POOL, (s) => CRYPTO.has(s), 5)).toEqual([
      'BTC',
      'ETH',
      'SOL',
      'AAPL',
      'MSFT',
    ])
  })

  it('is the catalog order when everything prices', () => {
    expect(orderFeatured(POOL, () => true, 5)).toEqual(POOL.slice(0, 5))
  })

  it('is the catalog order when nothing prices', () => {
    expect(orderFeatured(POOL, () => false, 5)).toEqual(POOL.slice(0, 5))
  })

  it('never returns more than the limit, and survives a degenerate one', () => {
    expect(orderFeatured(POOL, () => true, 0)).toEqual([])
    expect(orderFeatured(POOL, () => true, -3)).toEqual([])
    expect(orderFeatured([], () => true, 5)).toEqual([])
  })

  it('does not mutate the pool it was given', () => {
    const pool = [...POOL]
    orderFeatured(pool, (s) => CRYPTO.has(s), 5)
    expect(pool).toEqual(POOL)
  })
})
