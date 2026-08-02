// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseOkxBulkTickerRow } from '../parser'

// Real OKX /api/v5/market/tickers row shape (all strings).
const OKX_ROW = {
  instType: 'SPOT',
  instId: 'BTC-USDT',
  last: '62733.8',
  open24h: '62673.4',
  sodUtc0: '62500.0',
  high24h: '63400.1',
  low24h: '62100.5',
  vol24h: '12345.6',
  ts: '1783260000000',
}

describe('okx bulk ticker parsing', () => {
  it('parses a row into a canonical bulk entry', () => {
    const entry = parseOkxBulkTickerRow(OKX_ROW)
    expect(entry).not.toBeNull()
    expect(entry!.symbol).toBe('BTC-USDT')
    expect(entry!.price).toBe(62733.8)
    // change vs open24h: (62733.8 - 62673.4) / 62673.4 * 100
    expect(entry!.change24h).toBeCloseTo(0.09637, 3)
  })

  it('falls back to sodUtc0 when open24h is missing', () => {
    const entry = parseOkxBulkTickerRow({ ...OKX_ROW, open24h: '' })
    expect(entry!.change24h).toBeCloseTo(
      ((62733.8 - 62500.0) / 62500.0) * 100,
      6,
    )
  })

  it('drops unpriced or malformed rows', () => {
    expect(parseOkxBulkTickerRow({ ...OKX_ROW, last: '0' })).toBeNull()
    expect(parseOkxBulkTickerRow({ ...OKX_ROW, last: 'nan' })).toBeNull()
    expect(parseOkxBulkTickerRow({ ...OKX_ROW, instId: '' })).toBeNull()
  })

  it('reports zero change when no reference price exists', () => {
    const entry = parseOkxBulkTickerRow({
      ...OKX_ROW,
      open24h: '',
      sodUtc0: '',
    })
    expect(entry!.change24h).toBe(0)
  })
})
