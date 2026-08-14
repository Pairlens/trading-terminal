// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/**
 * The quote asset is not cosmetic: it keys the balance lookup and the order
 * presets, so an equity falling back to USDT shows "0 USDT" beside an account
 * holding dollars. Both tickets must derive it from the venue, and both must
 * do so AFTER the venue is known — the derivation used to sit above the
 * market lookup, which is exactly how the bug survived.
 */
describe('both tickets derive the quote from the venue', () => {
  const TICKETS = [
    ['desktop', 'components/terminal/trade-entry-panel.tsx'],
    ['mobile', 'mobile/panels/trade-panel.tsx'],
  ] as const

  for (const [name, path] of TICKETS) {
    const src = readFileSync(join(import.meta.dir, '..', '..', path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    test(`${name} uses splitPairAssets with the equity flag`, () => {
      expect(src).toMatch(/splitPairAssets\([^)]*\{\s*\n?\s*equity: isEquities/)
    })

    test(`${name} no longer hardcodes a USDT fallback`, () => {
      expect(src).not.toMatch(/split\('-'\)\[1\]\s*\?\?\s*'USDT'/)
    })

    test(`${name} derives it after the venue is resolved`, () => {
      expect(src.indexOf('const isEquities')).toBeGreaterThan(-1)
      expect(src.indexOf('splitPairAssets(')).toBeGreaterThan(
        src.indexOf('const isEquities'),
      )
    })
  }
})
