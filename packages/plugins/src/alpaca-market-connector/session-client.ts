// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The trading day, from the broker rather than from a constant.
 *
 * US equity hours look like a rule you can hardcode until December 24th, when
 * the bell rings at 13:00, or Thanksgiving, when it does not ring at all. Both
 * live in Alpaca's calendar and nowhere in a `09:30` literal, so the session
 * panes ask the venue and the venue's answer is the only source.
 *
 * Two endpoints on the TRADING host (paper and live serve the same schedule):
 *   GET /v2/clock     now, open/closed, next open, next close
 *   GET /v2/calendar  one entry per TRADING day, with its own open/close
 *
 * The calendar publishes wall-clock strings ('09:30') with no offset, because
 * Alpaca schedules everything in America/New_York. Converting them here rather
 * than at the pane is deliberate: the wire type is epoch milliseconds, so no
 * consumer ever reimplements a DST-aware conversion, and the one that exists
 * is tested.
 */
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { parseTs } from './parser'
import { resolveAlpacaTradingUrls } from './regions'
import type {
  MarketSessionCalendar,
  MarketSessionClock,
  MarketSessionDay,
} from '@pairlens/shared/instrument-types'
import type { AlpacaCredentials } from './rest-client'

/** Every US equity session Alpaca schedules is in exchange time. */
export const ALPACA_SESSION_TZ = 'America/New_York'

function authHeaders(credentials: AlpacaCredentials): Record<string, string> {
  return {
    'APCA-API-KEY-ID': credentials.apiKey,
    'APCA-API-SECRET-KEY': credentials.apiSecret,
  }
}

// ── Timezone-safe wall clock → epoch ──────────────────────────────────

/**
 * How far the zone runs ahead of UTC at `utcMs`, in milliseconds.
 *
 * `Intl` is the only DST table available to a browser build, so the offset is
 * recovered by formatting the instant in the zone and reading the difference
 * back. Hardcoding -5/-4 would be wrong for two weeks a year, and those two
 * weeks are exactly when the US and European clocks disagree.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))

  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')

  // `hour12: false` renders midnight as 24 in some ICU versions.
  const hour = get('hour') % 24
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  )
  return asUtc - utcMs
}

/**
 * '2026-11-01' + '09:30' in `timeZone` → epoch ms.
 *
 * Two passes, not one: the first offset is looked up at the wrong instant by
 * definition (we are converting FROM wall clock), and on a DST boundary that
 * first guess lands an hour out. The second lookup uses a candidate that is
 * already within an hour of the answer, which is exact for every real session
 * bound — no US session starts inside the 02:00 transition hour.
 */
export function wallClockToMs(
  date: string,
  time: string,
  timeZone: string,
): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  // Alpaca writes '09:30' on the calendar and '0400' on the session bounds.
  const timeMatch = /^(\d{1,2}):?(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const naive = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  )
  const first = naive - zoneOffsetMs(naive, timeZone)
  return naive - zoneOffsetMs(first, timeZone)
}

/** The calendar date `utcMs` falls on in `timeZone`, as ISO 'YYYY-MM-DD'. */
export function exchangeDateOf(utcMs: number, timeZone: string): string {
  // 'en-CA' formats as YYYY-MM-DD, which is the wire format the calendar
  // endpoint wants — no manual zero-padding, no host-locale surprise.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utcMs))
}

/** `days` before or after `utcMs`, as an exchange-local ISO date. */
export function shiftExchangeDate(
  utcMs: number,
  days: number,
  timeZone: string,
): string {
  return exchangeDateOf(utcMs + days * 86_400_000, timeZone)
}

// ── Parsers ───────────────────────────────────────────────────────────

/** Shape of GET /v2/clock. */
export function parseAlpacaClock(raw: unknown): MarketSessionClock | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const nowMs = parseTs(d['timestamp'])
  if (nowMs === null) return null
  return {
    nowMs,
    isOpen: d['is_open'] === true,
    nextOpenMs: parseTs(d['next_open']),
    nextCloseMs: parseTs(d['next_close']),
    timeZone: ALPACA_SESSION_TZ,
  }
}

/**
 * One entry of GET /v2/calendar.
 *
 * `open`/`close` are the regular auction; `session_open`/`session_close` are
 * the extended-hours bounds and are only present on newer accounts, so a day
 * without them carries no pre/post window rather than an invented 04:00.
 */
export function parseAlpacaCalendarDay(raw: unknown): MarketSessionDay | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const date = typeof d['date'] === 'string' ? d['date'] : null
  if (!date) return null

  const openMs = wallClockToMs(date, String(d['open'] ?? ''), ALPACA_SESSION_TZ)
  const closeMs = wallClockToMs(
    date,
    String(d['close'] ?? ''),
    ALPACA_SESSION_TZ,
  )
  if (openMs === null || closeMs === null) return null

  const preOpenMs = wallClockToMs(
    date,
    String(d['session_open'] ?? ''),
    ALPACA_SESSION_TZ,
  )
  const postCloseMs = wallClockToMs(
    date,
    String(d['session_close'] ?? ''),
    ALPACA_SESSION_TZ,
  )

  return {
    date,
    openMs,
    closeMs,
    // A venue that reports an extended window INSIDE the regular one is
    // reporting nonsense; drop it rather than draw a day bar that folds back
    // on itself.
    ...(preOpenMs !== null && preOpenMs < openMs ? { preOpenMs } : {}),
    ...(postCloseMs !== null && postCloseMs > closeMs ? { postCloseMs } : {}),
  }
}

// ── Requests ──────────────────────────────────────────────────────────

export async function fetchAlpacaClock(
  credentials: AlpacaCredentials,
  mode: 'paper' | 'live',
): Promise<MarketSessionClock> {
  const urls = resolveAlpacaTradingUrls(mode === 'paper')
  const resp = await fetch(`${urls.restBase}/v2/clock`, {
    headers: authHeaders(credentials),
  })
  if (!resp.ok) {
    throw new Error(`Alpaca clock error ${resp.status}`)
  }
  const clock = parseAlpacaClock(await resp.json())
  if (!clock) throw new Error('Alpaca clock: unreadable response')
  return clock
}

/**
 * Trading days in `[start, end]`, inclusive, as ISO dates in exchange time.
 *
 * The window is the caller's: a pane wants yesterday through next week so it
 * can name the next open after a Friday close, and asking for a year of days
 * to render one bar is a request nobody has to pay for.
 */
export async function fetchAlpacaCalendar(
  credentials: AlpacaCredentials,
  mode: 'paper' | 'live',
  start: string,
  end: string,
): Promise<MarketSessionCalendar> {
  const urls = resolveAlpacaTradingUrls(mode === 'paper')
  const url =
    `${urls.restBase}/v2/calendar` +
    `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`

  const resp = await fetch(url, { headers: authHeaders(credentials) })
  if (!resp.ok) {
    throw new Error(`Alpaca calendar error ${resp.status}`)
  }

  const json = (await resp.json()) as Array<unknown>
  const days: Array<MarketSessionDay> = []
  for (const row of Array.isArray(json) ? json : []) {
    const day = parseAlpacaCalendarDay(row)
    if (day) days.push(day)
  }
  days.sort((a, b) => a.openMs - b.openMs)
  return { timeZone: ALPACA_SESSION_TZ, days }
}
