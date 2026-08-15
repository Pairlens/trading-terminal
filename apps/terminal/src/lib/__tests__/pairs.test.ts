// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { normalizePairKey, splitPairAssets } from '../pairs'

describe('normalizePairKey', () => {
  test('canonicalises separators and case', () => {
    expect(normalizePairKey('btc/usdt')).toBe('BTC-USDT')
    expect(normalizePairKey(' eth_usd ')).toBe('ETH-USD')
    expect(normalizePairKey('BTC-USDT')).toBe('BTC-USDT')
  })
})

describe('splitPairAssets', () => {
  test('reads both legs straight off a crypto key', () => {
    expect(splitPairAssets('BTC-USDT')).toEqual({
      base: 'BTC',
      quote: 'USDT',
    })
  })

  // A stock instrument's key is the bare ticker, shared with the App Server
  // catalog. The quote can only come from the venue.
  test('quotes a bare equity ticker in USD', () => {
    expect(splitPairAssets('AAPL', { equity: true })).toEqual({
      base: 'AAPL',
      quote: 'USD',
    })
  })

  test('keeps the crypto default for a bare non-equity key', () => {
    expect(splitPairAssets('BTC')).toEqual({ base: 'BTC', quote: 'USDT' })
  })

  // 'AAPL-USD' reaches the ticket too (the connector's own pair form), and
  // must not be overridden by the equity default.
  test('an explicit quote always wins over the fallback', () => {
    expect(splitPairAssets('AAPL-USD', { equity: true }).quote).toBe('USD')
    expect(splitPairAssets('BTC-EUR', { equity: false }).quote).toBe('EUR')
  })
})
