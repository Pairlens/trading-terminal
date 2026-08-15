// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Opening a prediction outcome from the phone, in one place.
 *
 * Two surfaces reach for it (the Discover strip and the events screen) and
 * both have to do the identical four things in the identical order, so it is a
 * hook rather than a copied handler.
 *
 * **Pin BEFORE navigate.** A prediction instrument's identity is
 * venue + market id + outcome, and none of that survives into focus state: the
 * shell carries one uppercase pair key, and every surface that later renders
 * it (the chart header, the ticket, the watchlist, the recents strip) resolves
 * that key against the instrument catalog, which holds no prediction rows at
 * all. `registerPredictionOutcome` is what turns `KXBTCD-26AUG15-T53` back
 * into a question. The desktop events pane takes the same step for the same
 * reason.
 *
 * The venue goes first and the pair second, matching every other mobile
 * selection surface: `setFocusedPair` can drop an update it considers
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
import { registerPredictionOutcome } from '@/stores/prediction-directory-store'
import { predictionOutcomeName } from '@/lib/predictions/event-labels'

export type OpenPredictionOutcome = (
  /** Venue market id the row came from. */
  market: string,
  event: PredictionEventSummary,
  predictionMarket: PredictionMarketSummary,
  outcome: PredictionOutcomeSummary,
) => void

export function useOpenPredictionOutcome(): OpenPredictionOutcome {
  const { focusedVenue } = useMobileFocus()
  const { setFocusedPair, setFocusedVenue, selectTab } = useMobileActions()
  const [, trackRecent] = useRecentPairs()
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  return useCallback(
    (market, event, predictionMarket, outcome) => {
      haptic('selection')
      registerPredictionOutcome(outcome.pairKey, {
        market,
        predictionMarketId: predictionMarket.id,
        outcome: outcome.label,
        // The same `<question> - <outcome>` join the connectors build `name`
        // from, with the venue's opaque market id resolved to something
        // readable first.
        name: predictionOutcomeName(
          predictionMarket.title,
          event.title,
          outcome.label,
          event.markets.length,
        ),
        eventTitle: event.title,
        eventId: event.id,
        ...(predictionMarket.endMs !== undefined
          ? { endMs: predictionMarket.endMs }
          : {}),
      })
      setAssetClassMap((prev) => ({ ...prev, [outcome.pairKey]: 'prediction' }))
      if (market !== focusedVenue) setFocusedVenue(market)
      setFocusedPair(outcome.pairKey, 'prediction')
      trackRecent({ cls: 'prediction', market, id: outcome.pairKey })
      selectTab('chart')
    },
    [
      focusedVenue,
      selectTab,
      setAssetClassMap,
      setFocusedPair,
      setFocusedVenue,
      trackRecent,
    ],
  )
}
