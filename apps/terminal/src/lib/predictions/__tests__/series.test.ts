// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  alignSeries,
  dayTicks,
  lastValues,
  windowChange,
  withLivePoint,
} from '../series'

const HOUR = 3_600_000

/** Candles on the grid, oldest-first, starting at `start`. */
function candles(start: number, closes: Array<number>, step = HOUR) {
  return closes.map((close, i) => ({ ts: start + i * step, close }))
}

describe('alignSeries', () => {
  it('puts two runners on one row per bucket', () => {
    const { rows } = alignSeries(
      [
        { key: 'A', points: candles(0, [0.2, 0.3, 0.4]) },
        { key: 'B', points: candles(0, [0.8, 0.7, 0.6]) },
      ],
      HOUR,
    )
    expect(rows).toEqual([
      { ts: 0, A: 0.2, B: 0.8 },
      { ts: HOUR, A: 0.3, B: 0.7 },
      { ts: 2 * HOUR, A: 0.4, B: 0.6 },
    ])
  })

  it('forward-fills a gap rather than breaking the line', () => {
    const { rows } = alignSeries(
      [
        {
          key: 'A',
          points: [
            { ts: 0, close: 0.2 },
            { ts: 3 * HOUR, close: 0.5 },
          ],
        },
      ],
      HOUR,
    )
    expect(rows.map((r) => r['A'])).toEqual([0.2, 0.2, 0.2, 0.5])
  })

  it('never back-fills before a runner exists', () => {
    // B is listed two hours in. A flat 0.1 line reaching back to the origin
    // would claim the market priced it while it was unlisted.
    const { rows } = alignSeries(
      [
        { key: 'A', points: candles(0, [0.2, 0.3, 0.4, 0.5]) },
        { key: 'B', points: candles(2 * HOUR, [0.1, 0.15]) },
      ],
      HOUR,
    )
    expect(rows.map((r) => r['B'])).toEqual([undefined, undefined, 0.1, 0.15])
    expect(rows.map((r) => r['A'])).toEqual([0.2, 0.3, 0.4, 0.5])
  })

  it('snaps unaligned venue timestamps onto the interval grid', () => {
    const { rows } = alignSeries(
      [
        { key: 'A', points: [{ ts: 90_000, close: 0.4 }] },
        { key: 'B', points: [{ ts: 3_500_000, close: 0.6 }] },
      ],
      HOUR,
    )
    // Both land in the first hour bucket, so they share one row.
    expect(rows).toEqual([{ ts: 0, A: 0.4, B: 0.6 }])
  })

  it('keeps the later close when two candles share a bucket', () => {
    const { rows } = alignSeries(
      [
        {
          key: 'A',
          points: [
            { ts: 0, close: 0.4 },
            { ts: 60_000, close: 0.7 },
          ],
        },
      ],
      HOUR,
    )
    expect(rows).toEqual([{ ts: 0, A: 0.7 }])
  })

  it('strides long spans down and states the stride', () => {
    const { rows, stride, intervalMs } = alignSeries(
      [
        {
          key: 'A',
          points: candles(
            0,
            Array.from({ length: 100 }, (_, i) => i / 100),
          ),
        },
      ],
      HOUR,
      10,
    )
    expect(stride).toBe(10)
    expect(intervalMs).toBe(10 * HOUR)
    expect(rows.length).toBeLessThanOrEqual(11)
    // The newest bucket always survives the stride: the right edge is where
    // the current probability is read from.
    expect(rows[rows.length - 1]?.ts).toBe(99 * HOUR)
  })

  it('carries a quote that falls between two strided rows', () => {
    // The only print for B is at hour 1, which the stride does not emit — the
    // dense walk still has to see it, or B disappears from the chart.
    const { rows } = alignSeries(
      [
        { key: 'A', points: candles(0, [0.1, 0.2, 0.3, 0.4]) },
        { key: 'B', points: [{ ts: HOUR, close: 0.9 }] },
      ],
      HOUR,
      2,
    )
    expect(rows[rows.length - 1]?.['B']).toBe(0.9)
  })

  it('answers empty for no input and for a nonsense interval', () => {
    expect(alignSeries([], HOUR).rows).toEqual([])
    expect(
      alignSeries([{ key: 'A', points: candles(0, [0.1]) }], 0).rows,
    ).toEqual([])
  })

  it('ignores non-finite points instead of poisoning the grid', () => {
    const { rows } = alignSeries(
      [
        {
          key: 'A',
          points: [
            { ts: 0, close: 0.2 },
            { ts: NaN, close: 0.9 },
            { ts: HOUR, close: Number.POSITIVE_INFINITY },
          ],
        },
      ],
      HOUR,
    )
    expect(rows).toEqual([{ ts: 0, A: 0.2 }])
  })
})

describe('lastValues', () => {
  it('reads each runner’s newest value, even from different rows', () => {
    const rows = [
      { ts: 0, A: 0.2, B: 0.8 },
      { ts: HOUR, A: 0.3 },
    ]
    expect(lastValues(rows, ['A', 'B'])).toEqual(
      new Map([
        ['A', 0.3],
        ['B', 0.8],
      ]),
    )
  })
})

describe('windowChange', () => {
  it('measures each runner from its own first drawn value', () => {
    const rows = [
      { ts: 0, A: 0.2 },
      { ts: HOUR, A: 0.3, B: 0.5 },
      { ts: 2 * HOUR, A: 0.5, B: 0.4 },
    ]
    const change = windowChange(rows, ['A', 'B'])
    expect(change.get('A')).toBeCloseTo(0.3, 10)
    // B started at 0.5 when it listed, not at the window's left edge.
    expect(change.get('B')).toBeCloseTo(-0.1, 10)
  })

  it('omits a runner with no drawn value at all', () => {
    expect(windowChange([{ ts: 0, A: 0.2 }], ['B']).has('B')).toBe(false)
  })
})

describe('withLivePoint', () => {
  it('overwrites the forming bucket rather than appending past it', () => {
    const rows = [
      { ts: 0, A: 0.2 },
      { ts: HOUR, A: 0.3 },
    ]
    const next = withLivePoint(rows, 'A', 0.42)
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual({ ts: HOUR, A: 0.42 })
  })

  it('returns the same array when nothing changed', () => {
    const rows = [{ ts: 0, A: 0.2 }]
    expect(withLivePoint(rows, 'A', 0.2)).toBe(rows)
    expect(withLivePoint(rows, 'A', null)).toBe(rows)
    expect(withLivePoint([], 'A', 0.5)).toEqual([])
  })
})

describe('dayTicks', () => {
  it('emits one tick per calendar day, on a real data point', () => {
    // Three hourly rows inside one day, then two inside the next.
    const base = new Date(2026, 7, 12, 9, 0, 0).getTime()
    const rows = [
      { ts: base },
      { ts: base + HOUR },
      { ts: base + 2 * HOUR },
      { ts: base + 24 * HOUR },
      { ts: base + 25 * HOUR },
    ]
    expect(dayTicks(rows)).toEqual([base, base + 24 * HOUR])
  })

  it('strides rather than truncating past the cap', () => {
    const base = new Date(2026, 7, 1, 0, 0, 0).getTime()
    const rows = Array.from({ length: 30 }, (_, i) => ({
      ts: base + i * 24 * HOUR,
    }))
    const ticks = dayTicks(rows, 6)
    expect(ticks.length).toBeLessThanOrEqual(6)
    // Strided across the whole span, not the first six days.
    expect(ticks[0]).toBe(base)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(base + 20 * 24 * HOUR)
  })

  it('is empty for no rows', () => {
    expect(dayTicks([])).toEqual([])
  })
})
