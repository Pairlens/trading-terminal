// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { mexcSymbolToCanonical, parseMexcBulkTickerRow } from '../parser'

// Real /api/v3/ticker/24hr row — priceChangePercent is a FRACTION on MEXC.
const ROW = {
  symbol: 'METALUSDT',
  lastPrice: '0.10954',
  priceChangePercent: '-0.0393',
}

describe('mexc bulk ticker parsing', () => {
  it('maps concatenated symbols and fraction changes', () => {
    expect(mexcSymbolToCanonical('METALUSDT')).toBe('METAL-USDT')
    const entry = parseMexcBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('METAL-USDT')
    expect(entry!.price).toBe(0.10954)
    expect(entry!.change24h).toBeCloseTo(-3.93, 6)
  })

  it('drops unmappable and unpriced rows', () => {
    expect(parseMexcBulkTickerRow({ ...ROW, symbol: 'NOPE' })).toBeNull()
    expect(parseMexcBulkTickerRow({ ...ROW, lastPrice: '0' })).toBeNull()
  })
})
