// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  assertCandleConformant,
  assertOrderbookConformant,
  assertTickerConformant,
} from '../../test-utils/conformance'
import {
  bucketTsFor,
  mapTimeframeToAlpacaInterval,
  mergeBarIntoBucket,
  parseAlpacaBar,
  parseAlpacaQuoteBook,
  parseAlpacaSnapshot,
  parseTs,
  timeframeToMs,
  toAlpacaSymbol,
  toPairKey,
} from '../parser'

describe('alpaca parser — pair mapping', () => {
  it('maps pair keys to bare Alpaca symbols', () => {
    expect(toAlpacaSymbol('AAPL-USD')).toBe('AAPL')
    expect(toAlpacaSymbol('aapl-usd')).toBe('AAPL')
    expect(toAlpacaSymbol('SPY')).toBe('SPY')
  })

  it('maps Alpaca symbols back to USD pair keys', () => {
    expect(toPairKey('AAPL')).toBe('AAPL-USD')
    expect(toPairKey('nvda')).toBe('NVDA-USD')
  })
})

describe('alpaca parser — timeframe mapping', () => {
  it('maps supported timeframes to Alpaca intervals', () => {
    expect(mapTimeframeToAlpacaInterval('1m')).toBe('1Min')
    expect(mapTimeframeToAlpacaInterval('15m')).toBe('15Min')
    expect(mapTimeframeToAlpacaInterval('1h')).toBe('1Hour')
    expect(mapTimeframeToAlpacaInterval('4h')).toBe('4Hour')
    expect(mapTimeframeToAlpacaInterval('1d')).toBe('1Day')
    expect(mapTimeframeToAlpacaInterval('1w')).toBe('1Week')
    expect(mapTimeframeToAlpacaInterval('3s')).toBeNull()
  })

  it('exposes bucket durations for every supported timeframe', () => {
    expect(timeframeToMs('1m')).toBe(60_000)
    expect(timeframeToMs('1h')).toBe(3_600_000)
    expect(timeframeToMs('nope')).toBeNull()
  })
})

describe('alpaca parser — bars', () => {
  // Real REST/WS bar shape: RFC-3339 timestamp, numeric OHLCV
  const REAL_BAR = {
    t: '2026-06-30T15:20:00Z',
    o: 178.26,
    h: 178.34,
    l: 177.76,
    c: 178.08,
    v: 60937,
    n: 1727,
    vw: 177.954244,
  }

  it('parses a real Alpaca bar and passes conformance', () => {
    const candle = parseAlpacaBar(REAL_BAR)
    expect(candle).not.toBeNull()
    expect(candle!.ts).toBe(Date.parse('2026-06-30T15:20:00Z'))
    expect(candle!.close).toBe(178.08)
    assertCandleConformant(candle!)
  })

  it('rejects malformed bars instead of throwing', () => {
    expect(parseAlpacaBar(null)).toBeNull()
    expect(parseAlpacaBar({})).toBeNull()
    expect(parseAlpacaBar({ ...REAL_BAR, t: 'not-a-date' })).toBeNull()
    expect(parseAlpacaBar({ ...REAL_BAR, c: undefined })).toBeNull()
  })
})

describe('alpaca parser — bucket aggregation', () => {
  const H = 3_600_000

  it('anchors buckets to a known venue candle open', () => {
    const anchor = Date.parse('2026-06-30T13:30:00Z') // 09:30 ET open
    const inBucket = anchor + 25 * 60_000
    const nextBucket = anchor + 61 * 60_000
    expect(bucketTsFor(inBucket, anchor, H)).toBe(anchor)
    expect(bucketTsFor(nextBucket, anchor, H)).toBe(anchor + H)
  })

  it('merges 1-minute bars into the bucket candle', () => {
    const bucketTs = 1_780_000_000_000
    const first = parseAlpacaBar({
      t: bucketTs,
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    })!
    const seeded = mergeBarIntoBucket(null, first, bucketTs)
    expect(seeded.ts).toBe(bucketTs)
    expect(seeded.open).toBe(100)

    const second = parseAlpacaBar({
      t: bucketTs + 60_000,
      o: 100.5,
      h: 103,
      l: 98,
      c: 102,
      v: 500,
    })!
    const merged = mergeBarIntoBucket(seeded, second, bucketTs)
    expect(merged.open).toBe(100) // bucket open preserved
    expect(merged.high).toBe(103)
    expect(merged.low).toBe(98)
    expect(merged.close).toBe(102)
    expect(merged.volume).toBe(1500)
    assertCandleConformant(merged)
  })

  it('starts a fresh candle when the bar lands in a newer bucket', () => {
    const bucketTs = 1_780_000_000_000
    const prev = parseAlpacaBar({
      t: bucketTs,
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    })!
    const bar = parseAlpacaBar({
      t: bucketTs + 3_600_000,
      o: 101,
      h: 102,
      l: 100,
      c: 101.5,
      v: 200,
    })!
    const next = mergeBarIntoBucket(
      prev.ts === bucketTs + 3_600_000 ? prev : null,
      bar,
      bucketTs + 3_600_000,
    )
    expect(next.ts).toBe(bucketTs + 3_600_000)
    expect(next.open).toBe(101)
    expect(next.volume).toBe(200)
  })
})

describe('alpaca parser — ticker snapshot', () => {
  // Real /v2/stocks/snapshots per-symbol shape
  const REAL_SNAPSHOT = {
    latestTrade: {
      t: '2026-06-30T19:59:59.898542039Z',
      x: 'V',
      p: 178.15,
      s: 50,
      c: ['@'],
      z: 'C',
    },
    latestQuote: {
      t: '2026-06-30T19:59:59.59Z',
      ax: 'V',
      ap: 178.18,
      as: 2,
      bx: 'V',
      bp: 178.11,
      bs: 3,
      c: ['R'],
      z: 'C',
    },
    minuteBar: {
      t: '2026-06-30T19:59:00Z',
      o: 178.1,
      h: 178.2,
      l: 178.05,
      c: 178.15,
      v: 20402,
    },
    dailyBar: {
      t: '2026-06-30T04:00:00Z',
      o: 176.55,
      h: 179.02,
      l: 176.11,
      c: 178.15,
      v: 48377680,
    },
    prevDailyBar: {
      t: '2026-06-27T04:00:00Z',
      o: 174.2,
      h: 176.8,
      l: 173.9,
      c: 175.0,
      v: 51002123,
    },
  }

  it('builds a conformant TickerSnapshot with prev-close change', () => {
    const ticker = parseAlpacaSnapshot(REAL_SNAPSHOT)
    expect(ticker).not.toBeNull()
    expect(ticker!.last).toBe(178.15)
    expect(ticker!.bid).toBe(178.11)
    expect(ticker!.ask).toBe(178.18)
    expect(ticker!.high24h).toBe(179.02)
    expect(ticker!.volume24h).toBe(48377680)
    // (178.15 - 175.00) / 175.00 * 100 = 1.8%
    expect(ticker!.change24h).toBeCloseTo(1.8, 5)
    assertTickerConformant(ticker!)
  })

  it('returns null when there is no price at all', () => {
    expect(parseAlpacaSnapshot({})).toBeNull()
    expect(parseAlpacaSnapshot(null)).toBeNull()
  })
})

describe('alpaca parser — quote → top-of-book', () => {
  it('builds single-level conformant book sides from a WS quote', () => {
    const book = parseAlpacaQuoteBook({
      T: 'q',
      S: 'AAPL',
      bx: 'U',
      bp: 178.11,
      bs: 3,
      ax: 'Q',
      ap: 178.18,
      as: 2,
      t: '2026-06-30T19:59:59.59Z',
      z: 'C',
    })
    expect(book).not.toBeNull()
    expect(book!.bids).toEqual([[178.11, 3]])
    expect(book!.asks).toEqual([[178.18, 2]])
    assertOrderbookConformant(book!.bids, book!.asks)
  })

  it('drops empty quotes', () => {
    expect(parseAlpacaQuoteBook({ bp: 0, ap: 0 })).toBeNull()
  })
})

describe('alpaca parser — timestamps', () => {
  it('parses RFC-3339 and passes epoch-ms through', () => {
    expect(parseTs('2026-06-30T15:20:00Z')).toBe(
      Date.parse('2026-06-30T15:20:00Z'),
    )
    expect(parseTs(1_782_833_000_000)).toBe(1_782_833_000_000)
    expect(parseTs('garbage')).toBeNull()
    expect(parseTs(undefined)).toBeNull()
  })
})
