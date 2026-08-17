// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event behind the pair on screen.
 *
 * The route carries one uppercase string and the directory pin says what it
 * names, but neither carries the SIBLINGS — and every pair-route prediction
 * pane is about siblings: the header's overround sums them, the ladder lists
 * them, the basket stakes several at once. So this re-reads the event from
 * `market-data:events`, keyed on the pinned event heading.
 *
 * Scoped to the OWNING venue, unlike the discovery browse which always fans out
 * to every venue. The reason the browse fans out is that its chips are a view
 * over one cache entry; here the question is "what else is inside THIS event on
 * THIS venue", and asking the other venue would pay a desktop-only refusal on
 * every pair switch for an answer that cannot be relevant.
 *
 * Every failure mode is a distinct state rather than an empty object, because
 * the panes say different things about each: an unpinned cold link still has a
 * chart, a venue that needs the desktop app is not an error, and an event the
 * index cannot find still has a question worth printing.
 */
import { useMemo } from 'react'

import {
  usePredictionEvents,
  usePredictionVenues,
} from './use-prediction-events'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'
import type { PredictionRunner } from '@/lib/predictions/race'
import type { PredictionDirectoryEntry } from '@/stores/prediction-directory-store'

import { usePredictionOutcome } from '@/stores/prediction-directory-store'
import { isRaceEvent, runnersOf } from '@/lib/predictions/race'
import { normalizePairKey } from '@/lib/pairs'
import { predictionQuestionOf } from '@/components/pair-picker/pair-picker-data'

/** Events pulled when searching for one specific event by its heading. */
const LOOKUP_LIMIT = 12

export type PredictionEventState =
  | 'loading'
  | 'ready'
  /** No prediction connector for this venue is active. */
  | 'no-venue'
  /** The venue refuses browser origins; the pair may still chart. */
  | 'desktop-only'
  /** The venue answered, but this event is not in what it returned. */
  | 'not-found'
  | 'error'

export type PredictionEventContext = {
  state: PredictionEventState
  /** What the pin says this outcome is, or null on a cold link. */
  entry: PredictionDirectoryEntry | null
  venue: string
  venueLabel: string
  event: PredictionEventSummary | null
  /** The market the active outcome belongs to. */
  market: PredictionMarketSummary | null
  outcome: PredictionOutcomeSummary | null
  runners: Array<PredictionRunner>
  isRace: boolean
  /** The event heading, the question, or the bare key — in that order. */
  title: string
  /** What the venue said went wrong, verbatim. */
  error: string | null
}

export function usePredictionEventContext(
  pairKey: string,
  market: string,
): PredictionEventContext {
  const entry = usePredictionOutcome(pairKey)
  const venues = usePredictionVenues()
  const venue = venues.find((v) => v.market === market) ?? null

  // The heading is the only searchable handle we have: neither venue exposes
  // "fetch event by id" through `market-data:events`, and the pin recorded the
  // heading precisely so this lookup would not need one.
  const query = (entry?.eventTitle ?? '').trim()

  const { data, isLoading, error } = usePredictionEvents({
    venues: venue ? [venue] : [],
    query,
    category: null,
    limit: LOOKUP_LIMIT,
  })

  return useMemo(() => {
    const label = venue?.label ?? market.toUpperCase()
    const title = entry
      ? entry.eventTitle?.trim() || predictionQuestionOf(entry)
      : pairKey

    const base = {
      entry,
      venue: market,
      venueLabel: label,
      event: null,
      market: null,
      outcome: null,
      runners: [] as Array<PredictionRunner>,
      isRace: false,
      title,
      error: null,
    }

    if (!venue) return { ...base, state: 'no-venue' as const }

    const result = data?.[0]
    if (isLoading && !result) return { ...base, state: 'loading' as const }
    if (result?.desktopOnly) return { ...base, state: 'desktop-only' as const }
    if (result?.error) {
      return { ...base, state: 'error' as const, error: result.error }
    }
    if (error) {
      return {
        ...base,
        state: 'error' as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    const found = findEvent(result?.events ?? [], entry, pairKey)
    if (!found) return { ...base, state: 'not-found' as const }

    const runners = runnersOf(found.event)
    return {
      ...base,
      state: 'ready' as const,
      event: found.event,
      market: found.market,
      outcome: found.outcome,
      runners,
      isRace: isRaceEvent(found.event),
      title: found.event.title || title,
    }
  }, [venue, market, entry, pairKey, data, isLoading, error])
}

type EventMatch = {
  event: PredictionEventSummary
  market: PredictionMarketSummary | null
  outcome: PredictionOutcomeSummary | null
}

/**
 * The event this pair belongs to, matched by the pin's event id first and by
 * the pair key itself second.
 *
 * The pair-key scan is not a fallback for tidiness: a pin written before the
 * event id existed, or a venue that renamed an event between the pin and the
 * lookup, still resolves because the outcome key is what the connector routes
 * on and it cannot drift.
 */
function findEvent(
  events: Array<PredictionEventSummary>,
  entry: PredictionDirectoryEntry | null,
  pairKey: string,
): EventMatch | null {
  const key = normalizePairKey(pairKey)

  for (const event of events) {
    for (const market of event.markets) {
      for (const outcome of market.outcomes) {
        if (normalizePairKey(outcome.pairKey) === key) {
          return { event, market, outcome }
        }
      }
    }
  }

  if (entry?.eventId) {
    const event = events.find((e) => e.id === entry.eventId)
    if (event) {
      const market =
        event.markets.find((m) => m.id === entry.predictionMarketId) ?? null
      return { event, market, outcome: null }
    }
  }

  return null
}
