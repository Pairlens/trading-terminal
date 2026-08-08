// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pinned intervals are persisted, long-press-edited state with one rule that
 * has to hold forever: a promotion must never evict the interval the chart is
 * currently showing, or the pinned row and the chart disagree the moment the
 * user pins anything.
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_PINNED_TIMEFRAMES,
  PINNED_LIMIT,
  promotePinned,
  touchPinned,
} from '../chart/use-pinned-timeframes'
import { TIMEFRAME_OPTIONS } from '@/components/terminal/chart-toolbar'

describe('touchPinned', () => {
  test('a selection becomes the most recent', () => {
    expect(touchPinned(['1m', '1h', '1d', '1w'], '1d')).toEqual([
      '1d',
      '1m',
      '1h',
      '1w',
    ])
  })

  test('selecting the most recent, or something unpinned, changes nothing', () => {
    const pinned = ['1m', '1h', '1d', '1w']
    expect(touchPinned(pinned, '1m')).toBe(pinned)
    expect(touchPinned(pinned, '4h')).toBe(pinned)
  })
})

describe('promotePinned', () => {
  test('a promoted interval enters and the least recent leaves', () => {
    const next = promotePinned(['1m', '1h', '1d', '1w'], '4h', '1m')
    expect(next[0]).toBe('4h')
    expect(next).toHaveLength(PINNED_LIMIT)
    expect(next).not.toContain('1w')
  })

  test('the interval on the chart is never the one evicted', () => {
    // '1w' is stalest AND is what the chart is showing: the next stalest goes.
    const next = promotePinned(['1m', '1h', '1d', '1w'], '4h', '1w')
    expect(next).toContain('1w')
    expect(next).not.toContain('1d')
    expect(next).toHaveLength(PINNED_LIMIT)
  })

  test('promoting an already-pinned interval only refreshes recency', () => {
    const next = promotePinned(['1m', '1h', '1d', '1w'], '1d', '1m')
    expect(next).toEqual(['1d', '1m', '1h', '1w'])
  })

  test('the row never grows past four, however many are promoted', () => {
    let pinned = DEFAULT_PINNED_TIMEFRAMES
    for (const value of ['5m', '15m', '30m', '2h', '4h', '3d', '1M']) {
      pinned = promotePinned(pinned, value, '1d')
      expect(pinned.length).toBeLessThanOrEqual(PINNED_LIMIT)
      expect(pinned).toContain('1d')
    }
  })
})

describe('the pinned defaults track the shared interval list', () => {
  test('every default pin is an interval this build offers', () => {
    // The design draws `1m · 1h · 1D · 1W`; the stored values are the chart's
    // own lowercase keys, and a mismatch would render an empty pinned row.
    const values = new Set(TIMEFRAME_OPTIONS.map((option) => option.value))
    for (const value of DEFAULT_PINNED_TIMEFRAMES) {
      expect(values.has(value)).toBe(true)
    }
    expect(DEFAULT_PINNED_TIMEFRAMES).toHaveLength(PINNED_LIMIT)
  })

  test('the "more" grid is never empty', () => {
    expect(TIMEFRAME_OPTIONS.length).toBeGreaterThan(PINNED_LIMIT)
  })
})
