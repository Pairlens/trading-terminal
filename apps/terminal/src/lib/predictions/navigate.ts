// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pin, then navigate. The one order that matters on every prediction surface.
 *
 * `/prediction/$market/$id` carries one uppercase string, and nothing
 * downstream can re-derive which question it named — the instrument catalog
 * has no prediction rows, so a chart, a watchlist row and a ticket header all
 * read the directory pin instead. Navigating first leaves a window where the
 * new route resolves against a directory that does not know the key yet, and
 * what the user sees for that frame is the routing key where the question
 * should be.
 *
 * The board, the ladder and the basket all select outcomes, so the sequence
 * lives here rather than three times over. The `events` pane keeps its own
 * copy on purpose: it is a shipped surface this overhaul does not touch.
 */
import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'

import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

import { usePersistedState } from '@/hooks/use-persisted-state'
import { chartLinkProps } from '@/lib/market-ref/link'
import { predictionEntryFor } from '@/lib/predictions/pin'
import { registerPredictionOutcome } from '@/stores/prediction-directory-store'

export type OutcomeSelection = {
  /** Venue market id the outcome trades on. */
  venue: string
  event: PredictionEventSummary
  market: PredictionMarketSummary
  pairKey: string
  /** The outcome label as the venue names it. */
  label: string
}

export type PredictionSelect = {
  /** Pin the outcome without leaving the route — for a basket leg. */
  pin: (selection: OutcomeSelection) => void
  /** Pin, then open the outcome's chart. */
  open: (selection: OutcomeSelection) => void
}

export function usePredictionSelect(): PredictionSelect {
  const navigate = useNavigate()
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const pin = useCallback(
    ({ venue, event, market, pairKey, label }: OutcomeSelection) => {
      registerPredictionOutcome(
        pairKey,
        predictionEntryFor(venue, event, market, label),
      )
      setAssetClassMap((prev) =>
        prev[pairKey] === 'prediction'
          ? prev
          : { ...prev, [pairKey]: 'prediction' },
      )
    },
    [setAssetClassMap],
  )

  const open = useCallback(
    (selection: OutcomeSelection) => {
      pin(selection)
      // The venue rides in the address: the route can otherwise only re-home
      // the key onto "the first venue that serves predictions", which is a
      // coin flip with both installed.
      void navigate(
        chartLinkProps({
          cls: 'prediction',
          market: selection.venue,
          id: selection.pairKey,
        }),
      )
    },
    [navigate, pin],
  )

  return { pin, open }
}
