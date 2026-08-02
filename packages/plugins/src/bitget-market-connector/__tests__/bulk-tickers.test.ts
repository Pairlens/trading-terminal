// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseBitgetBulkTickerRow } from '../parser'

// Real /api/v2/spot/market/tickers row — change24h is a fraction.
const ROW = {
  symbol: 'TRXUSDT',
  lastPr: '0.33036',
  change24h: '0.01534',
  open: '0.32546',
}

describe('bitget bulk ticker parsing', () => {
  it('denormalizes symbols and scales fraction changes', () => {
    const entry = parseBitgetBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('TRX-USDT')
    expect(entry!.price).toBe(0.33036)
    expect(entry!.change24h).toBeCloseTo(1.534, 6)
  })

  it('drops unmappable and unpriced rows', () => {
    expect(parseBitgetBulkTickerRow({ ...ROW, symbol: 'WEIRD' })).toBeNull()
    expect(parseBitgetBulkTickerRow({ ...ROW, lastPr: '0' })).toBeNull()
  })
})
