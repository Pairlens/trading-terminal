// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The probability-move detector.
 *
 * The failure a reader notices is duplication: one 12-point rally reported as
 * six overlapping 12-point moves, which makes a calm market look like a
 * stampede. The second is the mirror — a spike that fully retraced reported as
 * a move, sending the reader hunting for news that explains nothing.
 */
import { describe, expect, test } from 'bun:test'

import {
  candleSpacingMs,
  detectProbabilityMoves,
  movesWindowBars,
} from '../moves'
import type { Candle } from '@pairlens/shared/types'

const HOUR = 3_600_000

/** Closes at hourly spacing; volume is the bar index so windows are checkable. */
function series(closes: Array<number>): Array<Candle> {
  return closes.map((close, i) => ({
    ts: i * HOUR,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }))
}

/** Flat, then a clean step, then flat again. */
const STEP = series([
  ...Array(6).fill(0.5),
  0.54,
  0.58,
  0.62,
  ...Array(6).fill(0.62),
])

describe('detectProbabilityMoves', () => {
  test('finds the step and states it in cents', () => {
    const moves = detectProbabilityMoves(STEP, {
      windowBars: 3,
      minDeltaCents: 5,
      limit: 5,
    })
    expect(moves).toHaveLength(1)
    expect(moves[0].deltaCents).toBeCloseTo(12, 6)
    expect(moves[0].from).toBeCloseTo(0.5, 10)
    expect(moves[0].to).toBeCloseTo(0.62, 10)
  })

  test('never reports two windows that overlap', () => {
    const moves = detectProbabilityMoves(STEP, {
      windowBars: 3,
      minDeltaCents: 1,
      limit: 10,
    })
    for (let i = 0; i < moves.length; i++) {
      for (let j = i + 1; j < moves.length; j++) {
        const a = moves[i]
        const b = moves[j]
        expect(a.startTs < b.endTs && b.startTs < a.endTs).toBe(false)
      }
    }
  })

  test('ignores a spike that fully retraced inside the window', () => {
    const spike = series([0.5, 0.5, 0.72, 0.5, 0.5, 0.5, 0.5, 0.5])
    expect(
      detectProbabilityMoves(spike, {
        windowBars: 4,
        minDeltaCents: 5,
        limit: 5,
      }),
    ).toHaveLength(0)
  })

  test('returns newest first', () => {
    const twoSteps = series([
      ...Array(4).fill(0.2),
      0.35,
      ...Array(4).fill(0.35),
      0.55,
      ...Array(4).fill(0.55),
    ])
    const moves = detectProbabilityMoves(twoSteps, {
      windowBars: 2,
      minDeltaCents: 5,
      limit: 5,
    })
    expect(moves.length).toBeGreaterThanOrEqual(2)
    expect(moves[0].endTs).toBeGreaterThan(moves[1].endTs)
  })

  test('sums the contracts traded across the window, excluding the anchor bar', () => {
    const moves = detectProbabilityMoves(STEP, {
      windowBars: 3,
      minDeltaCents: 5,
      limit: 1,
    })
    // Three bars follow the anchor, one unit each.
    expect(moves[0].volume).toBe(3)
  })

  test('honours the limit', () => {
    const noisy = series(
      Array.from({ length: 60 }, (_, i) => 0.5 + (i % 2 === 0 ? 0.1 : -0.1)),
    )
    expect(
      detectProbabilityMoves(noisy, {
        windowBars: 1,
        minDeltaCents: 1,
        limit: 3,
      }).length,
    ).toBeLessThanOrEqual(3)
  })

  test('says nothing about a series shorter than one window', () => {
    expect(
      detectProbabilityMoves(series([0.1, 0.9]), {
        windowBars: 5,
        minDeltaCents: 1,
        limit: 5,
      }),
    ).toEqual([])
  })

  test('skips bars with no close rather than reporting a NaN move', () => {
    const broken = series([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
    broken[3].close = Number.NaN
    const moves = detectProbabilityMoves(broken, {
      windowBars: 2,
      minDeltaCents: 0.1,
      limit: 5,
    })
    expect(moves.every((m) => Number.isFinite(m.deltaCents))).toBe(true)
  })
})

describe('movesWindowBars', () => {
  test('targets a day of wall clock', () => {
    expect(movesWindowBars(HOUR, 400)).toBe(24)
    expect(movesWindowBars(4 * HOUR, 400)).toBe(6)
    expect(movesWindowBars(24 * HOUR, 400)).toBe(2)
  })

  test('caps at a quarter of the series so a busy week still fits', () => {
    expect(movesWindowBars(HOUR, 40)).toBe(10)
  })

  test('never drops below two bars', () => {
    expect(movesWindowBars(HOUR, 3)).toBe(2)
    expect(movesWindowBars(0, 100)).toBe(6)
  })
})

describe('candleSpacingMs', () => {
  test('is the median gap, so one halt does not stretch the window', () => {
    const candles = series([1, 2, 3, 4, 5])
    candles[3].ts = candles[2].ts + 40 * HOUR
    candles[4].ts = candles[3].ts + HOUR
    expect(candleSpacingMs(candles)).toBe(HOUR)
  })

  test('is zero for a series with no gap to measure', () => {
    expect(candleSpacingMs([])).toBe(0)
    expect(candleSpacingMs(series([1]))).toBe(0)
  })
})
