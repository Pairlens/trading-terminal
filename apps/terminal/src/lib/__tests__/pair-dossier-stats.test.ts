// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import type { Candle } from '@pairlens/shared/types'
import type { VenueQuote, VenueQuoteStatus } from '@/hooks/use-venue-quotes'
import {
  candlesSince,
  summarizeRange,
  summarizeVolatility,
  venueSpreadBars,
} from '@/lib/pair-dossier-stats'

const HOUR = 60 * 60 * 1000

function candle(ts: number, low: number, high: number, close = high): Candle {
  return { ts, open: low, high, low, close, volume: 1 }
}

function quote(
  market: string,
  bid: number | null,
  ask: number | null,
  status: VenueQuoteStatus = 'live',
  last?: number,
): VenueQuote {
  return {
    market,
    status,
    last: last ?? (bid !== null && ask !== null ? (bid + ask) / 2 : null),
    bid,
    ask,
    change24h: null,
    volume24h: null,
    ts: 1,
    fromSnapshot: false,
  }
}

describe('candlesSince', () => {
  test('keeps the window and leaves the buffer alone', () => {
    const candles = [
      candle(0, 1, 2),
      candle(HOUR, 1, 2),
      candle(2 * HOUR, 1, 2),
    ]
    const window = candlesSince(candles, HOUR)
    expect(window).toHaveLength(2)
    expect(candles).toHaveLength(3)
  })
})

describe('summarizeRange', () => {
  test('reads the extremes and where the price sits between them', () => {
    const stats = summarizeRange(
      [candle(0, 90, 100), candle(HOUR, 95, 110), candle(2 * HOUR, 92, 105)],
      100,
    )!
    expect(stats.high).toBe(110)
    expect(stats.low).toBe(90)
    expect(stats.rangePct).toBeCloseTo(22.22, 2)
    expect(stats.position).toBeCloseTo(0.5, 10)
    expect(stats.bars).toBe(3)
    expect(stats.spanMs).toBe(2 * HOUR)
  })

  test('a price outside the window clamps rather than escaping the bar', () => {
    const stats = summarizeRange([candle(0, 90, 100)], 140)!
    expect(stats.position).toBe(1)
    expect(summarizeRange([candle(0, 90, 100)], 10)!.position).toBe(0)
  })

  test('withholds a range it cannot draw', () => {
    expect(summarizeRange([], 100)).toBeNull()
    // A single flat print is not a range.
    expect(summarizeRange([candle(0, 100, 100)], 100)).toBeNull()
  })

  test('no reference price means no marker, not a marker at zero', () => {
    expect(summarizeRange([candle(0, 90, 100)], null)!.position).toBeNull()
  })
})

describe('summarizeVolatility', () => {
  /** Alternating ±1% closes: a known per-bar deviation to annualise from. */
  function alternating(count: number): Array<Candle> {
    const out: Array<Candle> = []
    let close = 100
    for (let i = 0; i < count; i++) {
      close = i % 2 === 0 ? 101 : 100
      out.push({
        ts: i * HOUR,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1,
      })
    }
    return out
  }

  test('annualises the per-bar deviation by the chart interval', () => {
    const stats = summarizeVolatility(alternating(200), HOUR)!
    expect(stats.samples).toBe(199)
    expect(stats.spanMs).toBe(199 * HOUR)
    // ±0.995% per hour, √(8760) hours in a year.
    expect(stats.annualizedPct).toBeGreaterThan(80)
    expect(stats.annualizedPct).toBeLessThan(110)
  })

  test('the same series on a daily chart is a smaller annualised figure', () => {
    const hourly = summarizeVolatility(alternating(200), HOUR)!
    const daily = summarizeVolatility(alternating(200), 24 * HOUR)!
    expect(daily.annualizedPct).toBeLessThan(hourly.annualizedPct)
    expect(daily.annualizedPct * Math.sqrt(24)).toBeCloseTo(
      hourly.annualizedPct,
      6,
    )
  })

  test('a flat series is flat, not undefined', () => {
    const flat = Array.from({ length: 60 }, (_, i) =>
      candle(i * HOUR, 100, 100),
    )
    expect(summarizeVolatility(flat, HOUR)!.annualizedPct).toBeCloseTo(0, 10)
  })

  test('too short a buffer reports nothing rather than noise', () => {
    expect(summarizeVolatility(alternating(10), HOUR)).toBeNull()
  })

  test('an unusable interval reports nothing', () => {
    expect(summarizeVolatility(alternating(200), 0)).toBeNull()
  })
})

describe('venueSpreadBars', () => {
  test('tightest first, and the bar is the inverse of the spread', () => {
    const bars = venueSpreadBars([
      quote('kraken', 318.18, 318.71),
      quote('binance', 318.41, 318.47),
    ])
    expect(bars.map((b) => b.market)).toEqual(['binance', 'kraken'])
    expect(bars[0]!.width).toBe(1)
    expect(bars[1]!.width).toBeCloseTo(bars[0]!.bps / bars[1]!.bps, 10)
    expect(bars[1]!.bps).toBeGreaterThan(bars[0]!.bps)
  })

  test('a venue without a real book contributes no bar', () => {
    const bars = venueSpreadBars([
      quote('binance', 100, 100.1),
      quote('gecko', 99.9, 100.1, 'live', 100),
      quote('okx', 100, 100.2, 'stale'),
      quote('coinbase', null, null, 'unlisted'),
    ])
    expect(bars.map((b) => b.market)).toEqual(['binance'])
  })

  test('no measurable venue means no bars at all', () => {
    expect(
      venueSpreadBars([quote('coinbase', null, null, 'unlisted')]),
    ).toEqual([])
  })

  test('the widest venues past the limit are dropped, not squeezed', () => {
    const bars = venueSpreadBars(
      Array.from({ length: 9 }, (_, i) =>
        quote(`v${i}`, 100, 100 + (i + 1) / 10, 'live', 100),
      ),
      4,
    )
    expect(bars).toHaveLength(4)
    expect(bars.map((b) => b.market)).toEqual(['v0', 'v1', 'v2', 'v3'])
  })
})
