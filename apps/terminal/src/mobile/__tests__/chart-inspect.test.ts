// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The inspect crosshair answers one question — "what was the price here" — and
 * every way it can answer it wrongly is arithmetic: a hairline that lands in
 * the price gutter reads a price the plot never showed, a tag centred on the
 * newest bar hangs half off the screen, a bar looked up by proximity rather
 * than by identity prints its neighbour's numbers.
 *
 * The gesture itself (hold, slop, the stopPropagation that keeps the chart
 * still while a finger scrubs) needs a pointer stream and a chart engine, so it
 * is not covered here; what IS covered is the boundary between a hold and a
 * pan, which is the part with a number in it.
 */
import { describe, expect, test } from 'bun:test'

import {
  INSPECT_FINGER_OFFSET_Y,
  INSPECT_HOLD_MS,
  INSPECT_SLOP_PX,
  barMove,
  exceedsSlop,
  findBarByTs,
  formatVolume,
  inspectPoint,
  labelLeft,
  showsClock,
} from '../chart/chart-inspect'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'

/** The chart band on an iPhone 16 Pro with the drawing toolbar docked. */
const FRAME = {
  width: 402,
  height: 620,
  priceAxisWidth: 56,
  timeAxisHeight: 22,
}

const PLOT_WIDTH = FRAME.width - FRAME.priceAxisWidth
const PLOT_HEIGHT = FRAME.height - FRAME.timeAxisHeight

const bar = (ts: number, over: Partial<ChartBar> = {}): ChartBar => ({
  ts,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 1_000,
  ...over,
})

describe('exceedsSlop', () => {
  test('a finger that has not moved is a hold', () => {
    expect(exceedsSlop({ x: 100, y: 200 }, { x: 100, y: 200 })).toBe(false)
    expect(
      exceedsSlop({ x: 100, y: 200 }, { x: 100 + INSPECT_SLOP_PX, y: 200 }),
    ).toBe(false)
  })

  test('either axis past the slop is a pan', () => {
    expect(exceedsSlop({ x: 100, y: 200 }, { x: 111, y: 200 })).toBe(true)
    expect(exceedsSlop({ x: 100, y: 200 }, { x: 100, y: 189 })).toBe(true)
  })

  test('the hold is short enough not to read as waiting', () => {
    // iOS's own long-press recognizer is 500ms and reads as sluggish for a
    // gesture whose whole job is to answer a question.
    expect(INSPECT_HOLD_MS).toBeLessThan(500)
    expect(INSPECT_HOLD_MS).toBeGreaterThan(200)
  })
})

describe('inspectPoint', () => {
  test('floats the free crosshair above the fingertip', () => {
    expect(inspectPoint({ x: 180, y: 400 }, FRAME, null)).toEqual({
      x: 180,
      y: 400 - INSPECT_FINGER_OFFSET_Y,
    })
  })

  test('rides the bar close in magnet mode, offset and all', () => {
    // The line is nowhere near the fingertip in magnet mode, so it is not
    // floated: the finger says WHICH bar, the series says where the line goes.
    expect(inspectPoint({ x: 180, y: 400 }, FRAME, 260)).toEqual({
      x: 180,
      y: 260,
    })
  })

  test('never lands in the price gutter or on the time axis', () => {
    const far = inspectPoint({ x: 900, y: 5_000 }, FRAME, null)
    expect(far.x).toBeLessThan(PLOT_WIDTH)
    expect(far.y).toBeLessThan(PLOT_HEIGHT)

    // A touch near the top of the plot floats the crosshair off the chart
    // without the clamp — a negative y reads a price above the highest bar.
    expect(inspectPoint({ x: 10, y: 12 }, FRAME, null).y).toBe(0)
  })
})

describe('findBarByTs', () => {
  const bars = [bar(1_000), bar(2_000), bar(3_000), bar(4_000), bar(5_000)]

  test('finds every bar in the buffer', () => {
    for (const wanted of bars) {
      expect(findBarByTs(bars, wanted.ts)?.ts).toBe(wanted.ts)
    }
  })

  test('refuses a timestamp between bars rather than guessing a neighbour', () => {
    // `coordinateToTime` snaps to a bar, so a miss means the buffer moved
    // under the crosshair — and a neighbour's OHLC would be a quiet lie.
    expect(findBarByTs(bars, 2_500)).toBeNull()
    expect(findBarByTs(bars, 0)).toBeNull()
    expect(findBarByTs(bars, 9_999)).toBeNull()
    expect(findBarByTs([], 1_000)).toBeNull()
  })
})

describe('barMove', () => {
  test('states the bar own move, open to close', () => {
    const move = barMove(bar(1, { open: 100, close: 105 }))
    expect(move).toEqual({ absolute: 5, percent: 5, up: true })
  })

  test('a down bar is down, a flat bar is up', () => {
    expect(barMove(bar(1, { open: 100, close: 95 }))?.up).toBe(false)
    expect(barMove(bar(1, { open: 100, close: 100 }))?.up).toBe(true)
  })

  test('refuses to divide by an open of zero', () => {
    expect(barMove(bar(1, { open: 0, close: 5 }))).toBeNull()
  })
})

describe('formatVolume', () => {
  test('states an order of magnitude, not a price', () => {
    // The shipped `formatAmount` prints four decimals below 1000, which is how
    // a quiet 15m candle came out reading "Vol 174.4869".
    expect(formatVolume(174.4869)).toBe('174')
    expect(formatVolume(1_243_000)).toBe('1.24M')
    expect(formatVolume(48_120)).toBe('48.1K')
    expect(formatVolume(12.3456)).toBe('12.35')
    expect(formatVolume(0)).toBe('0')
  })

  test('keeps the significant digits of a thin market', () => {
    expect(formatVolume(0.004213)).toBe('0.00421')
  })

  test('refuses a volume that is not a number', () => {
    expect(formatVolume(Number.NaN)).toBe('—')
    expect(formatVolume(-1)).toBe('—')
  })
})

describe('labelLeft', () => {
  test('centres a tag with room on both sides', () => {
    expect(labelLeft(200, 118, PLOT_WIDTH)).toBe(200 - 59)
  })

  test('holds the tag inside the plot at both edges', () => {
    // The right edge is where the newest bars are, and where a finger lands
    // most often — centring alone puts half the date off screen.
    expect(labelLeft(PLOT_WIDTH, 118, PLOT_WIDTH)).toBe(PLOT_WIDTH - 118 - 4)
    expect(labelLeft(0, 118, PLOT_WIDTH)).toBe(4)
  })

  test('never returns a negative left on a plot narrower than the tag', () => {
    expect(labelLeft(20, 118, 60)).toBe(4)
  })
})

describe('showsClock', () => {
  test('intraday bars carry a time', () => {
    for (const timeframe of [
      '1m',
      '5m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
    ] as const) {
      expect(showsClock(timeframe)).toBe(true)
    }
  })

  test('a daily bar or longer is a date', () => {
    // "Jul 3, 00:00" states a precision a daily bar does not have.
    for (const timeframe of ['1d', '3d', '1w', '1M'] as const) {
      expect(showsClock(timeframe)).toBe(false)
    }
  })
})
