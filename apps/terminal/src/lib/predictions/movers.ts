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
 *
 * Two more rules came out of reading the shipped rail on a live board. Rows
 * were titled from the MARKET, so a Polymarket race contributed "Harry Kane"
 * and a scalar ladder contributed "December 31" — true strings, and neither
 * one names a question. And a settled-but-listed contract publishes a move
 * into 100¢, which filled the top of the rail with "100→100" rows that no
 * longer trade. So a row now leads with its event, and anything pegged at
 * either end of the range is not a mover.
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

/**
 * How close to a settled price counts as pegged, in collateral units.
 *
 * A contract at 99.6¢ is not a market with an opinion, it is a market waiting
 * for the paperwork — and both venues keep publishing a 24h move on it.
 */
const PEGGED_MARGIN = 0.005

/** The smallest move worth a row: one probability point. */
const MIN_MOVE = 0.01

export type OddsMoverRow = {
  /** Stable across refetches: venue + outcome, which is the identity. */
  key: string
  market: string
  venueLabel: string
  event: PredictionEventSummary
  marketSummary: PredictionMarketSummary
  outcome: PredictionOutcomeSummary
  /** What the row calls itself: the EVENT, which is the question being asked. */
  title: string
  /**
   * The runner inside that event, when naming it adds something. Null on a
   * binary question, where the event title already is the market.
   */
  qualifier: string | null
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
        // Under a point is noise on a probability, and the rail has twenty
        // rows to spend on questions that actually changed their mind.
        if (Math.abs(change) < MIN_MOVE) continue
        const price = outcome.price ?? outcome.ask
        if (typeof price !== 'number' || !Number.isFinite(price)) continue
        if (price <= 0 || price > 1) continue
        if (price >= 1 - PEGGED_MARGIN || price <= PEGGED_MARGIN) continue

        perEvent.push({
          key: `${venue.market}:${outcome.pairKey}`,
          market: venue.market,
          venueLabel: venue.label,
          event,
          marketSummary,
          outcome,
          title: event.title,
          qualifier: qualifierOf(event, marketSummary),
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

/**
 * Which runner moved, when the event has more than one and does not already
 * say so in its own heading.
 *
 * "Democratic Presidential Nominee 2028 · Gavin Newsom" is two facts a reader
 * needs; "Fed decision in September · Fed decision in September" is one fact
 * twice, which is what a naive concatenation produces on the binary events
 * that make up most of a board.
 */
function qualifierOf(
  event: PredictionEventSummary,
  market: PredictionMarketSummary,
): string | null {
  if (event.markets.length < 2) return null
  const short = market.shortTitle?.trim()
  if (!short) return null
  if (event.title.toLowerCase().includes(short.toLowerCase())) return null
  return short
}

/**
 * The move, as the two probabilities it ran between: `64→78`.
 *
 * Points rather than cents, because this rail reads the market's opinion
 * rather than quoting a price — the cents belong on the buttons that trade.
 * Both endpoints take the same precision, and the tenth appears only on a move
 * small enough to vanish without it: `18.5→16.4` says something, `18→16` says
 * a different and rounder thing, and `64.0→78.0` is just noise in a 44px slot.
 */
export function formatMovePoints(previous: number, price: number): string {
  const digits = Math.abs(price - previous) * 100 < 5 ? 1 : 0
  return `${(previous * 100).toFixed(digits)}→${(price * 100).toFixed(digits)}`
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
