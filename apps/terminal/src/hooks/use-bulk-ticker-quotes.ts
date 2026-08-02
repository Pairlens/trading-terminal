// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { BulkTickersResponse } from '@pairlens/shared/instrument-types'
import { usePairlens } from '@/lib/pairlens-provider'

export type BulkQuote = { price: number; change24h: number }

/**
 * Live exchange quotes for every listed spot pair, keyed by canonical
 * 'BASE-QUOTE' symbol. Merges the bulk snapshots of every active
 * `market-data:ticker-snapshot` provider (one public REST call per venue,
 * refreshed every 60s) — free, keyless, and independent of the App Server.
 * Higher-priority venues win on symbol collisions; a venue that is down or
 * geo-blocked simply drops out of the merge.
 */
export function useBulkTickerQuotes(): Map<string, BulkQuote> {
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

  return useMemo(() => {
    const map = new Map<string, BulkQuote>()
    for (const snapshot of data ?? []) {
      for (const t of snapshot.tickers) {
        if (!map.has(t.symbol)) {
          map.set(t.symbol, { price: t.price, change24h: t.change24h })
        }
      }
    }
    return map
  }, [data])
}
