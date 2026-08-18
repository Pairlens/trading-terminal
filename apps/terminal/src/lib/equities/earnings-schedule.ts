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
 * A day then splits into report slots, which it did not always: the header
 * here used to say a slot could only ever be a guess, and that stopped being
 * true when the App Server started serving `reportTime`. It states a slot for
 * reports inside about thirty days from the provider, and past that from the
 * company's own Item 2.02 filing habit. What has NOT changed is what happens
 * without one: those rows group under their own banner and are never folded
 * into whichever slot looks more likely.
 */
import type {
  EarningsCalendarEntry,
  IpoCalendarEntry,
} from '@pairlens/shared/instrument-types'

export type DayGroup<T> = {
  /** ISO 'YYYY-MM-DD' in the exchange's own calendar. */
  date: string
  entries: Array<T>
}

export type EarningsDayGroup = DayGroup<EarningsCalendarEntry>

/** Group by a date field, days ascending, entry order preserved inside a day. */
function groupByDate<T>(
  entries: Array<T>,
  dateOf: (entry: T) => string,
): Array<DayGroup<T>> {
  const groups = new Map<string, Array<T>>()
  for (const entry of entries) {
    const date = dateOf(entry)
    const bucket = groups.get(date)
    if (bucket) bucket.push(entry)
    else groups.set(date, [entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, group]) => ({ date, entries: group }))
}

/** Group by report date, days ascending, entry order preserved inside a day. */
export function groupEarningsByDate(
  entries: Array<EarningsCalendarEntry>,
): Array<EarningsDayGroup> {
  return groupByDate(entries, (entry) => entry.reportDate)
}

/**
 * The same grouping for the listings pipeline. A listing date reads exactly
 * like a report date to a trader ("which day"), so the two views share a shape
 * rather than inventing a second one.
 */
export function groupIposByDate(
  entries: Array<IpoCalendarEntry>,
): Array<DayGroup<IpoCalendarEntry>> {
  return groupByDate(entries, (entry) => entry.date)
}

/**
 * The three slots a day splits into, in reading order.
 *
 * Before the bell first, because a day is read forwards: the morning prints
 * land before the afternoon ones, and a reader scanning a day wants the next
 * thing to happen at the top. `unstated` is last and is a real bucket rather
 * than a fold into one of the other two, which is the whole point — the slot is
 * what a trader positions on, and a row we cannot place must not borrow a
 * neighbour's certainty.
 */
export type EarningsSlot = 'bmo' | 'amc' | 'unstated'

const SLOT_ORDER: ReadonlyArray<EarningsSlot> = ['bmo', 'amc', 'unstated']

export type EarningsSlotGroup = {
  slot: EarningsSlot
  entries: Array<EarningsCalendarEntry>
}

/**
 * Split one day's rows into slots, empty slots omitted, entry order preserved.
 *
 * A day where nobody stated a slot comes back as a single `unstated` group,
 * which is what lets the pane skip the banner entirely rather than heading a
 * list with a caveat about every row in it.
 */
export function groupEarningsBySlot(
  entries: ReadonlyArray<EarningsCalendarEntry>,
): Array<EarningsSlotGroup> {
  const buckets = new Map<EarningsSlot, Array<EarningsCalendarEntry>>()
  for (const entry of entries) {
    const slot: EarningsSlot =
      entry.reportTime === 'bmo' || entry.reportTime === 'amc'
        ? entry.reportTime
        : 'unstated'
    const bucket = buckets.get(slot)
    if (bucket) bucket.push(entry)
    else buckets.set(slot, [entry])
  }
  return SLOT_ORDER.filter((slot) => buckets.has(slot)).map((slot) => ({
    slot,
    entries: buckets.get(slot) as Array<EarningsCalendarEntry>,
  }))
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
