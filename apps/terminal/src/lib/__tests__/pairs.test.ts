// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  assetClassFromQuoteLeg,
  isPerpPairKey,
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

  test('a perpetual key carries a third leg: the settle currency', () => {
    expect(splitPairAssets('BTC-USDT-USDT')).toEqual({
      base: 'BTC',
      quote: 'USDT',
      settle: 'USDT',
    })
    // Kraken's linear perps are USD-settled, so quote and settle agree there
    // too but for a different reason. Both still have to survive the split.
    expect(splitPairAssets('BTC-USD-USD')).toEqual({
      base: 'BTC',
      quote: 'USD',
      settle: 'USD',
    })
  })

  test('a spot key has no settle leg at all, not an empty one', () => {
    // Callers branch on presence. An empty string would read as a perp whose
    // settle currency could not be priced, which is a different bug.
    expect(splitPairAssets('BTC-USDT').settle).toBeUndefined()
    expect(splitPairAssets('AAPL', { equity: true }).settle).toBeUndefined()
  })

  test('a third segment that does not repeat the quote is not a settle leg', () => {
    // Prediction outcome keys are dash-joined too, and "any third segment is
    // the settle currency" routed a Kalshi ticker onto a futures venue. Every
    // v1 futures venue lists LINEAR contracts, where settle IS the quote, so
    // the repeat is the discriminator.
    expect(splitPairAssets('KXBTCD-26AUG15-T53').settle).toBeUndefined()
    // Inverse contracts share this shape and are out of scope until a venue
    // ships one; when that happens this test learns their shape rather than
    // loosening back to a segment count.
    expect(splitPairAssets('BTC-USD-BTC').settle).toBeUndefined()
  })
})

/**
 * The segment count IS the type tag for the whole perp surface: the risk
 * guard's contract-pricing branch, the mobile route sync's venue choice, and
 * the position ledger staying uncorrupted all hang off it.
 */
describe('isPerpPairKey', () => {
  test('three segments is a perpetual, two or one is not', () => {
    expect(isPerpPairKey('BTC-USDT-USDT')).toBe(true)
    expect(isPerpPairKey('BTC-USDT')).toBe(false)
    expect(isPerpPairKey('AAPL')).toBe(false)
  })

  test('it normalises first, so a route-cased key is still recognised', () => {
    expect(isPerpPairKey('btc/usdt/usdt')).toBe(true)
    expect(isPerpPairKey(' eth_usdt_usdt ')).toBe(true)
  })

  test('a prediction outcome key is never a perpetual, whatever its shape', () => {
    // The regression this exists for: a Kalshi ticker has three dash-joined
    // segments and its NO side has four, and reading either as a contract sent
    // the route correction to a futures venue that has never heard of it.
    expect(isPerpPairKey('KXBTCD-26AUG15-T53')).toBe(false)
    expect(isPerpPairKey('KXBTCD-26AUG15-T53-NO')).toBe(false)
    expect(isPerpPairKey('KXPRESPARTY-28-DEM')).toBe(false)
  })

  test('four segments is not a perpetual either', () => {
    expect(isPerpPairKey('BTC-USDT-USDT-USDT')).toBe(false)
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

  // A settle leg answers confidently where the two-segment case cannot: no
  // equity ticker and no spot pair is ever written with three segments, so
  // 'BTC-USD-USD' is knowable even though 'BTC-USD' is not.
  test('a settle leg makes the perpetual case unambiguous', () => {
    expect(assetClassFromQuoteLeg('BTC-USDT-USDT')).toBe('crypto-perp')
    expect(assetClassFromQuoteLeg('BTC-USD-USD')).toBe('crypto-perp')
    expect(assetClassFromQuoteLeg('btc/usdt/usdt')).toBe('crypto-perp')
  })

  test('a dash-joined key whose third segment differs stays unknown', () => {
    // A prediction outcome's shape. Answering 'crypto-perp' here is what put
    // a Kalshi ticker on a futures venue; the directory pin names its venue
    // explicitly, and undefined is what lets that pin win.
    expect(assetClassFromQuoteLeg('KXBTCD-26AUG15-T53')).toBeUndefined()
    expect(assetClassFromQuoteLeg('KXBTCD-26AUG15-T53-NO')).toBeUndefined()
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
