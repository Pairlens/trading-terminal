// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { aggregateCandles } from '../candle-aggregator'
import type { Candle } from '@pairlens/shared/types'

const HOUR = 3_600_000
const DAY = 24 * HOUR

function candle(ts: number, overrides: Partial<Candle> = {}): Candle {
  return {
    ts,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10,
    ...overrides,
  }
}

describe('aggregateCandles', () => {
  it('returns empty output for empty input', () => {
    expect(aggregateCandles([], HOUR, DAY)).toEqual([])
  })

  it('throws on invalid timeframes', () => {
    expect(() => aggregateCandles([candle(0)], 0, DAY)).toThrow()
    expect(() => aggregateCandles([candle(0)], HOUR, -1)).toThrow()
    expect(() => aggregateCandles([candle(0)], DAY, HOUR)).toThrow()
  })

  it('buckets 1h candles into a 3d candle (OHLCV semantics)', () => {
    const tf3d = 3 * DAY
    const candles: Array<Candle> = []
    for (let i = 0; i < 72; i += 1) {
      candles.push(
        candle(i * HOUR, {
          open: 100 + i,
          high: 200 + i,
          low: 50 - i * 0.1,
          close: 150 + i,
          volume: 2,
        }),
      )
    }

    const result = aggregateCandles(candles, HOUR, tf3d)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      ts: 0,
      open: 100, // first open
      high: 200 + 71, // max high
      low: 50 - 71 * 0.1, // min low
      close: 150 + 71, // last close
      volume: 144, // 72 * 2
    })
  })

  it('splits candles across epoch-aligned bucket boundaries', () => {
    const tf3d = 3 * DAY
    // Two candles in bucket [0, 3d), one candle in bucket [3d, 6d)
    const candles = [
      candle(0, { open: 1, close: 2, volume: 1 }),
      candle(2 * DAY, { open: 3, close: 4, volume: 1 }),
      candle(3 * DAY, { open: 5, close: 6, volume: 1 }),
    ]

    const result = aggregateCandles(candles, DAY, tf3d)
    expect(result).toHaveLength(2)
    expect(result[0].ts).toBe(0)
    expect(result[0].open).toBe(1)
    expect(result[0].close).toBe(4)
    expect(result[0].volume).toBe(2)
    expect(result[1].ts).toBe(3 * DAY)
    expect(result[1].open).toBe(5)
    expect(result[1].close).toBe(6)
    expect(result[1].volume).toBe(1)
  })

  it('handles gaps in the source series without synthesizing buckets', () => {
    const tf3d = 3 * DAY
    // Buckets 0 and 3 have data; buckets 1 and 2 are missing entirely.
    const candles = [
      candle(0, { close: 1 }),
      candle(DAY, { close: 2 }),
      candle(9 * DAY, { close: 3 }),
      candle(10 * DAY, { close: 4 }),
    ]

    const result = aggregateCandles(candles, DAY, tf3d)
    expect(result.map((c) => c.ts)).toEqual([0, 9 * DAY])
    expect(result[0].close).toBe(2)
    expect(result[1].close).toBe(4)
  })

  it('includes the partial trailing bucket', () => {
    const tf3d = 3 * DAY
    // Full first bucket (3 days) + one day of the second bucket.
    const candles = [
      candle(0, { volume: 1 }),
      candle(DAY, { volume: 1 }),
      candle(2 * DAY, { volume: 1 }),
      candle(3 * DAY, { open: 7, close: 8, volume: 5 }),
    ]

    const result = aggregateCandles(candles, DAY, tf3d)
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({
      ts: 3 * DAY,
      open: 7,
      high: 110,
      low: 90,
      close: 8,
      volume: 5,
    })
  })

  it('sums volume across the bucket', () => {
    const candles = [
      candle(0, { volume: 1.5 }),
      candle(HOUR, { volume: 2.25 }),
      candle(2 * HOUR, { volume: 3 }),
    ]

    const result = aggregateCandles(candles, HOUR, DAY)
    expect(result).toHaveLength(1)
    expect(result[0].volume).toBeCloseTo(6.75)
  })

  it('respects a non-zero anchor', () => {
    const anchor = 12 * HOUR
    // With anchor at 12:00, day buckets run 12:00 → 12:00.
    const candles = [
      candle(10 * HOUR, { close: 1 }), // before anchor → bucket anchored at -12h
      candle(13 * HOUR, { close: 2 }), // bucket anchored at +12h
      candle(20 * HOUR, { close: 3 }), // same bucket
    ]

    const result = aggregateCandles(candles, HOUR, DAY, anchor)
    expect(result.map((c) => c.ts)).toEqual([anchor - DAY, anchor])
    expect(result[1].open).toBe(100)
    expect(result[1].close).toBe(3)
    expect(result[1].volume).toBe(20)
  })

  it('passes through when source and target timeframes are equal', () => {
    const candles = [candle(0), candle(HOUR), candle(2 * HOUR)]
    const result = aggregateCandles(candles, HOUR, HOUR)
    expect(result).toEqual(candles)
  })
})
