// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What every prediction surface pins before it navigates.
 *
 * The desktop pane and the phone both had this literal inline, fifteen lines
 * each, and they had already drifted once: a field added for one surface is a
 * field the other silently stops carrying, and the symptom lands far away — a
 * watchlist row that reads as a routing key on one device and as a question on
 * the other. One builder per pin, every caller.
 *
 * Two pins, matching the directory's two maps. The EVENT pin is the one a
 * navigation needs, because the event is the pair. The outcome pin rides along
 * so a fill, a position row or the risk guard can still name the leg it is
 * holding once it has left the event behind.
 */
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

import type {
  PredictionEventEntry,
  PredictionOutcomeEntry,
} from '@/stores/prediction-directory-store'
import { predictionOutcomeName } from '@/lib/predictions/event-labels'
import { byProbability, runnerPrice, runnersOf } from '@/lib/predictions/race'

/**
 * The event pin: what the pair key means, plus the favourite.
 *
 * The favourite is recomputed on every pin rather than merged, because it is a
 * reading of the event at a moment and a stale one beside a fresh title is
 * worse than no leader at all.
 */
export function predictionEventEntryFor(
  venue: string,
  event: PredictionEventSummary,
): PredictionEventEntry {
  const runners = runnersOf(event)
  const [leader] = byProbability(runners)
  const price = leader ? runnerPrice(leader) : null

  return {
    market: venue,
    eventId: event.id,
    title: event.title,
    ...(event.category ? { category: event.category } : {}),
    ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
    ...(event.endMs !== undefined ? { endMs: event.endMs } : {}),
    outcomeCount: runners.length,
    ...(leader
      ? {
          leader: {
            pairKey: leader.yes.pairKey,
            label: leader.label,
            ...(price !== null ? { price } : {}),
          },
        }
      : {}),
  }
}

export function predictionEntryFor(
  venue: string,
  event: PredictionEventSummary,
  market: PredictionMarketSummary,
  outcomeLabel: string,
): PredictionOutcomeEntry {
  return {
    market: venue,
    predictionMarketId: market.id,
    outcome: outcomeLabel,
    // The same `<question> - <outcome>` join the connectors build `name` from,
    // but with the venue's opaque market id resolved to something readable
    // first.
    name: predictionOutcomeName(
      market.title,
      event.title,
      outcomeLabel,
      event.markets.length,
    ),
    ...(market.shortTitle ? { shortTitle: market.shortTitle } : {}),
    eventTitle: event.title,
    eventId: event.id,
    ...(market.endMs !== undefined ? { endMs: market.endMs } : {}),
  }
}
