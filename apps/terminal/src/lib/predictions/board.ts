// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning per-venue event results into the rows the discovery board draws.
 *
 * Two venues answer separately and the board is one grid, so the flatten has
 * to keep the venue with each event — an event card without its venue is a
 * card whose click cannot be routed. Everything else here is ordering, and the
 * orderings are deliberately few: every sort the board offers has to be
 * derivable from what the wire actually carries. Neither venue publishes a
 * creation timestamp through `market-data:events`, so there is no "New".
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
export type BoardSort = 'trending' | 'endingSoon' | 'volume' | 'biggestMove'

export const BOARD_SORTS: Array<BoardSort> = [
  'trending',
  'endingSoon',
  'volume',
  'biggestMove',
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
 * the least-traded event.
 */
export function sortBoardEvents(
  rows: Array<BoardEvent>,
  sort: BoardSort,
): Array<BoardEvent> {
  if (sort === 'trending') return rows

  const scored = rows.map((row, index) => ({ row, index }))

  if (sort === 'endingSoon') {
    return scored
      .sort((a, b) => {
        const left = endOf(a.row.event)
        const right = endOf(b.row.event)
        if (left === null && right === null) return a.index - b.index
        if (left === null) return 1
        if (right === null) return -1
        return left - right || a.index - b.index
      })
      .map((s) => s.row)
  }

  const value =
    sort === 'volume'
      ? (row: BoardEvent) => eventVolume(row.event)
      : (row: BoardEvent) => {
          const move = eventTopMove(row.event)
          return move > 0 ? move : null
        }

  return scored
    .sort((a, b) => {
      const left = value(a.row)
      const right = value(b.row)
      if (left === null && right === null) return a.index - b.index
      if (left === null) return 1
      if (right === null) return -1
      return right - left || a.index - b.index
    })
    .map((s) => s.row)
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
