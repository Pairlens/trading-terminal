// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseHtxBulkTickerRow } from '../parser'

// Real /market/tickers row — lowercase symbol, numeric fields.
const ROW = {
  symbol: 'zigusdt',
  open: 0.046607,
  close: 0.047383,
}

describe('htx bulk ticker parsing', () => {
  it('uppercases symbols and derives change from open/close', () => {
    const entry = parseHtxBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('ZIG-USDT')
    expect(entry!.price).toBe(0.047383)
    expect(entry!.change24h).toBeCloseTo(
      ((0.047383 - 0.046607) / 0.046607) * 100,
      6,
    )
  })

  it('drops unmappable and unpriced rows', () => {
    expect(parseHtxBulkTickerRow({ ...ROW, symbol: 'weird' })).toBeNull()
    expect(parseHtxBulkTickerRow({ ...ROW, close: 0 })).toBeNull()
  })
})
