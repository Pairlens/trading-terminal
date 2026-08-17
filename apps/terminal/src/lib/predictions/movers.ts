// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Which questions changed their mind today?"
 *
 * The events index carries a signed 24h move per outcome (see the connector's
 * `derived.ts`), and turning that into a board is three rules, all of which
 * exist because the naive version is unreadable:
 *
 *  1. One row per MARKET, not per outcome. A binary market's two legs are the
 *     same fact twice — "+7" and "−7" on adjacent rows reads as two events.
 *  2. At most two rows per EVENT. A 128-runner race would otherwise own the
 *     whole pane on any day the field reshuffles.
 *  3. Venues that publish no move at all are EXCLUDED and named. A venue whose
 *     rows are all missing would otherwise look like a venue where nothing
 *     happened, which is the one wrong answer a movers board can give.
 */
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'

import type { PredictionVenueResult } from '@/hooks/use-prediction-events'
import { yesOutcomeOf } from '@/lib/predictions/race'

/** Rows one event may contribute, so a race cannot flood the pane. */
const MAX_ROWS_PER_EVENT = 2

export type OddsMoverRow = {
  /** Stable across refetches: venue + outcome, which is the identity. */
  key: string
  market: string
  venueLabel: string
  event: PredictionEventSummary
  marketSummary: PredictionMarketSummary
  outcome: PredictionOutcomeSummary
  /** What the row calls itself: the runner's label, else the question. */
  title: string
  /** Current probability, collateral units. */
  price: number
  /** Where it was 24h ago, derived — never negative, never above 1. */
  previous: number
  /** Signed move in collateral units. */
  change: number
}

export type OddsMoversResult = {
  rows: Array<OddsMoverRow>
  /** Venues that answered but publish no 24h move; named in the footer. */
  venuesWithoutChange: Array<string>
}

export function collectOddsMovers(
  results: Array<PredictionVenueResult> | undefined,
  { category, limit }: { category: string | null; limit: number },
): OddsMoversResult {
  const rows: Array<OddsMoverRow> = []
  const venuesWithoutChange: Array<string> = []

  for (const venue of results ?? []) {
    if (venue.error || venue.desktopOnly) continue
    let venueHasChange = false

    for (const event of venue.events) {
      if (category && event.category !== category) continue
      const perEvent: Array<OddsMoverRow> = []

      for (const marketSummary of event.markets) {
        // The Yes leg is the one the move is stated from; its complement
        // carries the same fact mirrored, which is not a second row.
        const outcome = yesOutcomeOf(marketSummary)
        if (!outcome) continue
        const change = outcome.change24h
        if (typeof change !== 'number' || !Number.isFinite(change)) continue
        venueHasChange = true
        if (change === 0) continue
        const price = outcome.price ?? outcome.ask
        if (typeof price !== 'number' || !Number.isFinite(price)) continue
        if (price <= 0 || price > 1) continue

        perEvent.push({
          key: `${venue.market}:${outcome.pairKey}`,
          market: venue.market,
          venueLabel: venue.label,
          event,
          marketSummary,
          outcome,
          title: marketSummary.shortTitle?.trim() || marketSummary.title,
          price,
          // Clamped: a venue whose stated delta disagrees with its stated
          // price by a hair would otherwise render a bar starting below zero.
          previous: Math.min(1, Math.max(0, price - change)),
          change,
        })
      }

      perEvent.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      rows.push(...perEvent.slice(0, MAX_ROWS_PER_EVENT))
    }

    if (!venueHasChange && venue.events.length > 0) {
      venuesWithoutChange.push(venue.label)
    }
  }

  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  return { rows: rows.slice(0, limit), venuesWithoutChange }
}

/** Biggest absolute 24h move anywhere in an event, for the board's sort chip. */
export function eventTopMove(event: PredictionEventSummary): number {
  let best = 0
  for (const market of event.markets) {
    for (const outcome of market.outcomes) {
      const change = outcome.change24h
      if (typeof change !== 'number' || !Number.isFinite(change)) continue
      best = Math.max(best, Math.abs(change))
    }
  }
  return best
}
