// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  assetClassFromQuoteLeg,
  normalizePairKey,
  splitPairAssets,
} from '../pairs'

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

/**
 * The index that normally answers this is an App Server read, so standalone,
 * offline, or signed out it answers for nothing — and a caller that then falls
 * back to the preferred venue routed 'BTC-USDT' to Alpaca, which quoted its
 * base leg 'BTC' (a real NYSE Arca spot-bitcoin ETF) at ~$28 under the crypto
 * pair's own label.
 */
describe('assetClassFromQuoteLeg', () => {
  test('a non-USD quote leg is not a US equity', () => {
    expect(assetClassFromQuoteLeg('BTC-USDT')).toBe('crypto-spot')
    expect(assetClassFromQuoteLeg('ETH-USDC')).toBe('crypto-spot')
    expect(assetClassFromQuoteLeg('BTC-EUR')).toBe('crypto-spot')
    expect(assetClassFromQuoteLeg('btc/usdt')).toBe('crypto-spot')
  })

  // Both a crypto pair and a spot-bitcoin ETF can be written 'BTC-USD', and
  // only the index can tell them apart. A confident wrong answer here would
  // be worse than none, so it declines.
  test('a USD quote leg is ambiguous and stays unknown', () => {
    expect(assetClassFromQuoteLeg('BTC-USD')).toBeUndefined()
    expect(assetClassFromQuoteLeg('AAPL-USD')).toBeUndefined()
  })

  test('a bare ticker carries no quote leg to read', () => {
    expect(assetClassFromQuoteLeg('AAPL')).toBeUndefined()
    expect(assetClassFromQuoteLeg('')).toBeUndefined()
  })
})

/**
 * The strip is where the mis-routing was seen, so pin that it asks.
 */
describe('the recent-pairs strip routes on the pair key too', () => {
  const src = readFileSync(
    join(
      import.meta.dir,
      '..',
      '..',
      'components/terminal/recent-tickers-marquee.tsx',
    ),
    'utf8',
  )

  test('resolveVenue falls back to the quote leg, not to the preferred venue', () => {
    expect(src).toMatch(/assetClass \?\? assetClassFromQuoteLeg\(symbol\)/)
  })

  test('the symbol is threaded through to it', () => {
    expect(src).toMatch(/resolveVenue\(\s*\n?\s*symbol,/)
  })
})
