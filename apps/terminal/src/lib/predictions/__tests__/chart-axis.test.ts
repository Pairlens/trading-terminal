// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  DAY,
  formatAxisTime,
  formatTooltipTime,
  isDateSpan,
  spanOf,
} from '../chart-axis'

const HOUR = 3_600_000
const AT = new Date(2026, 7, 15, 9, 30, 0).getTime()

describe('isDateSpan', () => {
  it('keeps the clock inside a day and a half', () => {
    expect(isDateSpan(6 * HOUR)).toBe(false)
    expect(isDateSpan(DAY)).toBe(false)
  })

  it('switches to dates past it', () => {
    // The case it exists for: a week drawn from hourly candles, which under a
    // clock label is seven repeats of the same twenty-four strings.
    expect(isDateSpan(7 * DAY)).toBe(true)
  })
})

describe('formatAxisTime', () => {
  it('labels an intraday span with the clock', () => {
    const label = formatAxisTime(AT, 6 * HOUR)
    expect(label).toMatch(/\d/)
    expect(label).not.toMatch(/Aug/)
  })

  it('labels a multi-day span with the date', () => {
    expect(formatAxisTime(AT, 7 * DAY)).toMatch(/Aug/)
  })

  it('answers empty for a nonsense instant rather than "Invalid Date"', () => {
    expect(formatAxisTime(NaN, DAY)).toBe('')
  })
})

describe('formatTooltipTime', () => {
  it('always carries the date, even intraday', () => {
    expect(formatTooltipTime(AT, 6 * HOUR)).toMatch(/Aug/)
  })

  it('drops the hour once the buckets are days', () => {
    // A month of daily closes is all midnight; printing it is noise.
    const label = formatTooltipTime(AT, 30 * DAY)
    expect(label).toMatch(/Aug/)
    expect(label).not.toMatch(/:/)
  })

  it('keeps the hour just under the threshold', () => {
    expect(formatTooltipTime(AT, 7 * DAY)).toMatch(/:/)
  })
})

describe('spanOf', () => {
  it('measures first to last', () => {
    expect(spanOf([{ ts: 0 }, { ts: HOUR }, { ts: 3 * HOUR }])).toBe(3 * HOUR)
  })

  it('is zero for fewer than two rows', () => {
    expect(spanOf([])).toBe(0)
    expect(spanOf([{ ts: HOUR }])).toBe(0)
  })
})
