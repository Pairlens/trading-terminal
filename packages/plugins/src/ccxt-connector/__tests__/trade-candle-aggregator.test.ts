// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The aggregator is what Coinbase and Upbit charts are made of, so the cases
 * that matter are the ones that would silently draw a wrong bar: a bucket
 * boundary that disagrees with the venue's own, a forming source bar counted
 * twice, and a backfill that lands after the tape already opened the bar.
 */

import { describe, expect, it } from 'bun:test'
import { assertCandleConformant } from '../../test-utils/conformance'
import {
  MONDAY_ANCHOR_MS,
  TradeCandleAggregator,
  anchorOf,
  bucketStart,
  defaultAnchor,
  foldCandles,
} from '../trade-candle-aggregator'
import type { Candle } from '@pairlens/shared/types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function candle(
  ts: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v = 1,
): Candle {
  return { ts, open: o, high: h, low: l, close: c, volume: v }
}

/** Assert-and-narrow, so a null bar fails as a missing bar, not a type error. */
function expectCandle(value: Candle | null | undefined, label: string): Candle {
  if (!value) throw new Error(`${label}: expected a candle, got ${value}`)
  assertCandleConformant(value, label)
  return value
}

describe('bucket alignment', () => {
  it('opens the week on Monday, not on epoch Thursday', () => {
    // 2026-08-10T00:00:00Z is a Monday.
    const monday = Date.UTC(2026, 7, 10)
    expect(new Date(monday).getUTCDay()).toBe(1)
    const wednesday = monday + 2 * DAY + 5 * HOUR
    expect(bucketStart(wednesday, 7 * DAY, MONDAY_ANCHOR_MS)).toBe(monday)
    expect(defaultAnchor('1w')).toBe(MONDAY_ANCHOR_MS)
    expect(defaultAnchor('4h')).toBe(0)
  })

  it('reads the phase back out of a venue series', () => {
    // A venue whose daily bar opens at 15:00 UTC (a local-midnight boundary).
    const bars = [candle(Date.UTC(2026, 7, 9, 15), 1, 1, 1, 1)]
    expect(anchorOf(bars, DAY)).toBe(15 * HOUR)
  })
})

describe('foldCandles', () => {
  it('folds four hourly bars into one 4h bar', () => {
    const base = Date.UTC(2026, 7, 10)
    const source = [
      candle(base, 100, 105, 99, 104, 1),
      candle(base + HOUR, 104, 120, 103, 110, 2),
      candle(base + 2 * HOUR, 110, 111, 90, 95, 3),
      candle(base + 3 * HOUR, 95, 98, 94, 97, 4),
    ]
    const { candles } = foldCandles(source, '1h', '4h')
    expect(candles).toHaveLength(1)
    expect(candles[0]).toEqual({
      ts: base,
      open: 100,
      high: 120,
      low: 90,
      close: 97,
      volume: 10,
    })
    expectCandle(candles[0], 'folded 4h')
  })

  it('drops a leading bucket the page only half covers', () => {
    const base = Date.UTC(2026, 7, 10)
    // Starts at 02:00 — the 00:00 bucket is a fragment and its open is a lie.
    const source = [
      candle(base + 2 * HOUR, 110, 111, 90, 95, 3),
      candle(base + 3 * HOUR, 95, 98, 94, 97, 4),
      candle(base + 4 * HOUR, 97, 99, 96, 98, 5),
    ]
    const { candles } = foldCandles(source, '1h', '4h')
    expect(candles.map((c) => c.ts)).toEqual([base + 4 * HOUR])
  })

  it('returns the source bars of the newest bucket as the tail', () => {
    const monday = Date.UTC(2026, 7, 10)
    const source = [
      candle(monday - 7 * DAY, 10, 10, 10, 10),
      candle(monday, 20, 25, 19, 24),
      candle(monday + DAY, 24, 30, 23, 29),
    ]
    const { candles, tail } = foldCandles(source, '1d', '1w')
    expect(candles.map((c) => c.ts)).toEqual([monday - 7 * DAY, monday])
    expect(tail.map((c) => c.ts)).toEqual([monday, monday + DAY])
  })

  it('carries a shifted daily phase into the weekly bucket', () => {
    // Daily bars opening at 15:00 UTC must fold into weeks opening at 15:00,
    // or the forming week never lines up with the venue's own history.
    const start = Date.UTC(2026, 7, 10, 15)
    const source = Array.from({ length: 9 }, (_, i) =>
      candle(start + i * DAY, 1, 2, 0.5, 1.5),
    )
    const { candles } = foldCandles(source, '1d', '1w')
    expect(candles[0]?.ts).toBe(start)
    for (const bar of candles) expect((bar.ts - start) % (7 * DAY)).toBe(0)
  })
})

describe('TradeCandleAggregator — trades', () => {
  it('builds a forming bar and closes it on the bucket transition', () => {
    const agg = new TradeCandleAggregator({ timeframe: '1m' })
    const base = Date.UTC(2026, 7, 10, 12)
    agg.pushTrade({ price: 100, size: 1, ts: base + 1_000 })
    agg.pushTrade({ price: 105, size: 2, ts: base + 2_000 })
    const mid = agg.pushTrade({ price: 95, size: 3, ts: base + 3_000 })
    expect(mid.forming).toEqual({
      ts: base,
      open: 100,
      high: 105,
      low: 95,
      close: 95,
      volume: 6,
    })
    expect(mid.closed).toBeNull()
    expectCandle(mid.forming, 'forming 1m')

    const rolled = agg.pushTrade({ price: 96, size: 1, ts: base + MINUTE + 10 })
    expect(rolled.closed?.ts).toBe(base)
    expect(rolled.closed?.close).toBe(95)
    expect(rolled.forming).toEqual({
      ts: base + MINUTE,
      open: 96,
      high: 96,
      low: 96,
      close: 96,
      volume: 1,
    })
  })

  it('drops a print that belongs to a bucket already closed', () => {
    const agg = new TradeCandleAggregator({ timeframe: '1m' })
    const base = Date.UTC(2026, 7, 10, 12)
    agg.pushTrade({ price: 100, size: 1, ts: base + MINUTE })
    const late = agg.pushTrade({ price: 1, size: 99, ts: base })
    expect(late).toEqual({ forming: null, closed: null })
    expect(agg.current()?.volume).toBe(1)
  })

  it('merges a backfill that lands after the tape opened the bar', () => {
    const agg = new TradeCandleAggregator({ timeframe: '1h' })
    const base = Date.UTC(2026, 7, 10, 12)
    agg.pushTrade({ price: 105, size: 2, ts: base + 40 * MINUTE })

    // The venue's own bar knows the open and the volume from before we
    // connected; the tape knows the newest print.
    agg.seed([candle(base, 100, 106, 99, 104, 50)], [], base + 41 * MINUTE)

    expect(agg.current()).toEqual({
      ts: base,
      open: 100,
      high: 106,
      low: 99,
      close: 105,
      volume: 50,
    })
  })

  it('adopts the venue bucket phase from the seed', () => {
    const agg = new TradeCandleAggregator({ timeframe: '1d' })
    const open = Date.UTC(2026, 7, 9, 15)
    agg.seed([candle(open, 1, 1, 1, 1)])
    expect(agg.bucketAnchor).toBe(15 * HOUR)
    // A print 20 h later still belongs to that same 15:00 day.
    const result = agg.pushTrade({ price: 2, size: 1, ts: open + 20 * HOUR })
    expect(result.forming?.ts).toBe(open)
  })

  it('ignores a seed whose newest bar has already closed', () => {
    const agg = new TradeCandleAggregator({ timeframe: '1h' })
    const base = Date.UTC(2026, 7, 10, 12)
    agg.pushTrade({ price: 10, size: 1, ts: base + 10 * MINUTE })
    agg.seed([candle(base - HOUR, 1, 1, 1, 1, 9)], [], base + 10 * MINUTE)
    expect(agg.current()?.ts).toBe(base)
    expect(agg.current()?.open).toBe(10)
  })

  it('opens no bar at all when the venue has not traded in hours', () => {
    // Upbit's BTC-USDT on sg-api: the newest 1m bar is days old. Adopting it
    // as "forming" would make the clock close a bar that closed long ago.
    const agg = new TradeCandleAggregator({ timeframe: '1m' })
    const stale = Date.UTC(2026, 7, 5, 2, 7)
    agg.seed([candle(stale, 100, 100, 100, 100, 1)], [], stale + 6 * 24 * HOUR)
    expect(agg.current()).toBeNull()
    expect(agg.rollIfExpired(stale + 6 * 24 * HOUR)).toBeNull()
  })

  it('closes the open bar on the clock when the tape goes quiet', () => {
    const agg = new TradeCandleAggregator({ timeframe: '1m' })
    const base = Date.UTC(2026, 7, 10, 12)
    agg.pushTrade({ price: 100, size: 1, ts: base })
    expect(agg.rollIfExpired(base + 30_000)).toBeNull()
    expect(agg.rollIfExpired(base + MINUTE + 1)?.ts).toBe(base)
    expect(agg.current()).toBeNull()
  })
})

describe('TradeCandleAggregator — folding a finer candle stream', () => {
  it('replaces a re-ticking source bar instead of adding it again', () => {
    const agg = new TradeCandleAggregator({
      timeframe: '1w',
      sourceTimeframe: '1d',
    })
    const monday = Date.UTC(2026, 7, 10)
    agg.pushSourceCandle(candle(monday, 100, 110, 95, 105, 10))
    agg.pushSourceCandle(candle(monday, 100, 120, 90, 118, 25))
    expect(agg.current()).toEqual({
      ts: monday,
      open: 100,
      high: 120,
      low: 90,
      close: 118,
      volume: 25,
    })

    agg.pushSourceCandle(candle(monday + DAY, 118, 130, 117, 129, 5))
    expect(agg.current()).toEqual({
      ts: monday,
      open: 100,
      high: 130,
      low: 90,
      close: 129,
      volume: 30,
    })
  })

  it('keeps the seeded week open when only the newest day streams', () => {
    const agg = new TradeCandleAggregator({
      timeframe: '1w',
      sourceTimeframe: '1d',
    })
    const monday = Date.UTC(2026, 7, 10)
    const wednesday = monday + 2 * DAY
    // Backfill: the week so far, plus the daily bars behind it. The clock is
    // pinned inside the seeded week; seed()'s Date.now() default would make
    // this test rot the day the real clock left the fixture's week.
    agg.seed(
      [candle(monday, 100, 140, 90, 135, 30)],
      [
        candle(monday, 100, 120, 95, 118, 10),
        candle(monday + DAY, 118, 140, 90, 132, 12),
        candle(wednesday, 132, 136, 130, 135, 8),
      ],
      wednesday + DAY / 2,
    )
    const result = agg.pushSourceCandle(
      candle(wednesday, 132, 150, 128, 149, 20),
    )
    expect(result.closed).toBeNull()
    expect(result.forming).toEqual({
      ts: monday,
      open: 100,
      high: 150,
      low: 90,
      close: 149,
      volume: 42,
    })
  })

  it('closes the week when a source bar lands in the next one', () => {
    const agg = new TradeCandleAggregator({
      timeframe: '1w',
      sourceTimeframe: '1d',
    })
    const monday = Date.UTC(2026, 7, 10)
    agg.pushSourceCandle(candle(monday, 100, 110, 95, 105, 10))
    const next = agg.pushSourceCandle(
      candle(monday + 7 * DAY, 105, 106, 104, 106, 3),
    )
    expect(next.closed?.ts).toBe(monday)
    expect(next.forming?.ts).toBe(monday + 7 * DAY)
    expect(next.forming?.volume).toBe(3)
  })
})
