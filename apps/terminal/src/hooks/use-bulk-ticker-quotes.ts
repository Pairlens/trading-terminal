// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { BulkTickersResponse } from '@pairlens/shared/instrument-types'
import { usePairlens } from '@/lib/pairlens-provider'

export type BulkQuote = { price: number; change24h: number }

/**
 * The raw per-venue snapshots, priority-ordered, with the venue each one came
 * from still attached.
 *
 * `useBulkTickerQuotes` below flattens these into one symbol → price map,
 * which is what the discovery surfaces want. The multi-price pane wants the
 * opposite: which venues list a symbol at all, and at what price each. Both
 * read the same react-query entry, so asking for the venue dimension costs no
 * extra requests.
 */
export function useBulkTickerSnapshots(): Array<BulkTickersResponse> {
  const { pluginManager, pluginStateVersion } = usePairlens()

  const { data } = useQuery({
    // pluginStateVersion re-runs the query as connectors (de)activate
    queryKey: ['bulk-ticker-quotes', pluginStateVersion],
    queryFn: async () => {
      const providers = pluginManager.getPluginsForCapability(
        'market-data:ticker-snapshot',
      )
      if (providers.length === 0) return []
      const context = pluginManager.getContext()
      const settled = await Promise.allSettled(
        providers.map((p) =>
          p.execute({
            capability: 'market-data:ticker-snapshot',
            params: {},
            context,
          }),
        ),
      )
      return settled
        .filter(
          (s): s is PromiseFulfilledResult<unknown> => s.status === 'fulfilled',
        )
        .map((s) => s.value as BulkTickersResponse)
        .filter((r) => Array.isArray(r?.tickers))
    },
    refetchInterval: 60_000,
    staleTime: 55_000,
    gcTime: 5 * 60_000,
  })

  return data ?? EMPTY_SNAPSHOTS
}

/** Stable identity so `data ?? []` doesn't invalidate every memo downstream. */
const EMPTY_SNAPSHOTS: Array<BulkTickersResponse> = []

/**
 * Live exchange quotes for every listed spot pair, keyed by canonical
 * 'BASE-QUOTE' symbol. Merges the bulk snapshots of every active
 * `market-data:ticker-snapshot` provider (one public REST call per venue,
 * refreshed every 60s) — free, keyless, and independent of the App Server.
 * Higher-priority venues win on symbol collisions; a venue that is down or
 * geo-blocked simply drops out of the merge.
 */
export function useBulkTickerQuotes(): Map<string, BulkQuote> {
  const data = useBulkTickerSnapshots()
  // The previous map, kept so a symbol whose numbers did not move hands back
  // the SAME object. Prices change between snapshots, so react-query's
  // structural sharing cannot keep `data` identity and this memo re-runs in
  // full every 60s — allocating a fresh quote per symbol would break `memo` on
  // every consuming row at once and re-render a whole watchlist for the two
  // symbols that actually ticked.
  const previous = useRef<Map<string, BulkQuote>>(EMPTY_QUOTES)

  return useMemo(() => {
    const prev = previous.current
    const map = new Map<string, BulkQuote>()
    for (const snapshot of data) {
      for (const t of snapshot.tickers) {
        if (map.has(t.symbol)) continue
        const before = prev.get(t.symbol)
        map.set(
          t.symbol,
          before != null &&
            before.price === t.price &&
            before.change24h === t.change24h
            ? before
            : { price: t.price, change24h: t.change24h },
        )
      }
    }
    previous.current = map
    return map
  }, [data])
}

/** Stable identity for the first render's "no previous snapshot" case. */
const EMPTY_QUOTES: Map<string, BulkQuote> = new Map()
