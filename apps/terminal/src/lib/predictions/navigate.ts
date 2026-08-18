// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Opening a question, and taking a side on it.
 *
 * Two different acts, and the terminal used to conflate them. Every prediction
 * surface navigated to an OUTCOME, so "look at this event" was spelled the
 * same way as "trade Yes on this event" and there was no way to do the first
 * without doing the second. A user who wanted to see what the field was priced
 * at had to commit to one runner before the terminal would show them anything.
 *
 * Now:
 *
 *  - `openEvent` goes to the question. It is what a card, a search hit and a
 *    watchlist row do, and it lands on the whole field with the favourite
 *    already loaded in the ticket.
 *  - `select` takes a side. Inside the event already on screen it is not a
 *    navigation at all, just a change of which answer the book, the tape and
 *    the ticket are addressing. From somewhere else it opens the event and
 *    arrives on that leg.
 *  - `pin` records an answer without going anywhere, for a basket leg.
 *
 * Pin, THEN navigate, in all three. `/prediction/$venue/$id` carries one
 * string, and nothing downstream can re-derive which question it named until
 * the venue answers — so a navigation that ran first would paint the routing
 * key where the question goes for as long as the fetch takes.
 */
import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'

import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

import { track } from '@/lib/analytics-events'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { normalizePairKey } from '@/lib/pairs'
import { byProbability, runnersOf } from '@/lib/predictions/race'
import { usePredictionDesk } from '@/lib/predictions/desk-context'
import {
  predictionEntryFor,
  predictionEventEntryFor,
} from '@/lib/predictions/pin'
import {
  registerPredictionEvent,
  registerPredictionOutcome,
} from '@/stores/prediction-directory-store'

export type OutcomeSelection = {
  /** Venue market id the outcome trades on. */
  venue: string
  event: PredictionEventSummary
  market: PredictionMarketSummary
  /** The outcome key — what a subscription and an order address. */
  pairKey: string
  /** The outcome label as the venue names it. */
  label: string
  /** Where the click came from. Analytics only; never changes behaviour. */
  surface?: PredictionSelectSurface
}

/** The controls a user can pick an answer from. */
export type PredictionSelectSurface = 'header' | 'ladder' | 'ticket' | 'board'

export type EventSelection = {
  venue: string
  event: PredictionEventSummary
}

export type PredictionSelect = {
  /** Record an answer without leaving the route — for a basket leg. */
  pin: (selection: OutcomeSelection) => void
  /** Open the question: the whole field, favourite loaded. */
  openEvent: (selection: EventSelection) => void
  /** Take a side: select in place when the event is already open. */
  select: (selection: OutcomeSelection) => void
}

export function usePredictionSelect(): PredictionSelect {
  const navigate = useNavigate()
  const desk = usePredictionDesk()
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const pinEvent = useCallback(
    ({ venue, event }: EventSelection) => {
      registerPredictionEvent(event.id, predictionEventEntryFor(venue, event))
      setAssetClassMap((prev) =>
        prev[event.id] === 'prediction'
          ? prev
          : { ...prev, [event.id]: 'prediction' },
      )
    },
    [setAssetClassMap],
  )

  const pin = useCallback(
    ({ venue, event, market, pairKey, label }: OutcomeSelection) => {
      pinEvent({ venue, event })
      registerPredictionOutcome(
        pairKey,
        predictionEntryFor(venue, event, market, label),
      )
    },
    [pinEvent],
  )

  const openEvent = useCallback(
    (selection: EventSelection) => {
      pinEvent(selection)
      // The venue rides in the address: the route can otherwise only re-home
      // the key onto "the first venue that serves predictions", which is a
      // coin flip with both installed.
      void navigate({
        to: '/$cls/$market/$id',
        params: {
          cls: 'prediction',
          market: selection.venue,
          id: selection.event.id,
        },
        search: {},
      })
    },
    [navigate, pinEvent],
  )

  const select = useCallback(
    (selection: OutcomeSelection) => {
      pin(selection)
      track('prediction_outcome_selected', {
        venue: selection.venue,
        surface: selection.surface ?? 'board',
        ...rankOf(selection),
      })
      // Already looking at this question: this is a selection, not a trip.
      // Nothing unmounts, the chart keeps its history, and the back button
      // still means "the event I was on before this one".
      if (
        desk &&
        desk.venue === selection.venue &&
        normalizePairKey(desk.eventKey) === normalizePairKey(selection.event.id)
      ) {
        desk.selectOutcome(selection.pairKey)
        return
      }
      void navigate({
        to: '/$cls/$market/$id',
        params: {
          cls: 'prediction',
          market: selection.venue,
          id: selection.event.id,
        },
        search: { o: selection.pairKey },
      })
    },
    [desk, navigate, pin],
  )

  return { pin, openEvent, select }
}

/**
 * Where the picked answer sits in the field, and how big the field is.
 *
 * Ranked by probability rather than by the venue's own order, because the
 * reading being measured is "did they take the favourite or go down the
 * list". A leg whose runner cannot be found reports rank 0, which is not a
 * position any answer has and so cannot be mistaken for the favourite.
 */
function rankOf(selection: OutcomeSelection): {
  rank: number
  field_size: number
} {
  const ranked = byProbability(runnersOf(selection.event))
  const key = normalizePairKey(selection.pairKey)
  const at = ranked.findIndex((runner) =>
    [runner.yes, runner.no]
      .filter(Boolean)
      .some((leg) => normalizePairKey(leg!.pairKey) === key),
  )
  return { rank: at + 1, field_size: ranked.length }
}
