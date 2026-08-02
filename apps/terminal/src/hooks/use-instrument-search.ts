// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useDeferredValue, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type {
  Instrument,
  InstrumentPage,
} from '@pairlens/shared/instrument-types'
import type { PluginInstance } from '@pairlens/plugin-system/types'

import { usePairlens } from '@/lib/pairlens-provider'

/** Normalize pair separators: "BTC USDT" or "BTC/USDT" → "BTC-USDT" */
function normalizePairQuery(q: string): string {
  return q.replace(/[\s/]+/g, '-')
}

/**
 * Normalize a DEX-connector instrument to the shared Instrument shape: dash
 * symbols, and defaults for the catalog-only fields (rank/categories/
 * featured) so sorting and rendering stay well-defined.
 */
function normalizeDexInstrument(inst: Instrument): Instrument {
  return {
    ...inst,
    symbol: inst.symbol.replace(/[\s/]+/g, '-'),
    categories: Array.isArray(inst.categories) ? inst.categories : [],
    rank: typeof inst.rank === 'number' ? inst.rank : 100_000,
    featured: inst.featured ?? false,
  }
}

/** Active DEX venue plugins that support market-scoped discovery search. */
function getDexSearchPlugins(plugins: Array<PluginInstance>): Array<{
  plugin: PluginInstance
  market: string
}> {
  const result: Array<{ plugin: PluginInstance; market: string }> = []
  for (const plugin of plugins) {
    const meta = plugin.manifest.metadata
    if (meta?.['assetClass'] !== 'dex') continue
    const cap = plugin.manifest.capabilities.find(
      (c) =>
        c.id === 'market-data:discovery:search' && !c.markets.includes('*'),
    )
    const market = cap?.markets[0]
    if (market) result.push({ plugin, market })
  }
  return result
}

export function useInstrumentSearch(query: string) {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const trimmed = normalizePairQuery(query.trim())
  const deferredQuery = useDeferredValue(trimmed)

  const hasDiscoverySearch = useMemo(
    () =>
      pluginManager.getPluginForCapability('market-data:discovery:search') !==
      null,
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const enabled = hasDiscoverySearch && deferredQuery.length >= 2

  const result = useQuery({
    queryKey: ['instrument-search', deferredQuery, pluginStateVersion],
    queryFn: async () => {
      // Primary catalog search (resolver-routed)
      const corePromise = pluginManager
        .execute('market-data:discovery:search', { query: deferredQuery })
        .then((r) => r as InstrumentPage)
        .catch(() => ({ items: [], total: 0, hasMore: false }))

      // Fan out to every DEX venue (Jupiter + EVM chains) so long-tail
      // tokens/memecoins surface in the global picker. Each connector is
      // invoked directly with its own market context — the manager's shared
      // context must not be mutated from concurrent calls.
      const dexPromises = getDexSearchPlugins(
        pluginManager.getActivePlugins(),
      ).map(async ({ plugin, market }) => {
        try {
          return (await plugin.execute({
            capability: 'market-data:discovery:search',
            params: { query: deferredQuery },
            context: {
              pair: '',
              market,
              timeframe: '',
              mode: 'paper' as const,
              country: '',
            },
          })) as InstrumentPage
        } catch {
          return { items: [], total: 0, hasMore: false } as InstrumentPage
        }
      })

      const [core, ...dexPages] = await Promise.all([
        corePromise,
        ...dexPromises,
      ])

      // Merge, deduplicated by normalized symbol. The curated catalog wins
      // (it has real ranks); DEX hits fill in symbols the catalog doesn't
      // know — that's where memecoins come from.
      const seen = new Map<string, Instrument>()
      for (const inst of core.items) {
        const key = inst.symbol.replace(/[\s/]+/g, '-')
        const existing = seen.get(key)
        if (!existing || inst.rank < existing.rank) {
          seen.set(key, inst)
        }
      }
      for (const page of dexPages) {
        for (const raw of page.items) {
          const inst = normalizeDexInstrument(raw)
          if (!seen.has(inst.symbol)) {
            seen.set(inst.symbol, inst)
          }
        }
      }
      return Array.from(seen.values())
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const isSearchActive = trimmed.length >= 2

  return useMemo(
    () => ({ ...result, isSearchActive }),
    [result, isSearchActive],
  )
}
