// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Opening a prediction from the phone, in one place.
 *
 * Four surfaces reach for it (the Discover strip, the events screen, the event
 * screen and the outcome ladder) and every one of them has to do the identical
 * things in the identical order, so it is a hook rather than four copied
 * handlers.
 *
 * **The pair is the EVENT.** The phone focuses a question and streams one of
 * its answers, exactly as the desktop board does. So a tap carries both: the
 * event becomes the instrument (the address, the watchlist row, the recents
 * entry) and the answer becomes the leg the chart, the book and the ticket
 * address. One commit, not two, because two would paint a frame of the new
 * question with the old question's leg still loaded in the ticket.
 *
 * **Pin BEFORE focusing.** A prediction's identity is venue + event + outcome,
 * and none of it survives into focus state: the shell carries one uppercase
 * key, and every surface that later renders it resolves that key against the
 * instrument catalog, which holds no prediction rows at all. The two
 * `register*` calls are what turn `90434` back into a question and
 * `…-FISHBACK-…-NO` back into an answer. The desktop takes the same step for
 * the same reason.
 *
 * **The venue goes first and the pair second**, matching every other mobile
 * selection surface: `setFocusedPrediction` can drop an update it considers
 * redundant, and both halves have to land for one URL rewrite.
 *
 * Landing is `selectTab('chart')` and not `dismissPanel()` + `closeOverlays()`
 * — the point of the tap is the chart, and the shell's history arithmetic
 * wants one commit rather than two (see `commitShell`).
 */
import { useCallback } from 'react'

import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'
import { haptic } from '@/lib/haptics'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useRecentPairs } from '@/lib/recent-tickers'
import {
  registerPredictionEvent,
  registerPredictionOutcome,
} from '@/stores/prediction-directory-store'
import {
  predictionEntryFor,
  predictionEventEntryFor,
} from '@/lib/predictions/pin'

export type OpenPredictionOutcome = (
  /** Venue market id the row came from. */
  market: string,
  event: PredictionEventSummary,
  predictionMarket: PredictionMarketSummary,
  outcome: PredictionOutcomeSummary,
) => void

/** Open a question with no side taken: the desk loads its favourite. */
export type OpenPredictionEvent = (
  market: string,
  event: PredictionEventSummary,
) => void

export function useOpenPredictionOutcome(): OpenPredictionOutcome {
  const open = useOpenPrediction()
  return useCallback(
    (market, event, predictionMarket, outcome) =>
      open(market, event, predictionMarket, outcome),
    [open],
  )
}

export function useOpenPredictionEvent(): OpenPredictionEvent {
  const open = useOpenPrediction()
  return useCallback((market, event) => open(market, event, null, null), [open])
}

function useOpenPrediction() {
  const { focusedVenue } = useMobileFocus()
  const { setFocusedPrediction, setFocusedVenue, selectTab } =
    useMobileActions()
  const [, trackRecent] = useRecentPairs()
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  return useCallback(
    (
      market: string,
      event: PredictionEventSummary,
      predictionMarket: PredictionMarketSummary | null,
      outcome: PredictionOutcomeSummary | null,
    ) => {
      haptic('selection')
      registerPredictionEvent(event.id, predictionEventEntryFor(market, event))
      if (predictionMarket && outcome) {
        registerPredictionOutcome(
          outcome.pairKey,
          predictionEntryFor(market, event, predictionMarket, outcome.label),
        )
      }
      setAssetClassMap((prev) =>
        prev[event.id] === 'prediction'
          ? prev
          : { ...prev, [event.id]: 'prediction' },
      )
      if (market !== focusedVenue) setFocusedVenue(market)
      // An empty leg is the desk's cue to open on the favourite, which is what
      // a tap on a question rather than on one of its prices means.
      setFocusedPrediction(event.id, outcome?.pairKey ?? '')
      trackRecent({ cls: 'prediction', market, id: event.id })
      selectTab('chart')
    },
    [
      focusedVenue,
      selectTab,
      setAssetClassMap,
      setFocusedPrediction,
      setFocusedVenue,
      trackRecent,
    ],
  )
}
