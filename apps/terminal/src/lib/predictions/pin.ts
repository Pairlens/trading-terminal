// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What every events surface pins before it navigates.
 *
 * The desktop pane and the phone both had this literal inline, fifteen lines
 * each, and they had already drifted once: a field added for one surface is a
 * field the other silently stops carrying, and the symptom lands far away — a
 * watchlist row that reads as a routing key on one device and as a question on
 * the other. One builder, two callers.
 */
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

import type { PredictionDirectoryEntry } from '@/stores/prediction-directory-store'
import { predictionOutcomeName } from '@/lib/predictions/event-labels'

export function predictionEntryFor(
  venue: string,
  event: PredictionEventSummary,
  market: PredictionMarketSummary,
  outcomeLabel: string,
): PredictionDirectoryEntry {
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
