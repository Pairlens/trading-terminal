// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseCryptocomBulkTickerRow } from '../parser'

// Real /exchange/v1/public/get-tickers row — c is a fraction.
const ROW = {
  i: 'ACH_USD',
  a: '0.004500',
  c: '-0.0162',
}

describe('cryptocom bulk ticker parsing', () => {
  it('maps spot instruments and scales fraction changes', () => {
    const entry = parseCryptocomBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('ACH-USD')
    expect(entry!.price).toBe(0.0045)
    expect(entry!.change24h).toBeCloseTo(-1.62, 6)
  })

  it('skips derivatives and unpriced rows', () => {
    expect(parseCryptocomBulkTickerRow({ ...ROW, i: 'BTCUSD-PERP' })).toBeNull()
    expect(parseCryptocomBulkTickerRow({ ...ROW, a: '0' })).toBeNull()
  })
})
