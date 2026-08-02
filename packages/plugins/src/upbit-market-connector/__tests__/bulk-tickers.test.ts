// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseUpbitBulkTickerRow } from '../parser'

// Real /v1/ticker/all row — market codes are quote-first.
const ROW = {
  market: 'KRW-XRP',
  trade_price: 1714.0,
  signed_change_rate: -0.017765043,
}

describe('upbit bulk ticker parsing', () => {
  it('reverses quote-first market codes and scales fraction changes', () => {
    const entry = parseUpbitBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('XRP-KRW')
    expect(entry!.price).toBe(1714)
    expect(entry!.change24h).toBeCloseTo(-1.7765043, 6)
  })

  it('drops malformed and unpriced rows', () => {
    expect(parseUpbitBulkTickerRow({ ...ROW, market: 'NODASH' })).toBeNull()
    expect(parseUpbitBulkTickerRow({ ...ROW, trade_price: 0 })).toBeNull()
  })
})
