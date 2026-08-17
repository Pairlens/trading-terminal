// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

import { formatMoney, formatShares, formatSignedMoney } from '../format'
import {
  dayBarSegments,
  resolveSessionState,
  sessionRange,
  splitCountdown,
} from '../session'
import type { MarketSessionDay } from '@pairlens/shared/instrument-types'

/**
 * Fixtures are real US sessions, expressed as UTC instants so the assertions
 * hold on any host: a normal August Monday, the Thanksgiving half day, and the
 * holiday itself, which is a MISSING entry rather than a flagged one.
 */
const MONDAY: MarketSessionDay = {
  date: '2026-08-17',
  preOpenMs: Date.parse('2026-08-17T08:00:00Z'), // 04:00 ET
  openMs: Date.parse('2026-08-17T13:30:00Z'), // 09:30 ET
  closeMs: Date.parse('2026-08-17T20:00:00Z'), // 16:00 ET
  postCloseMs: Date.parse('2026-08-18T00:00:00Z'), // 20:00 ET
}

const TUESDAY: MarketSessionDay = {
  date: '2026-08-18',
  preOpenMs: Date.parse('2026-08-18T08:00:00Z'),
  openMs: Date.parse('2026-08-18T13:30:00Z'),
  closeMs: Date.parse('2026-08-18T20:00:00Z'),
  postCloseMs: Date.parse('2026-08-19T00:00:00Z'),
}

/** Black Friday: the bell rings at 13:00 ET. */
const HALF_DAY: MarketSessionDay = {
  date: '2026-11-27',
  preOpenMs: Date.parse('2026-11-27T09:00:00Z'), // 04:00 EST
  openMs: Date.parse('2026-11-27T14:30:00Z'), // 09:30 EST
  closeMs: Date.parse('2026-11-27T18:00:00Z'), // 13:00 EST
  postCloseMs: Date.parse('2026-11-27T22:00:00Z'), // 17:00 EST
}

const CLOCK_OPEN = {
  nowMs: Date.parse('2026-08-17T15:00:00Z'),
  isOpen: true,
  nextOpenMs: Date.parse('2026-08-18T13:30:00Z'),
  nextCloseMs: Date.parse('2026-08-17T20:00:00Z'),
  timeZone: 'America/New_York',
}

describe('resolveSessionState — phase from the venue calendar', () => {
  const days = [MONDAY, TUESDAY]

  it('is pre-market between the extended open and the auction', () => {
    const state = resolveSessionState({
      nowMs: Date.parse('2026-08-17T11:42:00Z'), // 07:42 ET
      clock: null,
      days,
    })
    expect(state.phase).toBe('pre')
    expect(state.nextBoundary).toBe('open')
    expect(state.nextBoundaryMs).toBe(MONDAY.openMs)
    expect(state.day?.date).toBe('2026-08-17')
  })

  it('is regular hours between the auction bounds, counting to the close', () => {
    const state = resolveSessionState({
      nowMs: Date.parse('2026-08-17T16:48:00Z'), // 12:48 ET
      clock: null,
      days,
    })
    expect(state.phase).toBe('rth')
    expect(state.nextBoundary).toBe('close')
    expect(state.nextBoundaryMs).toBe(MONDAY.closeMs)
  })

  it('is after-hours between the close and the extended close', () => {
    const state = resolveSessionState({
      nowMs: Date.parse('2026-08-17T21:00:00Z'), // 17:00 ET
      clock: null,
      days,
    })
    expect(state.phase).toBe('post')
    expect(state.nextBoundaryMs).toBe(MONDAY.postCloseMs)
  })

  // The exact instant of the bell belongs to the session it opens, not to the
  // one it ends: a strip that reads "pre-market" at 09:30:00 is wrong in the
  // only second anyone is watching it.
  it('flips at the boundary instants, not a tick later', () => {
    const at = (ms: number) =>
      resolveSessionState({ nowMs: ms, clock: null, days }).phase
    expect(at(MONDAY.preOpenMs! - 1)).toBe('closed')
    expect(at(MONDAY.preOpenMs!)).toBe('pre')
    expect(at(MONDAY.openMs - 1)).toBe('pre')
    expect(at(MONDAY.openMs)).toBe('rth')
    expect(at(MONDAY.closeMs - 1)).toBe('rth')
    expect(at(MONDAY.closeMs)).toBe('post')
    expect(at(MONDAY.postCloseMs! - 1)).toBe('post')
    expect(at(MONDAY.postCloseMs!)).toBe('closed')
  })

  it('counts an overnight gap to the next extended open, not the auction', () => {
    const state = resolveSessionState({
      nowMs: Date.parse('2026-08-18T02:00:00Z'), // 22:00 ET Monday
      clock: null,
      days,
    })
    expect(state.phase).toBe('closed')
    expect(state.nextBoundary).toBe('preOpen')
    expect(state.nextBoundaryMs).toBe(TUESDAY.preOpenMs)
    expect(state.nextDay?.date).toBe('2026-08-18')
  })

  // Thanksgiving is simply not in the calendar, so 12:00 ET on the holiday
  // must resolve to closed with Friday as the next session.
  it('treats a holiday as an absent day and points at the next session', () => {
    const state = resolveSessionState({
      nowMs: Date.parse('2026-11-26T17:00:00Z'),
      clock: null,
      days: [HALF_DAY],
    })
    expect(state.phase).toBe('closed')
    expect(state.nextDay?.date).toBe('2026-11-27')
    expect(state.nextBoundaryMs).toBe(HALF_DAY.preOpenMs)
  })

  it('closes a half day at 13:00, not at 16:00', () => {
    const state = resolveSessionState({
      nowMs: Date.parse('2026-11-27T19:00:00Z'), // 14:00 EST
      clock: null,
      days: [HALF_DAY],
    })
    expect(state.phase).toBe('post')
    expect(
      resolveSessionState({
        nowMs: Date.parse('2026-11-27T17:59:00Z'),
        clock: null,
        days: [HALF_DAY],
      }).phase,
    ).toBe('rth')
  })

  it('reads open or closed off the clock when the calendar never arrived', () => {
    const state = resolveSessionState({
      nowMs: CLOCK_OPEN.nowMs,
      clock: CLOCK_OPEN,
      days: [],
    })
    expect(state.phase).toBe('rth')
    expect(state.source).toBe('clock')
    expect(state.day).toBeNull()
    expect(state.nextBoundaryMs).toBe(CLOCK_OPEN.nextCloseMs)
  })

  it('says closed with no boundary when neither source answered', () => {
    const state = resolveSessionState({ nowMs: 1, clock: null, days: [] })
    expect(state).toMatchObject({
      phase: 'closed',
      source: 'none',
      nextBoundaryMs: null,
    })
  })

  it('does not care what order the calendar arrived in', () => {
    const state = resolveSessionState({
      nowMs: Date.parse('2026-08-17T16:00:00Z'),
      clock: null,
      days: [TUESDAY, MONDAY],
    })
    expect(state.day?.date).toBe('2026-08-17')
  })
})

describe('dayBarSegments — the strip is drawn on real hours', () => {
  it('measures the segments against the published schedule', () => {
    const bar = dayBarSegments(MONDAY, MONDAY.openMs)
    // 5.5h pre, 6.5h regular, 4h post over a 16h day.
    expect(bar.pre).toBeCloseTo(5.5 / 16, 6)
    expect(bar.rth).toBeCloseTo(6.5 / 16, 6)
    expect(bar.post).toBeCloseTo(4 / 16, 6)
    expect(bar.pre + bar.rth + bar.post).toBeCloseTo(1, 6)
    expect(bar.nowFraction).toBeCloseTo(5.5 / 16, 6)
  })

  it('shortens the regular band on a half day', () => {
    const full = dayBarSegments(MONDAY, MONDAY.openMs)
    const half = dayBarSegments(HALF_DAY, HALF_DAY.openMs)
    expect(half.rth).toBeLessThan(full.rth)
    expect(half.post).toBeGreaterThan(full.post)
  })

  it('has no marker when now is outside the day', () => {
    expect(dayBarSegments(MONDAY, MONDAY.preOpenMs! - 1).nowFraction).toBeNull()
  })

  it('survives a venue that publishes no extended hours', () => {
    const bar = dayBarSegments(
      { date: '2026-08-17', openMs: MONDAY.openMs, closeMs: MONDAY.closeMs },
      MONDAY.closeMs,
    )
    expect(bar).toMatchObject({ pre: 0, rth: 1, post: 0 })
    expect(bar.nowFraction).toBe(1)
  })
})

describe('splitCountdown', () => {
  it('floors, so a minute shown is a minute left', () => {
    expect(splitCountdown(90_000)).toMatchObject({ minutes: 1, seconds: 30 })
    expect(splitCountdown(3600_000 * 3 + 60_000 * 12)).toMatchObject({
      hours: 3,
      minutes: 12,
    })
  })

  it('carries whole days for a weekend gap and clamps a passed boundary', () => {
    expect(splitCountdown(86_400_000 * 2 + 3600_000).days).toBe(2)
    expect(splitCountdown(-5000)).toMatchObject({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })
})

describe('sessionRange — the day range off the candle buffer', () => {
  const candles = [
    { ts: Date.parse('2026-08-17T12:00:00Z'), high: 121.4, low: 120.9 },
    { ts: Date.parse('2026-08-17T14:00:00Z'), high: 122.6, low: 118.2 },
    { ts: Date.parse('2026-08-17T19:00:00Z'), high: 121.9, low: 121.0 },
    // Yesterday's tape must not widen today's range.
    { ts: Date.parse('2026-08-14T18:00:00Z'), high: 140.0, low: 100.0 },
  ]

  it('spans the session window only', () => {
    expect(
      sessionRange(candles, MONDAY.preOpenMs!, MONDAY.postCloseMs!, 3_600_000),
    ).toEqual({ low: 118.2, high: 122.6 })
  })

  it('refuses a timeframe whose bar covers more than a day', () => {
    expect(
      sessionRange(
        candles,
        MONDAY.preOpenMs!,
        MONDAY.postCloseMs!,
        604_800_000,
      ),
    ).toBeNull()
  })

  it('returns null rather than an infinite range when nothing is in window', () => {
    expect(sessionRange([], MONDAY.openMs, MONDAY.closeMs, 60_000)).toBeNull()
  })
})

describe('the module never reads a host clock', () => {
  /**
   * The one failure this whole file exists to prevent is a session that is
   * right in New York and an hour wrong everywhere else. Every instant enters
   * as a parameter, so a single `Date.now()` or local-time getter is the
   * regression — and it is invisible to a test suite that happens to run in
   * the same timezone as the fixtures.
   */
  it('constructs no Date and calls no local-time getter', () => {
    const src = readFileSync(
      join(import.meta.dir, '..', 'session.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    expect(src).not.toMatch(/new Date\(|Date\.now\(|getTimezoneOffset/)
    expect(src).not.toMatch(/getHours\(|getMinutes\(|getDate\(|getMonth\(/)
  })
})

describe('signed money and share counts', () => {
  /**
   * The regression this exists for: `formatPrice` clamps everything at or
   * below zero to '$0.00', so a losing position rendered as flat. A pane that
   * shows a $638 loss as zero is worse than one that shows nothing.
   */
  it('keeps the sign on a loss instead of clamping it to zero', () => {
    expect(formatSignedMoney(-638)).toBe('-$638.00')
    expect(formatSignedMoney(3722.4)).toBe('+$3,722.40')
    expect(formatSignedMoney(0)).toBe('$0.00')
    expect(formatSignedMoney(Number.NaN)).toBe('$0.00')
    expect(formatMoney(26_642)).toBe('$26,642.00')
  })

  it('renders whole share counts whole and fractional ones exactly', () => {
    expect(formatShares(220)).toBe('220')
    expect(formatShares(1_400)).toBe('1,400')
    expect(formatShares(0.5)).toBe('0.5')
    expect(formatShares(2.123456)).toBe('2.1235')
  })
})
