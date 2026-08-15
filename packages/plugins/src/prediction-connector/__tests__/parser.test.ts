// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The prediction parser, against the same cross-connector conformance
 * assertions every other connector is held to, plus the two invariants that
 * are specific to a probability market.
 *
 * The canonical golden scenarios price around 100, which a prediction book
 * cannot: a level outside (0, 1) is not a price on either venue, and the
 * parser drops it. So the book case is pinned here against a probability-
 * scaled scenario rather than in `golden-conformance.test.ts` — candles and
 * tickers, which carry no range rule, ride the shared row there.
 */

import { describe, expect, it } from 'bun:test'
import {
  assertCandleConformant,
  assertOrderbookConformant,
  assertTickerConformant,
} from '../../test-utils/conformance'
import {
  parsePredictionBookLevels,
  parsePredictionOhlcv,
  parsePredictionOhlcvBatch,
  parsePredictionTicker,
  parsePredictionTrade,
  predictionBookTimestamp,
} from '../parser'

const TS = 1_700_000_000_000

describe('prediction candles', () => {
  it('normalizes a unified OHLCV row', () => {
    const candle = parsePredictionOhlcv([TS, 0.42, 0.55, 0.4, 0.53, 12_500])
    expect(candle).not.toBeNull()
    assertCandleConformant(candle!)
    expect(candle!.close).toBeCloseTo(0.53, 8)
    expect(candle!.volume).toBe(12_500)
  })

  it('accepts string money fields', () => {
    const candle = parsePredictionOhlcv([
      TS,
      '0.42',
      '0.55',
      '0.40',
      '0.53',
      '1',
    ])
    expect(candle?.high).toBeCloseTo(0.55, 8)
  })

  it('returns null rather than a NaN candle', () => {
    expect(parsePredictionOhlcv([TS, 0.4, 0.5, 0.3, 'n/a', 1])).toBeNull()
    expect(parsePredictionOhlcv([TS, 0.4, 0.5])).toBeNull()
  })

  it('keeps a candle whose volume slot is empty', () => {
    // Regression, and the single most expensive bug in this connector:
    // Polymarket's fetchOHLCV buckets a price-history tape that reports no
    // size, so parseOHLCV emits `undefined` in slot 5 for EVERY row. Requiring
    // volume the way the spot parser does dropped the entire series — 300 rows
    // in, 0 candles out — and the terminal read the empty history as "this
    // pair is not listed here", hiding the working book, tape and ticket too.
    const candle = parsePredictionOhlcv([TS, 0.5, 0.55, 0.45, 0.53, undefined])
    expect(candle).not.toBeNull()
    assertCandleConformant(candle!)
    expect(candle!.volume).toBe(0)
    expect(candle!.close).toBeCloseTo(0.53, 8)
  })

  it('keeps a whole volume-less series rather than dropping it', () => {
    const rows = Array.from({ length: 5 }, (_, i) => [
      TS + i * 60_000,
      0.5,
      0.55,
      0.45,
      0.53,
      undefined,
    ])
    expect(parsePredictionOhlcvBatch(rows).length).toBe(5)
  })

  it('still refuses a row with no price', () => {
    // A missing volume has an honest substitute; a missing price does not,
    // and a NaN price poisons the buffer's ordering.
    expect(
      parsePredictionOhlcv([TS, undefined, 0.55, 0.45, 0.53, 10]),
    ).toBeNull()
    expect(
      parsePredictionOhlcv([TS, 0.5, 0.55, 0.45, undefined, 10]),
    ).toBeNull()
  })

  it('drops malformed rows from a batch instead of the whole batch', () => {
    const candles = parsePredictionOhlcvBatch([
      [TS, 0.4, 0.5, 0.3, 0.45, 1],
      [TS + 60_000, 0.45, 'x', 0.3, 0.5, 1],
      [TS + 120_000, 0.5, 0.6, 0.45, 0.55, 2],
    ])
    expect(candles.length).toBe(2)
  })
})

describe('prediction ticker', () => {
  it('treats percentage as a percent and never rescales it', () => {
    const ticker = parsePredictionTicker({
      outcome: 'KXFED_28JAN_CUT:YES',
      last: 0.53,
      open: 0.5,
      bid: 0.52,
      ask: 0.54,
      high: 0.6,
      low: 0.45,
      baseVolume: 40_000,
      percentage: 6,
      timestamp: TS,
    })
    assertTickerConformant(ticker)
    expect(ticker.change24h).toBe(6)
    expect(ticker.last).toBeCloseTo(0.53, 8)
  })

  it('derives change from open when the venue reports no percentage', () => {
    const ticker = parsePredictionTicker({
      last: 0.55,
      open: 0.5,
      timestamp: TS,
    })
    expect(ticker.change24h).toBeCloseTo(10, 6)
  })

  it('reports contract volume, falling back to notional', () => {
    expect(
      parsePredictionTicker({ last: 0.5, quoteVolume: 900, timestamp: TS })
        .volume24h,
    ).toBe(900)
    expect(
      parsePredictionTicker({
        last: 0.5,
        baseVolume: 1_800,
        quoteVolume: 900,
        timestamp: TS,
      }).volume24h,
    ).toBe(1_800)
  })

  it('leaves an absent side at 0 rather than fabricating a spread', () => {
    const ticker = parsePredictionTicker({ last: 0.5, timestamp: TS })
    expect(ticker.bid).toBe(0)
    expect(ticker.ask).toBe(0)
  })
})

describe('prediction orderbook', () => {
  const bids: Array<[number, number]> = [
    [0.52, 400],
    [0.51, 900],
  ]
  const asks: Array<[number, number]> = [
    [0.54, 250],
    [0.55, 1_100],
  ]

  it('normalizes both sides to plain tuples', () => {
    const parsedBids = parsePredictionBookLevels(bids)
    const parsedAsks = parsePredictionBookLevels(asks)
    assertOrderbookConformant(parsedBids, parsedAsks)
    expect(parsedBids[0]).toEqual([0.52, 400])
    expect(parsedAsks[1]).toEqual([0.55, 1_100])
  })

  it('drops levels outside the probability range', () => {
    // 0 and 1 are settled outcomes, not quotes; a price above 1 is a units bug.
    const parsed = parsePredictionBookLevels([
      [0, 100],
      [1, 100],
      [53, 100],
      [0.53, 100],
    ] as Array<[number, number]>)
    expect(parsed).toEqual([[0.53, 100]])
  })

  it('falls back to now when the frame carries no timestamp', () => {
    const before = Date.now()
    const ts = predictionBookTimestamp({ bids: [], asks: [] })
    expect(ts).toBeGreaterThanOrEqual(before)
  })

  it('promotes a seconds-scale stamp', () => {
    expect(
      predictionBookTimestamp({ bids: [], asks: [], timestamp: TS / 1000 }),
    ).toBe(TS)
  })
})

describe('prediction trades', () => {
  it('normalizes a taker-side print', () => {
    const trade = parsePredictionTrade({
      id: '881',
      price: 0.53,
      amount: 120,
      side: 'buy',
      timestamp: TS,
    })
    expect(trade).toEqual({
      id: '881',
      price: 0.53,
      size: 120,
      side: 'buy',
      ts: TS,
    })
  })

  it('drops a print with no side rather than guessing one', () => {
    expect(parsePredictionTrade({ id: '1', price: 0.5, amount: 1 })).toBeNull()
  })

  it('drops a print with no id, zero size or zero price', () => {
    expect(
      parsePredictionTrade({ price: 0.5, amount: 1, side: 'buy' }),
    ).toBeNull()
    expect(
      parsePredictionTrade({ id: '1', price: 0.5, amount: 0, side: 'buy' }),
    ).toBeNull()
    expect(
      parsePredictionTrade({ id: '1', price: 0, amount: 1, side: 'buy' }),
    ).toBeNull()
  })
})
