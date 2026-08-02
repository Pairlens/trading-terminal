// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { krakenWsNameToCanonical, parseKrakenBulkEntry } from '../parser'

// Real /0/public/Ticker entry (c = [last, lot volume], o = today's open).
const ENTRY = {
  c: ['62882.0', '0.5'] as Array<string>,
  o: '62450.0',
}

describe('kraken bulk ticker parsing', () => {
  it('maps wsnames with classic-code aliases', () => {
    expect(krakenWsNameToCanonical('XBT/USD')).toBe('BTC-USD')
    expect(krakenWsNameToCanonical('XDG/EUR')).toBe('DOGE-EUR')
    expect(krakenWsNameToCanonical('SOL/USDT')).toBe('SOL-USDT')
    expect(krakenWsNameToCanonical('MALFORMED')).toBeNull()
  })

  it('derives change from the daily open', () => {
    const entry = parseKrakenBulkEntry('XBT/USD', ENTRY)
    expect(entry!.symbol).toBe('BTC-USD')
    expect(entry!.price).toBe(62882)
    expect(entry!.change24h).toBeCloseTo(((62882 - 62450) / 62450) * 100, 6)
  })

  it('drops unpriced entries and survives a missing open', () => {
    expect(parseKrakenBulkEntry('XBT/USD', { c: ['0'], o: '1' })).toBeNull()
    expect(parseKrakenBulkEntry('XBT/USD', { c: ['5'] })!.change24h).toBe(0)
  })
})
