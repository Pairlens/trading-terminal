// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The reporting schedule, shaped for a date-grouped list.
 *
 * The calendar's whole reading is "which day", so the rows are grouped by
 * report date and never sorted by anything else: a flat table sorted by symbol
 * makes a reader scan for tomorrow. Inside a day the order is the server's,
 * which is alphabetical by symbol, so a group does not reshuffle when the
 * snapshot refreshes.
 *
 * There is no before-the-bell grouping, and that is a data fact rather than a
 * design choice: the provider publishes a date and no time, so a BMO/AMC
 * column could only be a guess about the one detail a trader would act on.
 */
import type { EarningsCalendarEntry } from '@pairlens/shared/instrument-types'

export type EarningsDayGroup = {
  /** ISO 'YYYY-MM-DD' in the exchange's own calendar. */
  date: string
  entries: Array<EarningsCalendarEntry>
}

/** Group by report date, days ascending, entry order preserved inside a day. */
export function groupEarningsByDate(
  entries: Array<EarningsCalendarEntry>,
): Array<EarningsDayGroup> {
  const groups = new Map<string, Array<EarningsCalendarEntry>>()
  for (const entry of entries) {
    const bucket = groups.get(entry.reportDate)
    if (bucket) bucket.push(entry)
    else groups.set(entry.reportDate, [entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, group]) => ({ date, entries: group }))
}

/**
 * Which day a group is, relative to now, so the header can name it.
 *
 * Returns a kind rather than a string: the label has to be translated, and a
 * pure function that reached for i18n would be untestable for the one thing
 * worth testing, which is the boundary between today and tomorrow.
 */
export type EarningsDayKind = 'today' | 'tomorrow' | 'past' | 'later'

export function earningsDayKind(
  isoDate: string,
  nowMs = Date.now(),
): EarningsDayKind {
  const today = new Date(nowMs).toISOString().slice(0, 10)
  if (isoDate === today) return 'today'
  if (isoDate < today) return 'past'
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)
  return isoDate === tomorrow ? 'tomorrow' : 'later'
}
