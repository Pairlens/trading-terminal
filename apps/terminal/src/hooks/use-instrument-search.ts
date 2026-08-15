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

import { isTokenAddress } from '@pairlens/market-engine/token-directory'
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
 * Normalize a venue connector's instrument at the wire boundary: dash symbols,
 * and defaults for the catalog-only fields so sorting and rendering stay
 * well-defined even for a third-party connector that omits them.
 */
function normalizeVenueInstrument(inst: Instrument): Instrument {
  return {
    ...inst,
    symbol: inst.symbol.replace(/[\s/]+/g, '-'),
    categories: Array.isArray(inst.categories) ? inst.categories : [],
    rank: typeof inst.rank === 'number' ? inst.rank : 100_000,
    featured: inst.featured ?? false,
  }
}

/**
 * Asset classes whose long tail only exists behind a venue's own search.
 *
 * DEX tokens are minted faster than any index can hold them; prediction
 * outcomes are born and resolved daily and never reach the curated catalog or
 * the server snapshot at all. Both are therefore wave-2 work — asked of the
 * connector, per venue, at query time.
 */
const VENUE_SCOPED_SEARCH_CLASSES = new Set(['dex', 'prediction'])

/**
 * Exactly two short alphanumeric segments — `BTC-USDT`, `eth/usdc`,
 * `btc usdt` — after separator normalization. The address form of a spot pair.
 *
 * Two, not "two or more": three segments is `fed-rate-cuts`, which is prose
 * someone typed looking for an event, not a pair anyone trades.
 */
const PAIR_SHAPED = /^[a-z0-9]{1,12}-[a-z0-9]{1,12}$/i

/**
 * Whether to ask the prediction venues at all.
 *
 * Their search is a live `fetchEvents` against the venue, so it should not run
 * for a query that cannot possibly name an event. Two things never do: a
 * BASE-QUOTE pair address, and a token contract address. Everything else goes
 * — including a single bare word, because "election" or "fed" is exactly how
 * someone looks for a market, and excluding one-word queries to be tidy would
 * cut the most common prediction search there is.
 *
 * Deliberately NOT "contains a space": the query reaches here with separators
 * already normalized to dashes, so `btc usdt` and `BTC-USDT` are the same
 * string by then and must get the same answer.
 */
export function isPredictionSearchable(rawQuery: string): boolean {
  const trimmed = rawQuery.trim()
  if (trimmed.length < 3) return false
  if (isTokenAddress(trimmed)) return false
  return !PAIR_SHAPED.test(normalizePairQuery(trimmed))
}

/**
 * Active venue plugins that answer a market-scoped discovery search.
 *
 * Market-scoped is the load-bearing half: a wildcard provider is a data
 * source, and the fan-out addresses each venue explicitly rather than letting
 * the resolver pick one winner.
 */
export function getVenueScopedSearchPlugins(
  plugins: Array<PluginInstance>,
): Array<{
  plugin: PluginInstance
  market: string
  assetClass: string
}> {
  const result: Array<{
    plugin: PluginInstance
    market: string
    assetClass: string
  }> = []
  for (const plugin of plugins) {
    const meta = plugin.manifest.metadata
    const assetClass = meta?.['assetClass']
    if (
      typeof assetClass !== 'string' ||
      !VENUE_SCOPED_SEARCH_CLASSES.has(assetClass)
    )
      continue
    const cap = plugin.manifest.capabilities.find(
      (c) =>
        c.id === 'market-data:discovery:search' && !c.markets.includes('*'),
    )
    const market = cap?.markets[0]
    if (market) result.push({ plugin, market, assetClass })
  }
  return result
}

export function useInstrumentSearch(query: string) {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const raw = query.trim()
  const trimmed = normalizePairQuery(raw)
  // Deferring the RAW string and normalizing after is the same value one
  // frame later, and it keeps the two forms from ever disagreeing — which two
  // separate `useDeferredValue` calls would do on the frame between them.
  const deferredRaw = useDeferredValue(raw)
  const deferredQuery = normalizePairQuery(deferredRaw)
  const indexVersion = useLocalIndexVersion()

  // Self-healing: the index is normally built at idle after boot, but the
  // first search intent must never find it missing and stay empty.
  useEffect(() => {
    void ensureLocalInstrumentIndex(pluginManager)
  }, [pluginManager])

  const isSearchActive = trimmed.length >= 2
  const isDeferredActive = deferredQuery.length >= 2

  /**
   * The raw query, but ONLY when the prediction arm will use it — otherwise
   * null, so it drops out of the cache key.
   *
   * This is the whole reason the key is not simply the raw string: every
   * spelling that normalizes alike (`btc usdt`, `btc/usdt`, `BTC-USDT`) has
   * to be ONE cache entry, or each variant re-runs the entire fan-out — every
   * DEX chain, every prediction venue and the server deep search — for a
   * result set that is identical by construction.
   */
  const predictionQuery = isPredictionSearchable(deferredRaw)
    ? deferredRaw
    : null

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
    // Normalized form for the shared waves, plus the prediction arm's own raw
    // query as a separate component (null when that arm is skipped). Spelling
    // variants of a pair query collapse to one entry; a prose query gets its
    // own.
    queryKey: [
      'instrument-search',
      deferredQuery,
      predictionQuery,
      pluginStateVersion,
    ],
    queryFn: async () => {
      // Fan out to every venue that owns its own long tail — DEX chains for
      // tokens/memecoins, prediction venues for the day's outcomes — so they
      // surface in the global picker. Each connector is invoked directly with
      // its own market context: the manager's shared context must not be
      // mutated from concurrent calls, and the resolver's single-winner
      // routing is exactly what a fan-out is not.
      const venuePromises = getVenueScopedSearchPlugins(
        pluginManager.getActivePlugins(),
      )
        .filter(
          // A prediction venue is asked only for a query that could name an
          // event; every other venue is always asked.
          ({ assetClass }) => assetClass !== 'prediction' || predictionQuery,
        )
        .map(async ({ plugin, market, assetClass }) => {
          try {
            return (await plugin.execute({
              capability: 'market-data:discovery:search',
              params: {
                // A prediction venue searches PROSE — its instrument names are
                // questions — so it gets the query as typed. Dashing "will fed
                // cut rates" into a pair key finds nothing. Every other venue
                // keeps the pair-normalized form it has always received.
                query:
                  assetClass === 'prediction'
                    ? (predictionQuery ?? deferredQuery)
                    : deferredQuery,
              },
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

      const [venuePages, deepItems] = await Promise.all([
        Promise.all(venuePromises),
        deepPromise,
      ])
      // Wave order in the appended block: venue-scoped hits (on-chain,
      // prediction outcomes) first, then deep server hits — identity dedupe
      // in the merge drops overlaps.
      return [
        ...venuePages.flatMap((page) =>
          page.items.map((item) => normalizeVenueInstrument(item)),
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
