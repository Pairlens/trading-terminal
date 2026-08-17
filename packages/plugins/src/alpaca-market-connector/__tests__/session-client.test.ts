// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'

import {
  ALPACA_SESSION_TZ,
  exchangeDateOf,
  fetchAlpacaCalendar,
  fetchAlpacaClock,
  parseAlpacaCalendarDay,
  parseAlpacaClock,
  shiftExchangeDate,
  wallClockToMs,
} from '../session-client'

/**
 * The session layer's whole reason to exist is that '09:30 ET' is not a
 * constant: it is -04:00 in August and -05:00 in December, it is 13:00 on
 * Christmas Eve, and it does not happen at all on Thanksgiving. Every
 * assertion here is an absolute UTC epoch, which is what makes the file
 * timezone-safe — a host in Tokyo computes the same numbers, because nothing
 * in the module ever touches host-local time.
 */

const CREDS = { apiKey: 'PKTEST123', apiSecret: 'alpaca-secret-DO-NOT-LEAK' }

type Captured = { url: string; init: RequestInit }

function stubFetch(responseJson: unknown, status = 200): Array<Captured> {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(responseJson), { status })
  }) as unknown as typeof fetch
  return calls
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('wallClockToMs — exchange wall clock to an instant', () => {
  it('reads a summer session open as EDT (-04:00)', () => {
    expect(wallClockToMs('2026-08-17', '09:30', ALPACA_SESSION_TZ)).toBe(
      Date.parse('2026-08-17T13:30:00Z'),
    )
  })

  it('reads a winter session open as EST (-05:00)', () => {
    expect(wallClockToMs('2026-12-24', '09:30', ALPACA_SESSION_TZ)).toBe(
      Date.parse('2026-12-24T14:30:00Z'),
    )
  })

  // The day the offset changes: a single-pass conversion picks the offset at
  // the wrong instant and lands an hour out. Both DST edges are asserted
  // because they fail in opposite directions.
  it('is exact on the spring-forward day', () => {
    expect(wallClockToMs('2026-03-08', '09:30', ALPACA_SESSION_TZ)).toBe(
      Date.parse('2026-03-08T13:30:00Z'),
    )
  })

  // 09:30 on the fall-back day is already back on EST, an hour later in UTC
  // than the same wall clock a day earlier.
  it('is exact on the fall-back day', () => {
    expect(wallClockToMs('2026-11-01', '09:30', ALPACA_SESSION_TZ)).toBe(
      Date.parse('2026-11-01T14:30:00Z'),
    )
    expect(wallClockToMs('2026-10-31', '09:30', ALPACA_SESSION_TZ)).toBe(
      Date.parse('2026-10-31T13:30:00Z'),
    )
  })

  it('accepts the compact HHMM form the session bounds use', () => {
    expect(wallClockToMs('2026-08-17', '0400', ALPACA_SESSION_TZ)).toBe(
      Date.parse('2026-08-17T08:00:00Z'),
    )
  })

  it('refuses a malformed date or time rather than guessing', () => {
    expect(wallClockToMs('17-08-2026', '09:30', ALPACA_SESSION_TZ)).toBeNull()
    expect(wallClockToMs('2026-08-17', '', ALPACA_SESSION_TZ)).toBeNull()
  })
})

describe('exchange dates', () => {
  // 00:30 UTC is still the previous afternoon in New York, which is exactly
  // the case a `toISOString().slice(0, 10)` gets wrong.
  it('names the exchange day, not the UTC day', () => {
    const utcMs = Date.parse('2026-08-18T00:30:00Z')
    expect(exchangeDateOf(utcMs, ALPACA_SESSION_TZ)).toBe('2026-08-17')
  })

  it('shifts by whole exchange days', () => {
    const utcMs = Date.parse('2026-08-17T17:00:00Z')
    expect(shiftExchangeDate(utcMs, -1, ALPACA_SESSION_TZ)).toBe('2026-08-16')
    expect(shiftExchangeDate(utcMs, 8, ALPACA_SESSION_TZ)).toBe('2026-08-25')
  })
})

describe('parseAlpacaClock', () => {
  it('normalizes the venue clock to epoch milliseconds', () => {
    const clock = parseAlpacaClock({
      timestamp: '2026-08-17T11:12:13-04:00',
      is_open: false,
      next_open: '2026-08-17T09:30:00-04:00',
      next_close: '2026-08-17T16:00:00-04:00',
    })
    expect(clock).toEqual({
      nowMs: Date.parse('2026-08-17T15:12:13Z'),
      isOpen: false,
      nextOpenMs: Date.parse('2026-08-17T13:30:00Z'),
      nextCloseMs: Date.parse('2026-08-17T20:00:00Z'),
      timeZone: ALPACA_SESSION_TZ,
    })
  })

  it('rejects a response with no timestamp', () => {
    expect(parseAlpacaClock({ is_open: true })).toBeNull()
  })
})

describe('parseAlpacaCalendarDay', () => {
  it('carries the extended-hours bounds when the venue publishes them', () => {
    const day = parseAlpacaCalendarDay({
      date: '2026-08-17',
      open: '09:30',
      close: '16:00',
      session_open: '0400',
      session_close: '2000',
    })
    expect(day).toEqual({
      date: '2026-08-17',
      openMs: Date.parse('2026-08-17T13:30:00Z'),
      closeMs: Date.parse('2026-08-17T20:00:00Z'),
      preOpenMs: Date.parse('2026-08-17T08:00:00Z'),
      postCloseMs: Date.parse('2026-08-18T00:00:00Z'),
    })
  })

  // A half day is a shorter close, not a flag — this is the case a hardcoded
  // 16:00 gets wrong twice a year.
  it('reports a half day as its own earlier close', () => {
    const day = parseAlpacaCalendarDay({
      date: '2026-11-27',
      open: '09:30',
      close: '13:00',
    })
    expect(day?.closeMs).toBe(Date.parse('2026-11-27T18:00:00Z'))
    expect(day?.preOpenMs).toBeUndefined()
    expect(day?.postCloseMs).toBeUndefined()
  })

  it('drops an extended window that folds inside the regular one', () => {
    const day = parseAlpacaCalendarDay({
      date: '2026-08-17',
      open: '09:30',
      close: '16:00',
      session_open: '1000',
      session_close: '1500',
    })
    expect(day?.preOpenMs).toBeUndefined()
    expect(day?.postCloseMs).toBeUndefined()
  })
})

describe('requests', () => {
  it('reads the clock off the paper host with the auth headers', async () => {
    const calls = stubFetch({
      timestamp: '2026-08-17T09:31:00-04:00',
      is_open: true,
      next_open: '2026-08-18T09:30:00-04:00',
      next_close: '2026-08-17T16:00:00-04:00',
    })
    const clock = await fetchAlpacaClock(CREDS, 'paper')

    expect(calls[0].url).toBe('https://paper-api.alpaca.markets/v2/clock')
    expect(
      (calls[0].init.headers as Record<string, string>)['APCA-API-KEY-ID'],
    ).toBe(CREDS.apiKey)
    expect(clock.isOpen).toBe(true)
  })

  it('reads the calendar off the live host for a live account', async () => {
    const calls = stubFetch([
      { date: '2026-08-17', open: '09:30', close: '16:00' },
    ])
    await fetchAlpacaCalendar(CREDS, 'live', '2026-08-16', '2026-08-25')

    expect(calls[0].url).toContain('https://api.alpaca.markets/v2/calendar')
    expect(calls[0].url).toContain('start=2026-08-16')
    expect(calls[0].url).toContain('end=2026-08-25')
  })

  it('returns trading days ascending, dropping unreadable rows', async () => {
    stubFetch([
      { date: '2026-08-19', open: '09:30', close: '16:00' },
      { open: '09:30', close: '16:00' },
      { date: '2026-08-17', open: '09:30', close: '16:00' },
    ])
    const calendar = await fetchAlpacaCalendar(
      CREDS,
      'paper',
      '2026-08-17',
      '2026-08-19',
    )
    expect(calendar.days.map((d) => d.date)).toEqual([
      '2026-08-17',
      '2026-08-19',
    ])
    expect(calendar.timeZone).toBe(ALPACA_SESSION_TZ)
  })

  it('surfaces a refused clock read rather than reporting a closed market', async () => {
    stubFetch({ message: 'forbidden' }, 403)
    await expect(fetchAlpacaClock(CREDS, 'paper')).rejects.toThrow('403')
  })
})
