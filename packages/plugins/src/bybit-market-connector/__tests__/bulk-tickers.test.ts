// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { bybitSymbolToCanonical, parseBybitBulkTickerRow } from '../parser'

// Real /v5/market/tickers?category=spot row.
const ROW = {
  symbol: 'RENDERUSDC',
  lastPrice: '1.591',
  prevPrice24h: '1.595',
  price24hPcnt: '-0.0025',
}

describe('bybit bulk ticker parsing', () => {
  it('maps concatenated symbols and fraction changes', () => {
    expect(bybitSymbolToCanonical('BTCUSDT')).toBe('BTC-USDT')
    expect(bybitSymbolToCanonical('RENDERUSDC')).toBe('RENDER-USDC')
    const entry = parseBybitBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('RENDER-USDC')
    expect(entry!.price).toBe(1.591)
    expect(entry!.change24h).toBeCloseTo(-0.25, 6)
  })

  it('drops unmappable and unpriced rows', () => {
    expect(parseBybitBulkTickerRow({ ...ROW, symbol: 'WEIRD' })).toBeNull()
    expect(parseBybitBulkTickerRow({ ...ROW, lastPrice: '0' })).toBeNull()
  })
})
