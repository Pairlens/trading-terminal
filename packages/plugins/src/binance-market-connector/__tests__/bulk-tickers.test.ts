// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { binanceSymbolToCanonical, parseBinanceBulkTickerRow } from '../parser'

// Real Binance /api/v3/ticker/24hr row shape.
const BINANCE_ROW = {
  symbol: 'BTCUSDT',
  lastPrice: '62733.82000000',
  priceChangePercent: '0.096',
  volume: '12345.6',
}

describe('binance symbol → canonical mapping', () => {
  it('maps quote suffixes unambiguously', () => {
    expect(binanceSymbolToCanonical('BTCUSDT')).toBe('BTC-USDT')
    expect(binanceSymbolToCanonical('ETHBTC')).toBe('ETH-BTC')
    // Longest suffix wins: TUSD before USD.
    expect(binanceSymbolToCanonical('BTCTUSD')).toBe('BTC-TUSD')
    expect(binanceSymbolToCanonical('BTCFDUSD')).toBe('BTC-FDUSD')
    expect(binanceSymbolToCanonical('SOLUSD')).toBe('SOL-USD')
  })

  it('rejects symbols with no known quote or an empty base', () => {
    expect(binanceSymbolToCanonical('WEIRDPAIR')).toBeNull()
    expect(binanceSymbolToCanonical('USDT')).toBeNull()
    expect(binanceSymbolToCanonical('')).toBeNull()
  })
})

describe('binance bulk ticker parsing', () => {
  it('parses a row into a canonical bulk entry', () => {
    const entry = parseBinanceBulkTickerRow(BINANCE_ROW)
    expect(entry).not.toBeNull()
    expect(entry!.symbol).toBe('BTC-USDT')
    expect(entry!.price).toBe(62733.82)
    expect(entry!.change24h).toBe(0.096)
  })

  it('drops delisted (zero-price) and unmappable rows', () => {
    expect(
      parseBinanceBulkTickerRow({ ...BINANCE_ROW, lastPrice: '0.00000000' }),
    ).toBeNull()
    expect(
      parseBinanceBulkTickerRow({ ...BINANCE_ROW, symbol: 'WEIRDPAIR' }),
    ).toBeNull()
  })
})
