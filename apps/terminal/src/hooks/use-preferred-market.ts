// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback } from 'react'

import { normalizeInstrumentClass } from '@pairlens/shared/market-ref'

import { resolveVenueForClass } from '@/lib/market-ref/resolve'
import { useMarketRefContext } from '@/lib/market-ref/use-market-ref'

/**
 * Which venue a discovery row should price itself against.
 *
 * A thin wrapper over the shared resolver for the many rows that hold an asset
 * class and no instrument: they only need somewhere to draw a trend line from.
 * It used to be its own copy of the policy, and it disagreed with the resolver
 * in the two ways that mattered — it compared class strings raw, so the
 * index's `'crypto'` never matched a connector's `'crypto-spot'`, and it ended
 * in `return preferred` so a venue that could not serve the class got asked
 * anyway.
 *
 * Returns the preferred venue as a last resort when NOTHING serves the class,
 * because a row still has to render something and the call sites here draw
 * sparklines rather than prices. Anything quoting a number resolves a full ref
 * and gets a real refusal instead.
 */
export function usePreferredMarketResolver(): (assetClass?: string) => string {
  const ctx = useMarketRefContext()

  return useCallback(
    (assetClass?: string) => {
      const cls = normalizeInstrumentClass(assetClass)
      if (!cls) return ctx.preferred
      return resolveVenueForClass(cls, ctx) ?? ctx.preferred
    },
    [ctx],
  )
}
