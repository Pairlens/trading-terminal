// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which events the phone shows, out of everything the venues returned.
 *
 * The fan-out hands back one bucket per venue, each already sorted the way
 * that venue sorts its own board. Discover has room for five rows and the
 * events screen has room for all of them, so the only real decisions are what
 * to drop and what order to merge in — both pure, both here, so they can be
 * tested without a plugin host.
 *
 * Merging is round-robin rather than "sort everything by volume". Volume is
 * denominated per venue and the two venues are not the same size: a global
 * sort by it hands the whole strip to whichever venue happens to quote in the
 * larger unit, and the second venue then never appears at all. One row each,
 * in turn, keeps both visible and still leads with each venue's own busiest
 * event.
 *
 * A venue that refused (`error`) or that a browser cannot reach at all
 * (`desktopOnly`) carries no events, so it contributes nothing here. Naming it
 * is the caller's job — see `desktopOnlyLabels`.
 */
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'
import type { PredictionVenueResult } from '@/hooks/use-prediction-events'

export type PredictionEventRow = {
  /** Venue market id the event came from: 'polymarket', 'kalshi', … */
  market: string
  /** Venue display name, for the card's venue line. */
  label: string
  event: PredictionEventSummary
}

/** When an event resolves, taking the first market's date when it has none. */
export function eventEndMs(event: PredictionEventSummary): number | undefined {
  return event.endMs ?? event.markets[0]?.endMs
}

/** An event nobody can act on is not worth a row. */
function isShowable(event: PredictionEventSummary, now: number): boolean {
  const hasOutcome = event.markets.some((m) => m.outcomes.length > 0)
  if (!hasOutcome) return false
  const end = eventEndMs(event)
  return end === undefined || end > now
}

/** Busiest first, then whichever resolves soonest, then by title for stability. */
function byInterest(
  a: PredictionEventSummary,
  b: PredictionEventSummary,
): number {
  const volume = (b.volume ?? 0) - (a.volume ?? 0)
  if (volume !== 0) return volume
  const endA = eventEndMs(a) ?? Number.MAX_SAFE_INTEGER
  const endB = eventEndMs(b) ?? Number.MAX_SAFE_INTEGER
  if (endA !== endB) return endA - endB
  return a.title.localeCompare(b.title)
}

/**
 * The merged board: every venue's showable events, interleaved one at a time
 * and capped. `limit` of 0 or less means "no cap" — the events screen wants
 * everything, in the same order the Discover strip previews.
 */
export function mergePredictionEvents(
  results: Array<PredictionVenueResult> | undefined,
  limit = 0,
  now: number = Date.now(),
): Array<PredictionEventRow> {
  const buckets = (results ?? [])
    .map((venue) => ({
      market: venue.market,
      label: venue.label,
      events: venue.events.filter((e) => isShowable(e, now)).sort(byInterest),
    }))
    .filter((bucket) => bucket.events.length > 0)

  const rows: Array<PredictionEventRow> = []
  const depth = Math.max(0, ...buckets.map((bucket) => bucket.events.length))
  for (let index = 0; index < depth; index += 1) {
    for (const bucket of buckets) {
      const event = bucket.events[index]
      if (!event) continue
      rows.push({ market: bucket.market, label: bucket.label, event })
      if (limit > 0 && rows.length >= limit) return rows
    }
  }
  return rows
}

/**
 * Whether the cards should name their venue.
 *
 * The question is "did more than one venue actually contribute a row", not
 * "is more than one venue installed". Both connectors ship enabled, but in a
 * browser Kalshi cannot answer, so keying off the installed count stamped
 * POLYMARKET on every card of a single-venue list — a column of identical
 * labels, which is noise rather than information (verified on device).
 */
export function shouldNameVenues(rows: Array<PredictionEventRow>): boolean {
  return new Set(rows.map((row) => row.market)).size > 1
}

/** Venues this build cannot reach at all, by display name. */
export function desktopOnlyLabels(
  results: Array<PredictionVenueResult> | undefined,
): Array<string> {
  return (results ?? []).filter((v) => v.desktopOnly).map((v) => v.label)
}
