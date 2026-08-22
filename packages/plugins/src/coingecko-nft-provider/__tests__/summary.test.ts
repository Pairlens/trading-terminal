// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The unit conversion, pinned.
 *
 * CoinGecko publishes changes as PERCENTAGES and the wire contract carries
 * FRACTIONS. Getting that backwards renders a 3% move as 300%, which reads as
 * a data outage rather than a unit bug, so nobody looks for it in the parser.
 */
import { describe, expect, test } from 'bun:test'

import { toSummary } from '../index'

const RAW = {
  id: 'pudgy-penguins',
  web_slug: 'pudgy-penguins',
  name: 'Pudgy Penguins',
  symbol: 'PPG',
  native_currency_symbol: 'eth',
  image: {
    small: 'https://example.test/s.jpg',
    small_2x: 'https://example.test/2x.jpg',
  },
  floor_price: { native_currency: 4.04, usd: 12_100 },
  market_cap: { native_currency: 36_360, usd: 108_900_000 },
  volume_24h: { native_currency: 120.5, usd: 361_000 },
  floor_price_24h_percentage_change: { native_currency: -3.2, usd: -2.9 },
  volume_24h_percentage_change: { native_currency: 15, usd: 15.4 },
  number_of_unique_addresses: 4_812,
  total_supply: 8_888,
  one_day_sales: 31,
  explorers: [{ name: 'Etherscan', link: 'https://etherscan.io/token/0xbd35' }],
}

describe('toSummary', () => {
  test('turns percentages into fractions', () => {
    const s = toSummary('ethereum', '0xbd35', RAW)
    expect(s.floorChange24h).toBeCloseTo(-0.032, 6)
    expect(s.volumeChange24h).toBeCloseTo(0.15, 6)
  })

  test('keeps native prices native and carries the ticker with them', () => {
    const s = toSummary('ethereum', '0xbd35', RAW)
    expect(s.floorPrice).toBe(4.04)
    expect(s.floorPriceUsd).toBe(12_100)
    expect(s.priceCurrency).toBe('ETH')
  })

  test('keeps the caller contract as identity, not the payload name', () => {
    // The row was reached BY contract. Letting the response rename the thing
    // it was asked about is how a pane ends up charting a different
    // collection than the one the user clicked.
    const s = toSummary('base', '0xABC', RAW)
    expect(s.contract).toBe('0xABC')
    expect(s.chain).toBe('base')
  })

  test('leaves an absent change absent rather than calling it zero', () => {
    // A collection whose floor did not move and one whose move the provider
    // did not publish are different facts, and a pane renders them
    // differently.
    const s = toSummary('ethereum', '0xbd35', {
      ...RAW,
      floor_price_24h_percentage_change: undefined,
    })
    expect(s.floorChange24h).toBeUndefined()
  })

  test('falls back to the contract when the payload has no name', () => {
    const s = toSummary('ethereum', '0xbd35', { ...RAW, name: undefined })
    expect(s.name).toBe('0xbd35')
  })
})
