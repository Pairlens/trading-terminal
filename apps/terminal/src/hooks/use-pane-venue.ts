// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'

import { useActivePair } from '@/lib/active-pair-context'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

/**
 * A pane's venue, and whether naming it tells the user anything the page
 * chrome doesn't already say.
 *
 * On the pair page the top bar carries the market picker, so a pane repeating
 * that venue is pure noise — `isDistinct` is false and the pane stays quiet.
 * It flips true exactly where the venue is otherwise invisible: a pane pinned
 * (override or variable) to another exchange than the one being charted, and
 * every pane of a custom workspace, whose header has no market picker at all
 * and therefore no active pair.
 */
export function usePaneVenue(market: string): {
  label: string
  isDistinct: boolean
} {
  const { activePair } = useActivePair()
  const { markets } = useAvailableMarkets()

  return useMemo(
    () => ({
      label: markets.find((m) => m.value === market)?.label ?? market,
      isDistinct: Boolean(market) && market !== activePair?.market,
    }),
    [market, markets, activePair?.market],
  )
}
