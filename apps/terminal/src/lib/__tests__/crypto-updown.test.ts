// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The up/down scanner's arithmetic.
 *
 * Worth pinning tightly because it is the one place in the product where a
 * number is DERIVED and then put beside a tradeable price. A wrong 24h change
 * on a discovery card is a cosmetic bug; a model probability that is quietly
 * two points off is a bug that costs money, and it would look completely
 * normal on screen.
 *
 * The model is checked against closed-form cases rather than against a
 * snapshot: at the money with a zero rate the answer is a hair under a half
 * (the lognormal median correction), and far enough from the money it pins.
 */
import { describe, expect, it } from 'bun:test'

import {
  collectUpDownRows,
  formatWindowCountdown,
  modelUpProbability,
  normalCdf,
  priceRow,
  realizedVolatility,
  spotPairsOf,
  urgencyOf,
} from '../predictions/crypto-updown'
import type { Candle } from '@pairlens/shared/types'
import type {
  PredictionEventSummary,
  PredictionUpDown,
} from '@pairlens/shared/instrument-types'

const HOUR = 60 * 60_000

function meta(over: Partial<PredictionUpDown> = {}): PredictionUpDown {
  return {
    asset: 'BTC',
    spotPair: 'BTC-USDT',
    settlementSource: 'Binance BTC/USDT',
    horizon: 'hourly',
    opensMs: 1_000 * HOUR,
    closesMs: 1_001 * HOUR,
    referenceBasis: 'candle-open',
    referenceTimeframe: '1h',
    referenceExact: true,
    marketId: 'mkt',
    up: { pairKey: 'up', label: 'Up', price: 0.6 },
    down: { pairKey: 'down', label: 'Down', price: 0.4 },
    ...over,
  }
}

function event(id: string, over: Partial<PredictionUpDown> = {}) {
  return {
    id,
    market: 'polymarket',
    title: id,
    markets: [],
    upDown: meta(over),
  } satisfies PredictionEventSummary
}

function venue(events: Array<PredictionEventSummary>, market = 'polymarket') {
  return [{ market, label: market, events }]
}

describe('normalCdf', () => {
  it('matches the table at the points anyone would check', () => {
    // Seven places throughout: the approximation's stated bound is 7.5e-8,
    // which is three orders of magnitude finer than the cent Kalshi quotes in.
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 6)
    expect(normalCdf(-1)).toBeCloseTo(0.1586553, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021, 6)
    expect(normalCdf(-2.5)).toBeCloseTo(0.0062097, 6)
  })

  it('is symmetric, which is what keeps Up and Down summing to one', () => {
    for (const x of [0.3, 1.1, 2.7, 4]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 9)
    }
  })

  it('saturates rather than returning NaN at the extremes', () => {
    expect(normalCdf(Infinity)).toBe(1)
    expect(normalCdf(-Infinity)).toBe(0)
    expect(normalCdf(12)).toBeCloseTo(1, 6)
  })
})

describe('modelUpProbability', () => {
  const base = { spot: 100, reference: 100, msToClose: HOUR, sigma: 0.6 }

  it('is a hair under a half at the money', () => {
    // Not exactly 0.5: the lognormal median sits below the mean, and dropping
    // that term is the kind of "negligible" simplification that shows up as a
    // systematic bias on every daily row.
    const p = modelUpProbability(base)!
    expect(p).toBeLessThan(0.5)
    expect(p).toBeGreaterThan(0.49)
  })

  it('rises with the distance above the reference', () => {
    const flat = modelUpProbability(base)!
    const up = modelUpProbability({ ...base, spot: 100.5 })!
    const down = modelUpProbability({ ...base, spot: 99.5 })!
    expect(up).toBeGreaterThan(flat)
    expect(down).toBeLessThan(flat)
    // A binary and its complement, around the same reference.
    expect(up + down).toBeCloseTo(2 * flat, 2)
  })

  it('converges on certainty as the window runs out', () => {
    const far = modelUpProbability({ ...base, spot: 101, msToClose: HOUR })!
    const near = modelUpProbability({ ...base, spot: 101, msToClose: 5_000 })!
    expect(near).toBeGreaterThan(far)
    expect(near).toBeGreaterThan(0.99)
  })

  it('refuses the cases where the answer would be a false certainty', () => {
    // A vanishing sigma*sqrt(tau) turns a rounding error in spot into a
    // confident 0 or 100.
    expect(modelUpProbability({ ...base, msToClose: 0 })).toBeUndefined()
    expect(modelUpProbability({ ...base, msToClose: -1 })).toBeUndefined()
    expect(modelUpProbability({ ...base, sigma: 0 })).toBeUndefined()
    expect(modelUpProbability({ ...base, spot: 0 })).toBeUndefined()
    expect(modelUpProbability({ ...base, reference: 0 })).toBeUndefined()
  })
})

describe('realizedVolatility', () => {
  const bars = (closes: Array<number>): Array<Candle> =>
    closes.map((close, i) => ({
      ts: i * HOUR,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }))

  it('recovers the annualised sigma of a known hourly series', () => {
    // Alternating +/-1% hourly moves: the population stdev of the log returns
    // is ln(1.01) to within a rounding error, annualised by sqrt(8760).
    const closes = [100]
    for (let i = 1; i < 100; i++) {
      closes.push(i % 2 === 1 ? closes[i - 1] * 1.01 : closes[i - 1] / 1.01)
    }
    const sigma = realizedVolatility(bars(closes))!
    expect(sigma).toBeCloseTo(Math.log(1.01) * Math.sqrt(365 * 24), 2)
  })

  it('refuses a flat tape rather than answering zero', () => {
    // Zero volatility makes the model answer 0 or 1 with total confidence.
    expect(realizedVolatility(bars(Array(60).fill(100)))).toBeUndefined()
  })

  it('refuses a sample too short to mean anything', () => {
    expect(realizedVolatility(bars([100, 101, 102]))).toBeUndefined()
  })
})

describe('collectUpDownRows', () => {
  const now = 1_000 * HOUR

  it('keeps the window that is trading, not the ladder behind it', () => {
    const rows = collectUpDownRows(
      venue([
        event('live', { closesMs: now + 10 * 60_000 }),
        event('next', { closesMs: now + 70 * 60_000 }),
        event('later', { closesMs: now + 130 * 60_000 }),
      ]),
      now,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['live'])
  })

  it('shows the whole ladder when asked', () => {
    const rows = collectUpDownRows(
      venue([
        event('live', { closesMs: now + 10 * 60_000 }),
        event('next', { closesMs: now + 70 * 60_000 }),
      ]),
      now,
      true,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['live', 'next'])
  })

  it('separates families rather than collapsing them to one row', () => {
    const rows = collectUpDownRows(
      venue([
        event('btc-hourly', { closesMs: now + 10 * 60_000 }),
        event('btc-daily', { horizon: 'daily', closesMs: now + 20 * 60_000 }),
        event('eth-hourly', { asset: 'ETH', closesMs: now + 30 * 60_000 }),
      ]),
      now,
    )
    expect(rows).toHaveLength(3)
  })

  it('drops a window that expired since the fetch', () => {
    const rows = collectUpDownRows(
      venue([
        event('gone', { closesMs: now - 1 }),
        event('live', { closesMs: now + 60_000 }),
      ]),
      now,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['live'])
  })

  it('breaks a shared close time deterministically', () => {
    // Kalshi opens all five of its fifteen-minute windows on one boundary, so
    // these tie to the millisecond and the venue that answered first must not
    // decide the order.
    const rows = collectUpDownRows(
      [
        {
          market: 'kalshi',
          label: 'Kalshi',
          events: [
            event('sol', { asset: 'SOL', closesMs: now + 60_000 }),
            event('btc', { asset: 'BTC', closesMs: now + 60_000 }),
            event('eth', { asset: 'ETH', closesMs: now + 60_000 }),
          ],
        },
      ],
      now,
    )
    expect(rows.map((r) => r.meta.asset)).toEqual(['BTC', 'ETH', 'SOL'])
  })

  it('carries the market price straight from the up leg', () => {
    const [row] = collectUpDownRows(
      venue([event('live', { closesMs: now + 60_000 })]),
      now,
    )
    expect(row.marketUp).toBe(0.6)
  })
})

describe('priceRow', () => {
  const now = 1_000 * HOUR
  const candles: Array<Candle> = Array.from({ length: 48 }, (_, i) => {
    const close = 100 * (1 + 0.004 * Math.sin(i))
    return {
      ts: (953 + i) * HOUR,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }
  })

  const rowFor = (over: Partial<PredictionUpDown> = {}) =>
    collectUpDownRows(
      venue([event('live', { closesMs: now + 30 * 60_000, ...over })]),
      now,
    )[0]

  it('reads the reference off the bar that opens the window', () => {
    // opensMs is exactly the 1000-hour bar; nothing else will do, because the
    // contract settles on THAT candle's open.
    const priced = priceRow(rowFor(), 100, candles, 'ready')
    expect(priced.referenceState).toBe('candle')
    expect(priced.reference).toBeCloseTo(candles[47].open, 9)
  })

  it('stays pending when the settlement bar has not arrived', () => {
    const priced = priceRow(
      rowFor({ opensMs: 2_000 * HOUR }),
      100,
      candles,
      'ready',
    )
    expect(priced.referenceState).toBe('pending')
    expect(priced.reference).toBeUndefined()
    expect(priced.modelUp).toBeUndefined()
  })

  it('says unavailable when no venue here carries the pair', () => {
    const priced = priceRow(rowFor(), 100, undefined, 'unavailable')
    expect(priced.referenceState).toBe('unavailable')
  })

  it('uses the published target without touching the candles', () => {
    const priced = priceRow(
      rowFor({ referenceBasis: 'venue', referencePrice: 90 }),
      100,
      undefined,
      'unavailable',
    )
    expect(priced.referenceState).toBe('venue')
    expect(priced.reference).toBe(90)
    // No candles means no volatility sample, so no model — a reference alone
    // is not enough.
    expect(priced.modelUp).toBeUndefined()
  })

  it('states the drift and the edge once every leg is present', () => {
    const priced = priceRow(
      rowFor({ referenceBasis: 'venue', referencePrice: 100 }),
      101,
      candles,
      'ready',
    )
    expect(priced.drift).toBeCloseTo(0.01, 9)
    expect(priced.modelUp).toBeDefined()
    expect(priced.edge).toBeCloseTo(priced.modelUp! - 0.6, 9)
  })

  it('leaves the model out when spot is missing', () => {
    const priced = priceRow(rowFor(), undefined, candles, 'ready')
    expect(priced.modelUp).toBeUndefined()
    expect(priced.edge).toBeUndefined()
  })
})

describe('formatWindowCountdown', () => {
  it('keeps seconds visible, which is the whole point of the column', () => {
    expect(formatWindowCountdown(95_000)).toBe('1:35')
    expect(formatWindowCountdown(9_000)).toBe('0:09')
  })

  it('grows a field at a time', () => {
    expect(formatWindowCountdown(3 * HOUR + 4 * 60_000 + 5_000)).toBe('3:04:05')
    expect(formatWindowCountdown(26 * HOUR)).toBe('1d 2:00')
  })

  it('never counts backwards past zero', () => {
    expect(formatWindowCountdown(0)).toBe('0:00')
    expect(formatWindowCountdown(-5_000)).toBe('0:00')
    expect(formatWindowCountdown(NaN)).toBe('0:00')
  })
})

describe('urgencyOf', () => {
  it('escalates as the window runs out', () => {
    expect(urgencyOf(30 * 60_000)).toBe('open')
    expect(urgencyOf(4 * 60_000)).toBe('soon')
    expect(urgencyOf(30_000)).toBe('closing')
  })
})

describe('spotPairsOf', () => {
  it('asks for each settlement pair once, however many rows share it', () => {
    const now = 1_000 * HOUR
    const rows = collectUpDownRows(
      venue([
        event('a', { closesMs: now + 60_000 }),
        event('b', { horizon: 'daily', closesMs: now + 120_000 }),
        event('c', {
          asset: 'ETH',
          spotPair: 'ETH-USDT',
          closesMs: now + 180_000,
        }),
      ]),
      now,
    )
    expect(spotPairsOf(rows)).toEqual(['BTC-USDT', 'ETH-USDT'])
  })
})
