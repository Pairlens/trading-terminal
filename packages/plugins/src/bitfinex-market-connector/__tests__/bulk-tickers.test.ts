// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseBfxBulkTickerRow } from '../parser'

// Real /v2/tickers?symbols=ALL trading row:
// [SYMBOL, BID, BID_SZ, ASK, ASK_SZ, CHANGE, CHANGE_REL, LAST, VOL, HIGH, LOW]
const ROW = [
  'tBTCUSD',
  62882,
  2.31874614,
  62888,
  2.22016056,
  -53,
  -0.00084214,
  62882,
  613.40790394,
  63487,
  62450,
]

describe('bitfinex bulk ticker parsing', () => {
  it('parses trading rows with currency aliasing', () => {
    const entry = parseBfxBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('BTC-USD')
    expect(entry!.price).toBe(62882)
    expect(entry!.change24h).toBeCloseTo(-0.084214, 5)
  })

  it('maps UST → USDT and colon-separated long names', () => {
    const row = [...ROW]
    row[0] = 'tDOGE:UST'
    expect(parseBfxBulkTickerRow(row)!.symbol).toBe('DOGE-USDT')
  })

  it('skips funding rows and unpriced rows', () => {
    expect(parseBfxBulkTickerRow(['fUSD', 0, 0, 0, 0, 0, 0, 0])).toBeNull()
    const dead = [...ROW]
    dead[7] = 0
    expect(parseBfxBulkTickerRow(dead)).toBeNull()
  })
})
