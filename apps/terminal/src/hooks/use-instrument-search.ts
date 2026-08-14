// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Instrument search, in waves:
 *
 *   Wave 1 — synchronous, from the in-memory local index (curated catalog +
 *   cached venue tables + server snapshot). Paints in the same frame as the
 *   keystroke, and its order is FROZEN for the lifetime of the query string.
 *   Wave 2 — async DEX connector fan-out (Jupiter + EVM chains), for
 *   long-tail tokens and memecoins.
 *   Wave 3 — async server deep search via the pairlens-intelligence plugin,
 *   gated on the deep-search consent setting.
 *
 * Later waves may only APPEND below the frozen wave-1 block or annotate
 * rows in place — never interleave, never re-sort. Keyboard navigation and
 * the descending finger both depend on it. Dedupe is by asset identity
 * (chain+address for tokens), never by bare symbol: two assets sharing a
 * ticker are two rows.
 *
 * Returned rows carry their display position as `rank`, so consumers that
 * sort by rank preserve this ordering exactly (watched-first bubbling on
 * top of it stays a stable partition).
 */
import { useDeferredValue, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { instrumentIdentityKey } from '@pairlens/shared/instrument-types'

import type {
  Instrument,
  InstrumentPage,
} from '@pairlens/shared/instrument-types'
import type { PluginInstance } from '@pairlens/plugin-system/types'

import { usePairlens } from '@/lib/pairlens-provider'
import {
  ensureLocalInstrumentIndex,
  searchLocalInstruments,
} from '@/lib/instruments/local-index'
import { isDeepSearchAllowed } from '@/lib/instruments/deep-search-setting'
import { useLocalIndexVersion } from '@/lib/instruments/use-local-index'

/** Normalize pair separators: "BTC USDT" or "BTC/USDT" → "BTC-USDT" */
function normalizePairQuery(q: string): string {
  return q.replace(/[\s/]+/g, '-')
}

/**
 * Normalize a DEX-connector instrument at the wire boundary: dash symbols,
 * and defaults for the catalog-only fields so sorting and rendering stay
 * well-defined even for a third-party connector that omits them.
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
  const indexVersion = useLocalIndexVersion()

  // Self-healing: the index is normally built at idle after boot, but the
  // first search intent must never find it missing and stay empty.
  useEffect(() => {
    void ensureLocalInstrumentIndex(pluginManager)
  }, [pluginManager])

  const isSearchActive = trimmed.length >= 2
  const isDeferredActive = deferredQuery.length >= 2

  // ── Wave 1: synchronous, frozen ────────────────────────────────────────
  // Keyed on the LIVE query, not the deferred one: the local index answers in
  // the same render as the keystroke. Deferring it opened a one-frame window
  // (live query active, deferred query lagging) where `data` went empty, the
  // pickers unmounted their result rows, and cmdk's selection/scroll landed on
  // whatever transient DOM it found — the list ended up scrolled mid-way.
  const wave1 = useMemo(
    () =>
      isSearchActive
        ? searchLocalInstruments(trimmed, 50)
        : { items: [], total: 0 },
    // indexVersion re-runs the search when the index (re)builds

    [trimmed, isSearchActive, indexVersion],
  )

  // ── Waves 2+3: async fan-out ───────────────────────────────────────────
  const hasDiscoverySearch = useMemo(
    () =>
      pluginManager.getPluginForCapability('market-data:discovery:search') !==
      null,
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const enabled = hasDiscoverySearch && isDeferredActive

  const result = useQuery({
    queryKey: ['instrument-search', deferredQuery, pluginStateVersion],
    queryFn: async () => {
      // Fan out to every DEX venue (Jupiter + EVM chains) so long-tail
      // tokens/memecoins surface in the global picker. Each connector is
      // invoked directly with its own market context — the manager's shared
      // context must not be mutated from concurrent calls, and the
      // resolver's single-winner routing is exactly what a fan-out is not.
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

      // Wave 3: server deep search via the pairlens-intelligence plugin —
      // invoked directly (not resolver-routed, which would stop at
      // pairlens-core) and gated on the deep-search consent setting. The
      // plugin applies the same gate internally; this check just avoids a
      // pointless round-trip into its local fallback.
      const deepPromise = (async (): Promise<Array<Instrument>> => {
        if (!isDeepSearchAllowed()) return []
        const plugin = pluginManager
          .getActivePlugins()
          .find((pl) => pl.manifest.id === 'pairlens-intelligence')
        if (!plugin) return []
        try {
          const page = (await plugin.execute({
            capability: 'market-data:discovery:search',
            params: { query: deferredQuery },
            context: {
              pair: '',
              market: '',
              timeframe: '',
              mode: 'paper' as const,
              country: '',
            },
          })) as InstrumentPage
          return Array.isArray(page?.items) ? page.items : []
        } catch {
          return []
        }
      })()

      const [dexPages, deepItems] = await Promise.all([
        Promise.all(dexPromises),
        deepPromise,
      ])
      // Wave order in the appended block: DEX (on-chain) first, then deep
      // server hits — identity dedupe in the merge drops overlaps.
      return [
        ...dexPages.flatMap((page) =>
          page.items.map((raw) => normalizeDexInstrument(raw)),
        ),
        ...deepItems,
      ]
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  // ── Merge: frozen wave 1, then appended-by-identity ────────────────────
  const asyncItems = result.data
  const data = useMemo(() => {
    if (!isSearchActive) return undefined
    const seen = new Set<string>()
    for (const inst of wave1.items) seen.add(instrumentIdentityKey(inst))
    const merged = [...wave1.items]
    for (const inst of asyncItems ?? []) {
      const identity = instrumentIdentityKey(inst)
      if (seen.has(identity)) continue
      seen.add(identity)
      // Appended rows get an identity-derived id so a token sharing its
      // ticker with a wave-1 pair still renders as its own row (unique
      // React keys, distinct selection).
      merged.push({ ...inst, id: identity, rank: merged.length })
    }
    return merged
  }, [wave1, asyncItems, isSearchActive])

  const localCount = wave1.items.length

  return useMemo(
    () => ({
      ...result,
      data,
      isSearchActive,
      /** Rows in the frozen wave-1 block (a divider may render after them). */
      localCount,
      /** Wave 1 answered — no skeleton may appear over its results. */
      hasLocalResults: localCount > 0,
    }),
    [result, data, isSearchActive, localCount],
  )
}
