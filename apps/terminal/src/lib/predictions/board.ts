// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning per-venue event results into the rows the discovery board draws.
 *
 * Two venues answer separately and the board is one grid, so the flatten has
 * to keep the venue with each event — an event card without its venue is a
 * card whose click cannot be routed. Everything else here is ordering, and the
 * orderings are deliberately few: every sort offered has to be derivable from
 * what the wire actually carries.
 *
 * The orderings live here rather than in the panes because two surfaces ask for
 * them — the board's card grid and the events browser's venue-grouped list —
 * and a second copy of "sink what cannot be ranked" is a second chance to get
 * it wrong.
 */
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'

import type { PredictionVenueResult } from '@/hooks/use-prediction-events'
import { eventTopMove } from '@/lib/predictions/movers'
import { runnersOf, yesOutcomeOf } from '@/lib/predictions/race'

export type BoardEvent = {
  /** Stable across refetches: venue + event id. */
  key: string
  market: string
  venueLabel: string
  event: PredictionEventSummary
}

/** The orderings the board can honestly offer. */
export type BoardSort =
  | 'trending'
  | 'new'
  | 'endingSoon'
  | 'volume'
  | 'biggestMove'

export const BOARD_SORTS: Array<BoardSort> = [
  'trending',
  'new',
  'endingSoon',
  'volume',
  'biggestMove',
]

/**
 * What the events browser offers.
 *
 * Same union, one option short: 'biggestMove' ranks by a reading the browser
 * does not show anywhere on its cards, and a sort whose result the surface
 * cannot explain reads as a shuffle. 'trending' is the same behaviour in both
 * places (the venue's own order, untouched) and is only LABELLED differently —
 * the board calls it trending because that is what the venues rank by, the
 * browser calls it the venue's order because it lists per venue.
 */
export type EventListSort = Exclude<BoardSort, 'biggestMove'>

export const EVENT_LIST_SORTS: Array<EventListSort> = [
  'trending',
  'new',
  'endingSoon',
  'volume',
]

/**
 * Every event that survived the filters, venue attached.
 *
 * The text match runs over the event heading AND its markets' questions,
 * because on a scalar ladder the heading is "CPI in August" and the thing the
 * user typed is "3.0%".
 */
export function flattenBoardEvents(
  results: Array<PredictionVenueResult> | undefined,
  { category, query }: { category: string | null; query: string },
): Array<BoardEvent> {
  const needle = query.trim().toLowerCase()
  const rows: Array<BoardEvent> = []

  for (const venue of results ?? []) {
    if (venue.error || venue.desktopOnly) continue
    for (const event of venue.events) {
      if (category && event.category !== category) continue
      if (needle && !matches(event, needle)) continue
      rows.push({
        key: `${venue.market}:${event.id}`,
        market: venue.market,
        venueLabel: venue.label,
        event,
      })
    }
  }
  return rows
}

function matches(event: PredictionEventSummary, needle: string): boolean {
  if (event.title.toLowerCase().includes(needle)) return true
  if (event.category?.toLowerCase().includes(needle)) return true
  return event.markets.some(
    (m) =>
      m.title.toLowerCase().includes(needle) ||
      (m.shortTitle?.toLowerCase().includes(needle) ?? false),
  )
}

/**
 * Order the board.
 *
 * 'trending' is the venue's OWN order, untouched: both venues return events by
 * descending activity, and re-ranking them here would only disagree with the
 * venue's own board while claiming the same word.
 *
 * Every other sort pushes rows with nothing to sort by to the end rather than
 * treating a missing value as zero — an event with no published volume is not
 * the least-traded event, and an event whose venue published no listing time is
 * not the oldest question on the board.
 */
export function sortBoardEvents(
  rows: Array<BoardEvent>,
  sort: BoardSort,
): Array<BoardEvent> {
  return orderEvents(rows, sort, (row) => row.event)
}

/**
 * The same orderings over a bare event list — what the events browser sorts,
 * one venue block at a time.
 */
export function sortEventSummaries(
  events: Array<PredictionEventSummary>,
  sort: BoardSort,
): Array<PredictionEventSummary> {
  return orderEvents(events, sort, (event) => event)
}

/**
 * One ordering implementation, two row shapes.
 *
 * The value is read ONCE per row rather than inside the comparator: `eventVolume`
 * and `createdOf` walk every market, and a comparator that recomputes them runs
 * that walk O(n log n) times on a board of several hundred cards.
 *
 * `index` is the tie-break everywhere, which is what keeps the order stable
 * across the 60-second refetch: two events with the same volume, or with no
 * value at all, hold the position the venue gave them instead of swapping
 * places under the cursor.
 */
function orderEvents<TRow>(
  rows: Array<TRow>,
  sort: BoardSort,
  eventOf: (row: TRow) => PredictionEventSummary,
): Array<TRow> {
  if (sort === 'trending') return rows

  // Ending soon is the one ascending ordering: the smallest clock is the most
  // urgent. Everything else ranks "most" first.
  const ascending = sort === 'endingSoon'

  return rows
    .map((row, index) => ({ row, index, value: sortValue(eventOf(row), sort) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index
      if (a.value === null) return 1
      if (b.value === null) return -1
      const delta = ascending ? a.value - b.value : b.value - a.value
      return delta || a.index - b.index
    })
    .map((scored) => scored.row)
}

/** What one ordering ranks an event by, or null when the event cannot be ranked. */
function sortValue(
  event: PredictionEventSummary,
  sort: BoardSort,
): number | null {
  switch (sort) {
    case 'endingSoon':
      return endOf(event)
    case 'volume':
      return eventVolume(event)
    case 'new':
      return createdOf(event)
    case 'biggestMove': {
      const move = eventTopMove(event)
      return move > 0 ? move : null
    }
    default:
      // 'trending' never reaches here — see the early return above.
      return null
  }
}

/** The event's own close, else the soonest close among its markets. */
export function endOf(event: PredictionEventSummary): number | null {
  if (typeof event.endMs === 'number' && Number.isFinite(event.endMs)) {
    return event.endMs
  }
  let soonest: number | null = null
  for (const market of event.markets) {
    const end = market.endMs
    if (typeof end !== 'number' || !Number.isFinite(end)) continue
    if (soonest === null || end < soonest) soonest = end
  }
  return soonest
}

/**
 * When this event last gained a market, or null when no market says.
 *
 * The MAX rather than the min, and that is the whole design of the "New" sort.
 * A prediction event is not born once: "Fed decision in December" opens with
 * three strikes and grows to a dozen as the range moves, and Polymarket adds a
 * candidate to a nomination race whenever someone declares. The question the
 * board answers is "what is new to trade", so the newest market in the event is
 * the reading — the event's own birthday would bury a race that gained four
 * runners this morning under a binary that opened yesterday and never changed.
 *
 * Derived here and not carried on the wire on purpose: the venues publish this
 * per market, and an event-level field would be this same max computed by
 * whichever connector got there first.
 */
export function createdOf(event: PredictionEventSummary): number | null {
  let newest: number | null = null
  for (const market of event.markets) {
    const created = market.createdMs
    if (typeof created !== 'number' || !Number.isFinite(created)) continue
    if (created <= 0) continue
    if (newest === null || created > newest) newest = created
  }
  return newest
}

/** The event's own volume, else the sum of its markets'. */
export function eventVolume(event: PredictionEventSummary): number | null {
  if (typeof event.volume === 'number' && event.volume > 0) return event.volume
  let sum = 0
  let seen = false
  for (const market of event.markets) {
    if (typeof market.volume === 'number' && Number.isFinite(market.volume)) {
      sum += market.volume
      seen = true
    }
  }
  return seen ? sum : null
}

export type ResolvingRow = {
  key: string
  market: string
  venueLabel: string
  event: PredictionEventSummary
  /** The market whose close is nearest — what the row's countdown means. */
  marketSummary: PredictionEventSummary['markets'][number]
  outcome: PredictionEventSummary['markets'][number]['outcomes'][number] | null
  title: string
  /** Yes probability, collateral units, or null when unquoted. */
  price: number | null
  endMs: number
}

/**
 * The events closest to settling, one row each.
 *
 * One row per EVENT rather than per market, because a Kalshi scalar ladder is
 * a dozen markets that all close at the same instant and would otherwise fill
 * the pane with one question repeated. The market shown is the one whose clock
 * runs out first, which is the one the countdown is about.
 *
 * Already-closed events are dropped rather than shown at "closed": this pane
 * answers "what should I look at before it settles", and a settled contract is
 * not that.
 */
export function collectResolvingSoon(
  results: Array<PredictionVenueResult> | undefined,
  {
    category,
    limit,
    now = Date.now(),
  }: { category: string | null; limit: number; now?: number },
): Array<ResolvingRow> {
  const rows: Array<ResolvingRow> = []

  for (const venue of results ?? []) {
    if (venue.error || venue.desktopOnly) continue
    for (const event of venue.events) {
      if (category && event.category !== category) continue

      let soonest: ResolvingRow['marketSummary'] | null = null
      for (const market of event.markets) {
        const end = market.endMs ?? event.endMs
        if (typeof end !== 'number' || !Number.isFinite(end)) continue
        if (end <= now) continue
        const bestEnd = soonest?.endMs ?? event.endMs
        if (soonest === null || (bestEnd ?? Infinity) > end) soonest = market
      }
      if (!soonest) continue

      const endMs = soonest.endMs ?? event.endMs
      if (typeof endMs !== 'number') continue
      const outcome = yesOutcomeOf(soonest)
      const price = outcome?.price ?? outcome?.ask ?? null

      rows.push({
        key: `${venue.market}:${event.id}`,
        market: venue.market,
        venueLabel: venue.label,
        event,
        marketSummary: soonest,
        outcome: outcome ?? null,
        // The heading, unless the event is a ladder — then the strike is the
        // fact and the heading is the context.
        title:
          runnersOf(event).length > 2 && soonest.shortTitle?.trim()
            ? `${event.title} · ${soonest.shortTitle.trim()}`
            : event.title,
        price:
          typeof price === 'number' && price > 0 && price <= 1 ? price : null,
        endMs,
      })
    }
  }

  return rows.sort((a, b) => a.endMs - b.endMs).slice(0, limit)
}
