// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseGateBulkTickerRow } from '../parser'

// Real /api/v4/spot/tickers row — change_percentage is already percent.
const ROW = {
  currency_pair: 'NMR_USDT',
  last: '9.661',
  change_percentage: '1.1',
}

describe('gate bulk ticker parsing', () => {
  it('maps underscored pairs and percent changes verbatim', () => {
    const entry = parseGateBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('NMR-USDT')
    expect(entry!.price).toBe(9.661)
    expect(entry!.change24h).toBe(1.1)
  })

  it('drops malformed and unpriced rows', () => {
    expect(parseGateBulkTickerRow({ ...ROW, currency_pair: 'X' })).toBeNull()
    expect(parseGateBulkTickerRow({ ...ROW, last: '0' })).toBeNull()
  })
})
