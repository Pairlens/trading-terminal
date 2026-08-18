// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event behind the pane on screen.
 *
 * Two paths, and the first one is the normal one. On a prediction board the
 * route has already resolved the event and every pane reads that one
 * resolution through the desk context — one request per event, and no chance
 * of two panes disagreeing about the field because their fetches landed a
 * minute apart.
 *
 * The second path is for a pane that is NOT on a prediction board: dragged
 * onto a spot workspace, or bound by a pane override to some other question.
 * There the pane holds a key and nothing else, so it resolves the event
 * itself — by ID, never by heading. A pinned event names its own id; a pinned
 * outcome names the event it belongs to; either way the venue is asked for one
 * specific event rather than searched and hoped at.
 *
 * Every failure mode is a distinct state rather than an empty object, because
 * the panes say different things about each: an unpinned cold link still has a
 * title, a venue that needs the desktop app is not an error, and an event the
 * index cannot find still has a question worth printing.
 */
import { useMemo } from 'react'

import {
  usePredictionEventById,
  usePredictionVenues,
} from './use-prediction-events'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'
import type {
  PredictionEventState,
  SelectedOutcome,
} from '@/lib/predictions/desk-context'
import type { PredictionRunner } from '@/lib/predictions/race'
import type { PredictionOutcomeEntry } from '@/stores/prediction-directory-store'

import { usePredictionDesk } from '@/lib/predictions/desk-context'
import {
  usePredictionEventEntry,
  usePredictionOutcome,
} from '@/stores/prediction-directory-store'
import { isRaceEvent, runnersOf } from '@/lib/predictions/race'
import { normalizePairKey } from '@/lib/pairs'

export type { PredictionEventState }

export type PredictionEventContext = {
  state: PredictionEventState
  /** The pin for the leg being traded, or null when nothing names one. */
  entry: PredictionOutcomeEntry | null
  venue: string
  venueLabel: string
  event: PredictionEventSummary | null
  /** The market the selected answer belongs to. */
  market: PredictionMarketSummary | null
  outcome: PredictionOutcomeSummary | null
  runners: Array<PredictionRunner>
  isRace: boolean
  /** The event heading, the pinned title, or the bare key. In that order. */
  title: string
  /** The answer the book, the tape and the ticket are pointed at. */
  selected: SelectedOutcome | null
  /** Point them at another answer. A no-op outside a prediction board. */
  selectOutcome: (outcomeKey: string) => void
  /** What the venue said went wrong, verbatim. */
  error: string | null
}

const NO_OP = () => {}

export function usePredictionEventContext(
  pairKey: string,
  market: string,
): PredictionEventContext {
  const desk = usePredictionDesk()
  // The desk answers for the pane only when the pane is looking at the same
  // thing the board is. A pane override pointing somewhere else resolves on
  // its own rather than silently rendering the board's event under the
  // override's key.
  const deskMatches =
    desk !== null &&
    desk.venue === market &&
    (normalizePairKey(desk.eventKey) === normalizePairKey(pairKey) ||
      normalizePairKey(desk.selected?.pairKey ?? '') ===
        normalizePairKey(pairKey))

  const eventPin = usePredictionEventEntry(pairKey)
  const outcomePin = usePredictionOutcome(pairKey)
  const selectedPin = usePredictionOutcome(desk?.selected?.pairKey ?? '')

  const venues = usePredictionVenues()
  const venue = venues.find((v) => v.market === market) ?? null

  // The id to ask for: this pane's own event when it is one, else the event
  // the pinned outcome belongs to, else the key itself on the chance it is an
  // event id nothing has pinned yet (a shared link on a fresh profile).
  const eventId = eventPin?.eventId ?? outcomePin?.eventId ?? pairKey
  const lookup = usePredictionEventById({
    venue,
    eventId,
    enabled: !deskMatches && venue !== null && pairKey.trim() !== '',
  })

  return useMemo(() => {
    if (deskMatches && desk) {
      return {
        state: desk.state,
        entry: selectedPin,
        venue: desk.venue,
        venueLabel: desk.venueLabel,
        event: desk.event,
        market: desk.selected?.market ?? null,
        outcome: desk.selected?.outcome ?? null,
        runners: desk.runners,
        isRace: desk.isRace,
        title: desk.title,
        selected: desk.selected,
        selectOutcome: desk.selectOutcome,
        error: desk.error,
      }
    }

    const label = venue?.label ?? market.toUpperCase()
    const title = eventPin?.title || outcomePin?.eventTitle || pairKey

    const base = {
      entry: outcomePin,
      venue: market,
      venueLabel: label,
      event: null,
      market: null,
      outcome: null,
      runners: [] as Array<PredictionRunner>,
      isRace: false,
      title,
      selected: null,
      selectOutcome: NO_OP,
      error: null,
    }

    if (!venue) return { ...base, state: 'no-venue' as const }
    if (lookup.state !== 'ready' || !lookup.event) {
      return {
        ...base,
        state: lookup.state,
        error: lookup.error,
      }
    }

    const event = lookup.event
    const runners = runnersOf(event)
    // The key first, then the favourite's own leg: a pane bound to an EVENT
    // key names no leg at all, and reading nothing there would leave the
    // header with no probability to print.
    const first = runners[0]
    const found =
      findLeg(runners, pairKey) ??
      (first
        ? { runner: first, market: first.market, outcome: first.yes }
        : null)

    return {
      ...base,
      state: 'ready' as const,
      event,
      market: found?.market ?? null,
      outcome: found?.outcome ?? null,
      runners,
      isRace: isRaceEvent(event),
      title: event.title || title,
    }
  }, [
    deskMatches,
    desk,
    selectedPin,
    venue,
    market,
    eventPin,
    outcomePin,
    pairKey,
    lookup.state,
    lookup.event,
    lookup.error,
  ])
}

/** The leg this key names, walked over the whole field. */
function findLeg(
  runners: Array<PredictionRunner>,
  pairKey: string,
): {
  runner: PredictionRunner
  market: PredictionMarketSummary
  outcome: PredictionOutcomeSummary
} | null {
  const key = normalizePairKey(pairKey)
  if (!key) return null
  for (const runner of runners) {
    for (const leg of runner.no ? [runner.yes, runner.no] : [runner.yes]) {
      if (normalizePairKey(leg.pairKey) === key) {
        return { runner, market: runner.market, outcome: leg }
      }
    }
  }
  return null
}
