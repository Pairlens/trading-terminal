// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The macro calendar, shaped for a date-grouped list.
 *
 * Every function here is pure and takes the clock as an argument, because the
 * three things that can go wrong in a release calendar are all about time and
 * none of them are visible in a screenshot: the wrong day named "today", a
 * release time an hour out across a DST boundary, and a "next up" marker stuck
 * on something that already printed.
 *
 * "Today" is the server's `start`, not the reader's clock. Every entry is dated
 * in US Eastern because that is the calendar the agencies publish against, and
 * the server already cut the window at Eastern midnight. A pane that recomputed
 * today from the browser would disagree with its own first row for the hours
 * when the two calendars differ, which is most of the evening in Asia.
 *
 * Times render in Eastern for the same reason. '08:30 ET' is how CPI is quoted
 * everywhere, so the row says that and the reader's own clock rides along in
 * the tooltip rather than replacing it.
 */
import type { EconomicCalendarEntry } from '@pairlens/shared/instrument-types'

import { formatExchangeTime } from '@/lib/equities/session-labels'

/** The zone every US federal release is scheduled in. */
export const ECONOMIC_ZONE = 'America/New_York'

export type EconomicDayGroup = {
  /** ISO 'YYYY-MM-DD', Eastern. */
  date: string
  entries: Array<EconomicCalendarEntry>
}

/**
 * Group by release date, days ascending, order preserved inside a day.
 *
 * The server already sorts by date, then clock, then title, with the day-level
 * entries last, so a group must not re-sort: doing it here would put the 08:30
 * prints and the "all day" rows in a different order to every other client.
 */
export function groupEconomicByDate(
  entries: ReadonlyArray<EconomicCalendarEntry>,
): Array<EconomicDayGroup> {
  const groups = new Map<string, Array<EconomicCalendarEntry>>()
  for (const entry of entries) {
    const bucket = groups.get(entry.date)
    if (bucket) bucket.push(entry)
    else groups.set(entry.date, [entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, group]) => ({ date, entries: group }))
}

export type EconomicDayKind = 'today' | 'tomorrow' | 'later'

/**
 * Which day a group is, measured against the window the server cut.
 *
 * Returns a kind rather than a label: the words are translated, and the only
 * thing worth testing is the boundary.
 */
export function economicDayKind(
  isoDate: string,
  windowStart: string,
): EconomicDayKind {
  if (isoDate === windowStart) return 'today'
  if (isoDate === nextIsoDay(windowStart)) return 'tomorrow'
  return 'later'
}

function nextIsoDay(isoDate: string): string {
  const at = Date.parse(`${isoDate}T00:00:00Z`)
  if (!Number.isFinite(at)) return isoDate
  return new Date(at + 86_400_000).toISOString().slice(0, 10)
}

/**
 * The id of the next release that has not happened yet, or null.
 *
 * Only entries with a stated instant can be next: a day-level row (FOMC
 * minutes, a Census indicator) has no moment to count down to, and marking one
 * "next up" would put a highlight on a row that may already have printed.
 */
export function nextEconomicRelease(
  entries: ReadonlyArray<EconomicCalendarEntry>,
  nowMs: number,
): string | null {
  let best: EconomicCalendarEntry | null = null
  for (const entry of entries) {
    if (entry.releaseMs === null || entry.releaseMs <= nowMs) continue
    if (!best || entry.releaseMs < (best.releaseMs as number)) best = entry
  }
  return best?.id ?? null
}

/** Only the entries at or above a tier. `low` keeps everything. */
export function filterByImportance(
  entries: ReadonlyArray<EconomicCalendarEntry>,
  minimum: 'high' | 'medium' | 'low',
): Array<EconomicCalendarEntry> {
  if (minimum === 'low') return [...entries]
  const rank = { high: 3, medium: 2, low: 1 } as const
  const floor = rank[minimum]
  return entries.filter((entry) => rank[entry.importance] >= floor)
}

/** '08:30' in New York, whatever the reader's own clock says. */
export function formatReleaseClock(releaseMs: number): string {
  return formatExchangeTime(releaseMs, ECONOMIC_ZONE)
}

/**
 * A day heading, in the reader's language but the calendar's own date.
 *
 * The date is formatted in UTC on purpose. It is a calendar date rather than
 * an instant, and rendering midnight UTC in a local zone west of it prints the
 * day before: 'Aug 18' becomes 'Aug 17' for every reader in the Americas.
 */
export function formatCalendarDay(isoDate: string, locale: string): string {
  const at = Date.parse(`${isoDate}T00:00:00Z`)
  if (!Number.isFinite(at)) return isoDate
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(at))
}
