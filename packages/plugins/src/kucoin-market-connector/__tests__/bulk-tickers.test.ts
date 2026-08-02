// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { parseKucoinBulkTickerRow } from '../parser'

// Real /api/v1/market/allTickers ticker row.
const ROW = {
  symbol: 'CLANKER-USDT',
  last: '15.944',
  changeRate: '-0.0519',
}

describe('kucoin bulk ticker parsing', () => {
  it('keeps canonical symbols and scales fraction changes', () => {
    const entry = parseKucoinBulkTickerRow(ROW)
    expect(entry!.symbol).toBe('CLANKER-USDT')
    expect(entry!.price).toBe(15.944)
    expect(entry!.change24h).toBeCloseTo(-5.19, 6)
  })

  it('drops malformed and unpriced rows', () => {
    expect(parseKucoinBulkTickerRow({ ...ROW, symbol: 'NODASH' })).toBeNull()
    expect(parseKucoinBulkTickerRow({ ...ROW, last: '' })).toBeNull()
  })
})
