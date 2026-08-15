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
import { usePredictionOutcome } from '@/stores/prediction-directory-store'

/** Reactive read of the outcome a pair key names, or null. */
export { usePredictionOutcome }

export function useIsPredictionPair(pairKey: string, market?: string): boolean {
  const pinned = usePredictionOutcome(pairKey)
  const { markets } = useAvailableMarkets()

  return useMemo(() => {
    if (pinned) return true
    if (!market) return false
    const venue = markets.find((m) => m.value === market)
    return venue?.assetClasses.includes('prediction') ?? false
  }, [pinned, market, markets])
}
