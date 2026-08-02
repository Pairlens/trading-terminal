// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseCoinbaseBulkProduct } from '../parser'

// Real Coinbase /market/products product shape (numeric strings).
const CB_PRODUCT = {
  product_id: 'BTC-USD',
  price: '62733.82',
  price_percentage_change_24h: '0.09637',
  volume_24h: '12345.6',
  is_disabled: false,
  trading_disabled: false,
  product_type: 'SPOT',
}

describe('coinbase bulk product parsing', () => {
  it('parses a product into a canonical bulk entry', () => {
    const entry = parseCoinbaseBulkProduct(CB_PRODUCT)
    expect(entry).not.toBeNull()
    expect(entry!.symbol).toBe('BTC-USD')
    expect(entry!.price).toBe(62733.82)
    expect(entry!.change24h).toBeCloseTo(0.09637, 6)
  })

  it('drops disabled and unpriced products', () => {
    expect(
      parseCoinbaseBulkProduct({ ...CB_PRODUCT, is_disabled: true }),
    ).toBeNull()
    expect(
      parseCoinbaseBulkProduct({ ...CB_PRODUCT, trading_disabled: true }),
    ).toBeNull()
    expect(parseCoinbaseBulkProduct({ ...CB_PRODUCT, price: '' })).toBeNull()
    expect(
      parseCoinbaseBulkProduct({ ...CB_PRODUCT, product_id: '' }),
    ).toBeNull()
  })
})
