// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bucketing, which is where a price history is either honest or quietly wrong.
 *
 * The two rules under test: a bucket a chart draws must never invent a fill
 * that did not happen, and a bucket boundary must be the same one every pane
 * would compute. Two panes bucketing the same tape at different offsets is how
 * a chart and a stat end up disagreeing about the same day.
 */
import { describe, expect, test } from 'bun:test'

import {
  TIMEFRAME_MS,
  bucketFloorCandles,
  bucketSaleCandles,
  bucketSalePoints,
  bucketStart,
  floorWindowFor,
} from '../series-client'

import type { NftPricePoint, NftSale } from '@pairlens/shared/nft-types'

const HOUR = 3_600_000
const DAY = 86_400_000

/** A fixed anchor on an hour boundary, so no test depends on when it runs. */
const T0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY)

function sale(offsetMs: number, price: number, tokenId = '1'): NftSale {
  return {
    tokenId,
    price,
    priceCurrency: 'ETH',
    marketplace: 'opensea',
    timestampMs: T0 + offsetMs,
  }
}

function floorPoint(offsetMs: number, floorPrice: number): NftPricePoint {
  return { timestampMs: T0 + offsetMs, floorPrice }
}

describe('bucket boundaries', () => {
  test('a bucket starts on its own multiple of the timeframe', () => {
    expect(bucketStart(T0 + HOUR + 59_000, HOUR)).toBe(T0 + HOUR)
    expect(bucketStart(T0 + DAY - 1, DAY)).toBe(T0)
  })

  test('the published timeframes are the ones that can be bucketed', () => {
    expect(Object.keys(TIMEFRAME_MS)).toEqual(['1m', '5m', '15m', '1h', '1d'])
  })
})

describe('floor windows', () => {
  test('the smallest window that covers the request wins', () => {
    expect(floorWindowFor(30 * 60_000).window).toBe('one_hour')
    expect(floorWindowFor(2 * DAY).window).toBe('seven_days')
    expect(floorWindowFor(29 * DAY).window).toBe('thirty_days')
  })

  test('a request past a year falls through to all time', () => {
    expect(floorWindowFor(5 * 365 * DAY).window).toBe('all_time')
  })
})

describe('sale buckets', () => {
  const sales = [
    sale(5 * 60_000, 8.0, 'a'),
    sale(20 * 60_000, 9.5, 'b'),
    sale(50 * 60_000, 7.2, 'c'),
    // Two hours later, leaving one empty hour between.
    sale(2 * HOUR + 10 * 60_000, 8.4, 'd'),
  ]

  test('OHLC follows time, not price order', () => {
    const points = bucketSalePoints(sales, HOUR)
    expect(points).toHaveLength(2)
    const first = points[0]
    expect(first?.timestampMs).toBe(T0)
    expect(first?.open).toBe(8.0)
    expect(first?.high).toBe(9.5)
    expect(first?.low).toBe(7.2)
    expect(first?.close).toBe(7.2)
    expect(first?.salesCount).toBe(3)
    expect(first?.volume).toBeCloseTo(24.7, 9)
    expect(first?.averagePrice).toBeCloseTo(24.7 / 3, 9)
  })

  test('the tape is bucketed the same whichever order it arrives in', () => {
    const forward = bucketSalePoints(sales, HOUR)
    const reversed = bucketSalePoints([...sales].reverse(), HOUR)
    expect(reversed).toEqual(forward)
  })

  test('a series leaves an hour with no fills EMPTY', () => {
    // Two points, not three: nobody traded in the middle hour, and an average
    // of no sales is not a price.
    const points = bucketSalePoints(sales, HOUR)
    expect(points.map((p) => p.timestampMs)).toEqual([T0, T0 + 2 * HOUR])
  })

  test('a chart carries the gap forward at zero volume', () => {
    const candles = bucketSaleCandles(sales, HOUR)
    expect(candles.map((c) => c.ts)).toEqual([T0, T0 + HOUR, T0 + 2 * HOUR])
    const filled = candles[1]
    expect(filled?.open).toBe(7.2)
    expect(filled?.high).toBe(7.2)
    expect(filled?.low).toBe(7.2)
    expect(filled?.close).toBe(7.2)
    expect(filled?.volume).toBe(0)
  })

  test('an empty tape is an empty series, not a zero bar', () => {
    expect(bucketSalePoints([], HOUR)).toEqual([])
    expect(bucketSaleCandles([], HOUR)).toEqual([])
  })

  test('a nonsense price is dropped rather than charted', () => {
    const points = bucketSalePoints([sale(0, 0), sale(60_000, 4)], HOUR)
    expect(points[0]?.open).toBe(4)
    expect(points[0]?.salesCount).toBe(1)
  })

  test('a whole day of fills is one daily bar', () => {
    const points = bucketSalePoints(sales, DAY)
    expect(points).toHaveLength(1)
    expect(points[0]?.open).toBe(8.0)
    expect(points[0]?.close).toBe(8.4)
    expect(points[0]?.high).toBe(9.5)
    expect(points[0]?.low).toBe(7.2)
  })
})

describe('floor candles', () => {
  test('a floor that moved inside a bucket is real OHLC', () => {
    const candles = bucketFloorCandles(
      [
        floorPoint(0, 8.0),
        floorPoint(15 * 60_000, 8.6),
        floorPoint(30 * 60_000, 7.9),
        floorPoint(45 * 60_000, 8.2),
      ],
      HOUR,
    )
    expect(candles).toHaveLength(1)
    expect(candles[0]).toEqual({
      ts: T0,
      open: 8.0,
      high: 8.6,
      low: 7.9,
      close: 8.2,
      volume: 0,
    })
  })

  test('a floor that did not move is a flat bar, not a hole', () => {
    const candles = bucketFloorCandles(
      [floorPoint(0, 8), floorPoint(3 * HOUR, 8.5)],
      HOUR,
    )
    expect(candles.map((c) => c.ts)).toEqual([
      T0,
      T0 + HOUR,
      T0 + 2 * HOUR,
      T0 + 3 * HOUR,
    ])
    expect(candles[1]?.close).toBe(8)
    expect(candles[3]?.close).toBe(8.5)
  })

  test('a floor history carries no volume, and does not pretend to', () => {
    const candles = bucketFloorCandles([floorPoint(0, 8)], HOUR)
    expect(candles.every((c) => c.volume === 0)).toBe(true)
  })

  test('unsorted points still bucket in time order', () => {
    const candles = bucketFloorCandles(
      [floorPoint(45 * 60_000, 8.2), floorPoint(0, 8.0)],
      HOUR,
    )
    expect(candles[0]?.open).toBe(8.0)
    expect(candles[0]?.close).toBe(8.2)
  })

  test('a point with no price at all is skipped', () => {
    const candles = bucketFloorCandles(
      [{ timestampMs: T0 }, floorPoint(60_000, 8)],
      HOUR,
    )
    expect(candles).toHaveLength(1)
    expect(candles[0]?.open).toBe(8)
  })
})
