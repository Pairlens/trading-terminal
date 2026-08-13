// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Edge cases the golden suite cannot express.
 *
 * The golden scenario proves one canonical payload normalizes identically
 * across every connector. What it cannot cover is what a venue does when it
 * omits or mistypes a field — and with ccxt in front, those cases collapse from
 * fourteen venue-specific bugs into these few.
 */

import { describe, expect, it } from 'bun:test'
import {
  assertCandleConformant,
  assertTickerConformant,
} from '../../test-utils/conformance'
import {
  ccxtBookTimestamp,
  fromCcxtSymbol,
  mapTimeframeToCcxt,
  normalizePair,
  parseCcxtBookLevels,
  parseCcxtBulkTickerRow,
  parseCcxtOhlcv,
  parseCcxtTicker,
  parseCcxtTrade,
  toCcxtSymbol,
} from '../parser'

describe('pair mapping', () => {
  it('round-trips between the app format and the ccxt symbol', () => {
    expect(toCcxtSymbol('btc-usdt')).toBe('BTC/USDT')
    expect(toCcxtSymbol('BTC/USDT')).toBe('BTC/USDT')
    expect(normalizePair('btc_usdt')).toBe('BTC-USDT')
    expect(fromCcxtSymbol('BTC/USDT')).toBe('BTC-USDT')
  })

  it('drops a settlement suffix so a perp symbol cannot leak in as spot', () => {
    expect(fromCcxtSymbol('BTC/USDT:USDT')).toBe('BTC-USDT')
  })
})

describe('timeframes', () => {
  it('keeps 1M (month) distinct from 1m (minute)', () => {
    expect(mapTimeframeToCcxt('1M')).toBe('1M')
    expect(mapTimeframeToCcxt('1m')).toBe('1m')
  })

  it('rejects a timeframe the app does not define', () => {
    expect(mapTimeframeToCcxt('7m')).toBeNull()
  })
})

describe('parseCcxtOhlcv', () => {
  it('coerces string values — Kraken streams OHLCV as strings over WS', () => {
    const candle = parseCcxtOhlcv([
      1_700_000_000_000,
      '100',
      '110',
      '95',
      '105',
      '12.5',
    ])
    expect(candle).not.toBeNull()
    assertCandleConformant(candle!, 'kraken-shaped')
    expect(candle?.close).toBe(105)
  })

  it('returns null rather than a NaN candle the buffer would mis-order', () => {
    expect(
      parseCcxtOhlcv([1_700_000_000_000, 100, 110, 95, 'abc', 1]),
    ).toBeNull()
    expect(parseCcxtOhlcv([1_700_000_000_000, 100])).toBeNull()
  })
})

describe('parseCcxtTicker', () => {
  it('passes `percentage` through untouched — it is already a percent', () => {
    const ticker = parseCcxtTicker({
      last: 105,
      percentage: 5,
      timestamp: 1_700_000_000_000,
    })
    expect(ticker.change24h).toBe(5)
  })

  it('derives the percent from `open` when the venue omits it', () => {
    const ticker = parseCcxtTicker({
      last: 105,
      open: 100,
      timestamp: 1_700_000_000_000,
    })
    expect(ticker.change24h).toBeCloseTo(5, 6)
  })

  it('reports absent top-of-book as 0 rather than inventing a spread', () => {
    const ticker = parseCcxtTicker({ last: 105, timestamp: 1_700_000_000_000 })
    expect(ticker.bid).toBe(0)
    expect(ticker.ask).toBe(0)
    assertTickerConformant(ticker, 'no-book')
  })

  it('stamps now when the venue sends no timestamp', () => {
    const before = Date.now()
    const ticker = parseCcxtTicker({ last: 105 })
    expect(ticker.ts).toBeGreaterThanOrEqual(before)
    assertTickerConformant(ticker, 'no-ts')
  })

  it('promotes a seconds timestamp instead of failing the ms guard', () => {
    const ticker = parseCcxtTicker({ last: 105, timestamp: 1_700_000_000 })
    expect(ticker.ts).toBe(1_700_000_000_000)
  })
})

describe('parseCcxtBookLevels', () => {
  it('copies into plain tuples — the ccxt book mutates in place', () => {
    const live = [
      [104.9, 1],
      [104.8, 2],
    ]
    const copy = parseCcxtBookLevels(live)
    live[0][1] = 999
    expect(copy[0]).toEqual([104.9, 1])
  })

  it('drops malformed levels but keeps a zero-size deletion marker', () => {
    expect(
      parseCcxtBookLevels([
        [0, 5],
        [-1, 5],
        [104.9, 0],
      ]),
    ).toEqual([[104.9, 0]])
  })

  it('falls back to now for a book with no timestamp (Binance sends none)', () => {
    const before = Date.now()
    expect(ccxtBookTimestamp({ bids: [], asks: [] })).toBeGreaterThanOrEqual(
      before,
    )
  })
})

describe('parseCcxtTrade', () => {
  it('takes ccxt’s unified side as the aggressor', () => {
    const trade = parseCcxtTrade({
      id: '6567321381',
      price: 63941.64,
      amount: 0.00024,
      side: 'sell',
      timestamp: 1_700_000_000_000,
      // Binance's raw flag: buyer WAS the maker, so the aggressor is the
      // seller. ccxt has already inverted it — the bridge must not invert again.
      info: { m: true },
    })
    expect(trade?.side).toBe('sell')
  })

  it('drops a print with no id — reconnect de-duplication depends on it', () => {
    expect(
      parseCcxtTrade({ price: 1, amount: 1, side: 'buy', timestamp: 1 }),
    ).toBeNull()
  })

  it('drops a print with an unrecognized side rather than guessing', () => {
    expect(
      parseCcxtTrade({ id: '1', price: 1, amount: 1, side: undefined }),
    ).toBeNull()
  })
})

describe('parseCcxtBulkTickerRow', () => {
  it('normalizes the symbol and keeps the percent', () => {
    expect(
      parseCcxtBulkTickerRow('BTC/USDT', { last: 105, percentage: 5 }),
    ).toEqual({ symbol: 'BTC-USDT', price: 105, change24h: 5 })
  })

  it('drops unpriced rows — the snapshot doubles as listing detection', () => {
    expect(parseCcxtBulkTickerRow('FOO/USDT', { last: 0 })).toBeNull()
    expect(parseCcxtBulkTickerRow('FOO/USDT', {})).toBeNull()
  })

  it('drops a row whose symbol carries no base/quote split', () => {
    expect(parseCcxtBulkTickerRow('BTCUSDT', { last: 105 })).toBeNull()
  })
})
