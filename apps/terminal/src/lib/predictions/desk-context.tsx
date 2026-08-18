// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event on screen, and which of its answers the ticket is pointed at.
 *
 * A prediction pair is an event. The route carries the event's id, the desk
 * resolves it once, and every pane on the board reads the SAME resolution from
 * here rather than re-fetching a copy: the header sums the field, the ladder
 * lists it, the chart draws it, the basket stakes several legs of it at once.
 * One request per event, not six.
 *
 * The second half is the selection. An event has many tradeable answers and
 * exactly one book, one tape and one ticket on screen, so something has to say
 * which answer those three are addressing. That is `selected`, and it is a
 * SELECTION rather than a navigation: switching from Yes to No, or from one
 * runner to the next, must not tear down the chart, reset the layout or push a
 * history entry per click. It rides in the URL (`?o=`) so a shared link can
 * still point at a specific leg, and it defaults to the favourite so the board
 * is tradeable the instant it paints, without a choice being demanded first.
 *
 * Nothing below the provider fetches. Panes call `usePredictionDesk`, and the
 * panes that also run outside this route (the ones a user can drag onto a spot
 * board) call `usePredictionEventContext`, which falls back to its own lookup
 * when there is no desk above it.
 */
import { createContext, useContext } from 'react'

import type { ReactNode } from 'react'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'
import type { PredictionRunner } from '@/lib/predictions/race'
import type { PredictionEventEntry } from '@/stores/prediction-directory-store'

/** Why the event resolved the way it did. Each arm reads differently. */
export type PredictionEventState =
  | 'loading'
  | 'ready'
  /** No prediction connector for this venue is active. */
  | 'no-venue'
  /** The venue refuses browser origins; the pin may still name the event. */
  | 'desktop-only'
  /** The venue answered, but this event is not in what it returned. */
  | 'not-found'
  | 'error'

/** The answer the book, the tape and the ticket are all pointed at. */
export type SelectedOutcome = {
  /** The outcome key — what a subscription and an order address. */
  pairKey: string
  /** The answer as the venue names it. */
  label: string
  /** The runner it belongs to: its market, its complement, its colour slot. */
  runner: PredictionRunner
  /** The market the leg trades in — what an order ticket names. */
  market: PredictionMarketSummary
  /** The leg itself, for its price and its 24h move. */
  outcome: PredictionOutcomeSummary
}

export type PredictionDesk = {
  state: PredictionEventState
  /** Venue market id. Part of a prediction's identity, never a preference. */
  venue: string
  venueLabel: string
  /** The pair key: the event's own id. */
  eventKey: string
  /** The pin, which paints before the fetch lands. */
  entry: PredictionEventEntry | null
  event: PredictionEventSummary | null
  runners: Array<PredictionRunner>
  isRace: boolean
  /** The event heading, the pinned title, or the bare key. In that order. */
  title: string
  selected: SelectedOutcome | null
  /** Point the book, the tape and the ticket at another answer. */
  selectOutcome: (outcomeKey: string) => void
  /** What the venue said went wrong, verbatim. */
  error: string | null
}

const PredictionDeskContext = createContext<PredictionDesk | null>(null)

export function PredictionDeskProvider({
  desk,
  children,
}: {
  desk: PredictionDesk
  children: ReactNode
}) {
  return (
    <PredictionDeskContext.Provider value={desk}>
      {children}
    </PredictionDeskContext.Provider>
  )
}

/** The desk above this pane, or null when the pane is not on a prediction board. */
export function usePredictionDesk(): PredictionDesk | null {
  return useContext(PredictionDeskContext)
}

/**
 * Every tradeable leg of a runner, favourite side first.
 *
 * A race row publishes a Yes and sometimes a No; a binary market publishes
 * both. Callers that let a user take EITHER side (the ladder's chips, the
 * ticket's toggle) walk this rather than reaching into `runner.yes` and
 * `runner.no`, so a venue that grows a third leg does not need them all
 * changed.
 */
export function legsOf(
  runner: PredictionRunner,
): Array<PredictionOutcomeSummary> {
  return runner.no ? [runner.yes, runner.no] : [runner.yes]
}
