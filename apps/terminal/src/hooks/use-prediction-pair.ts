// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Is what is on screen a prediction outcome?" — the one question every
 * formatting site asks.
 *
 * Two signals, in this order:
 *
 *  1. The prediction directory. A pinned pair key IS an outcome; the pin was
 *     written from the row the user picked, so it answers even for a venue the
 *     terminal has since switched away from.
 *  2. The venue's declared asset class. Covers the pin's one gap — a shared
 *     `/pair/KXBTCD-26AUG15-T53` link opened on a fresh profile — and is what
 *     makes the chart axis right on first paint rather than after a selection.
 *
 * Neither reads a streaming context, so this is safe in mobile chrome.
 */
import { useMemo } from 'react'

import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { predictionTicker } from '@/lib/predictions/event-labels'
import {
  isPredictionEventEntry,
  usePredictionOutcome,
  usePredictionPin,
} from '@/stores/prediction-directory-store'

/** Reactive read of the outcome a pair key names, or null. */
export { usePredictionOutcome }

/**
 * The pair as a single line of plain text — for the places that cannot render
 * a component: the chart's watermark (painted into WebGL), the copilot's
 * heading, an aria-label.
 *
 * A pair key passes through untouched. A pinned prediction outcome becomes
 * `Gavin Newsom · Yes`, because the alternative is a hundred characters of
 * event slug drawn across the chart at 48px.
 */
export function usePairDisplayLabel(pairKey: string): string {
  const pinned = usePredictionPin(pairKey)
  return useMemo(() => {
    if (!pinned) return pairKey
    // An event is already a sentence; appending its favourite would make the
    // watermark a paragraph and would go stale the moment the field moved.
    if (isPredictionEventEntry(pinned)) return pinned.title || pairKey
    const { subject, outcome } = predictionTicker(pinned, pairKey)
    return outcome ? `${subject} · ${outcome}` : subject
  }, [pinned, pairKey])
}

export function useIsPredictionPair(pairKey: string, market?: string): boolean {
  const pinned = usePredictionPin(pairKey)
  const { markets } = useAvailableMarkets()

  return useMemo(() => {
    if (pinned) return true
    if (!market) return false
    const venue = markets.find((m) => m.value === market)
    return venue?.assetClasses.includes('prediction') ?? false
  }, [pinned, market, markets])
}
