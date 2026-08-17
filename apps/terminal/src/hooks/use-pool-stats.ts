// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pool reads behind every on-chain pane: state, swaps, a chain's ranked
 * pools, its newly created ones, and chain-level activity.
 *
 * All five go through `pluginManager.execute('market-data:pool-stats', …)`
 * rather than a fan-out, because unlike a venue ladder there is exactly one
 * answer here: GeckoTerminal serves it, DexPaprika is the priority-6 fallback
 * the manager walks to when the first one throws, and that IS the behaviour we
 * want. The `market` param is passed explicitly on every call — the manager's
 * own context carries the terminal's current venue, which on a second chain
 * would silently resolve pools on Solana.
 *
 * Cadences are set by GeckoTerminal's free tier (~30 requests a minute, shared
 * with the candle and ticker pollers a charted pair already runs). Pool state
 * refreshes on the minute, the tape every fifteen seconds, listings every five
 * minutes, and every query is `enabled`-gated so a pane nobody has open costs
 * nothing.
 *
 * `usePoolStats` is the one exception to the single-answer rule above, and it
 * has to be: see the reserve supplement below.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ProviderThrottledError } from '@pairlens/market-engine/errors'
import { providerThrottledUntil } from '@pairlens/market-engine/provider-throttle'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type {
  ChainPoolStats,
  PoolListingEntry,
  PoolListingResponse,
  PoolStats,
  PoolStatsSource,
  PoolTrade,
} from '@pairlens/shared/instrument-types'

import type { PoolStatsMerge } from '@/lib/dex/pool-stats-merge'
import { mergePoolStats, needsReserves } from '@/lib/dex/pool-stats-merge'
import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'

/** Pool state moves with the price; a minute is well inside the budget. */
const STATS_REFRESH_MS = 60_000
/** The tape. Faster than this and one pair eats a third of the free tier. */
const TRADES_REFRESH_MS = 15_000
/** A chain's top pools reorder on the scale of hours, not seconds. */
const LISTING_REFRESH_MS = 5 * 60_000
/** New pools: fresh enough for a discovery tab, cheap on a shared budget. */
const NEW_POOLS_REFRESH_MS = 2 * 60_000

export type PoolStatsResult = {
  stats: PoolStats | null
  isLoading: boolean
  /** The provider answered and there is no pool for this pair on this chain. */
  noPool: boolean
  error: string | null
  /**
   * Provider that filled fields the primary did not publish, when one did. The
   * pane names it beside the cells it filled, because a number the user can size
   * against should say who measured it.
   */
  filledBy: PoolStatsSource | null
  /** The fields it filled. `baseReserve`/`quoteReserve` in practice. */
  filled: Array<keyof PoolStats>
}

/** The bundled provider that publishes both-side reserves over open CORS. */
const SUPPLEMENT_PLUGIN_ID = 'dexscreener-data-provider'

export function usePoolStats(
  market: string | undefined,
  pairKey: string | undefined,
  enabled = true,
): PoolStatsResult {
  const { pluginManager, pluginsReady, pluginStateVersion } = usePairlens()
  const active = Boolean(enabled && pluginsReady && market && pairKey)

  const query = useQuery({
    queryKey: ['pool-stats', market, pairKey],
    queryFn: async () =>
      (await pluginManager.execute('market-data:pool-stats', {
        action: 'stats',
        market,
        pair: pairKey,
      })) as PoolStats | null,
    enabled: active,
    staleTime: STATS_REFRESH_MS,
    refetchInterval: STATS_REFRESH_MS,
    gcTime: 10 * 60_000,
    retry: false,
  })

  const primary = query.data ?? null

  /**
   * The reserve supplement.
   *
   * GeckoTerminal answers pool state with `reserve_in_usd` and no per-token
   * reserves, and it answers SUCCESSFULLY, so the resolver never walks to a
   * lower-priority provider that would have them. This is the fan-out shape
   * `use-prediction-events` uses for the same structural reason: the plugin is
   * called directly, because the manager resolves one winner per capability and
   * a supplement is not a fallback.
   *
   * It asks about the primary's OWN pool address, which is what makes merging
   * two providers' numbers honest: the two resolve pools independently and pick
   * different ones for the same pair. Skipped entirely when the primary already
   * published reserves, when it IS the supplement provider, and when the plugin
   * is not installed, so nothing here costs a request on a healthy desktop.
   */
  const supplier = useMemo(
    () =>
      pluginManager
        .getActivePlugins()
        .find((p: PluginInstance) => p.manifest.id === SUPPLEMENT_PLUGIN_ID) ??
      null,
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const wantsSupplement = Boolean(
    active &&
    supplier &&
    needsReserves(primary) &&
    primary &&
    primary.source !== 'dexscreener',
  )

  const supplement = useQuery({
    queryKey: ['pool-stats-reserves', market, primary?.address],
    queryFn: async () =>
      (await supplier!.execute({
        capability: 'market-data:pool-stats',
        params: {
          action: 'stats',
          market,
          pair: pairKey,
          poolAddress: primary!.address,
        },
        context: {
          pair: pairKey ?? '',
          market: market ?? '',
          timeframe: '',
          mode: 'paper' as const,
          country: getCountrySetting(),
        },
      })) as PoolStats | null,
    enabled: wantsSupplement,
    staleTime: STATS_REFRESH_MS,
    refetchInterval: STATS_REFRESH_MS,
    gcTime: 10 * 60_000,
    retry: false,
  })

  const merged: PoolStatsMerge = useMemo(
    () => mergePoolStats(primary, supplement.data ?? null),
    [primary, supplement.data],
  )

  return {
    stats: merged.stats,
    isLoading: active && query.isPending,
    noPool: query.isSuccess && query.data === null,
    // Only the primary's failure is the pane's error. A supplement that fails
    // means the pane shows exactly what it showed before there was one.
    error: query.error ? errorText(query.error) : null,
    filledBy: merged.filledBy,
    filled: merged.filled,
  }
}

export type PoolTradesResult = {
  trades: Array<PoolTrade>
  isLoading: boolean
  noPool: boolean
  error: string | null
}

/** Newest-first swaps through the pair's pool. One poll, no per-row sockets. */
export function usePoolTrades(
  market: string | undefined,
  pairKey: string | undefined,
  options: { enabled?: boolean; minVolumeUsd?: number } = {},
): PoolTradesResult {
  const { enabled = true, minVolumeUsd = 0 } = options
  const { pluginManager, pluginsReady } = usePairlens()
  const active = Boolean(enabled && pluginsReady && market && pairKey)

  const query = useQuery({
    queryKey: ['pool-trades', market, pairKey, minVolumeUsd],
    queryFn: async () =>
      (await pluginManager.execute('market-data:pool-stats', {
        action: 'trades',
        market,
        pair: pairKey,
        minVolumeUsd,
      })) as Array<PoolTrade> | null,
    enabled: active,
    staleTime: TRADES_REFRESH_MS,
    refetchInterval: TRADES_REFRESH_MS,
    gcTime: 5 * 60_000,
    retry: false,
  })

  return {
    trades: query.data ?? [],
    isLoading: active && query.isPending,
    noPool: query.isSuccess && query.data === null,
    error: query.error ? errorText(query.error) : null,
  }
}

export type PoolListingResult = {
  pools: PoolListingResponse['pools']
  isLoading: boolean
  error: string | null
}

/** A chain's pools, ranked by the provider's own 24h volume ordering. */
export function usePoolListing(
  market: string | null | undefined,
  enabled = true,
): PoolListingResult {
  const { pluginManager, pluginsReady } = usePairlens()
  const active = Boolean(enabled && pluginsReady && market)

  const query = useQuery({
    queryKey: ['pool-listing', market],
    queryFn: async () =>
      (await pluginManager.execute('market-data:pool-stats', {
        action: 'pools',
        market,
      })) as PoolListingResponse | null,
    enabled: active,
    staleTime: LISTING_REFRESH_MS,
    refetchInterval: LISTING_REFRESH_MS,
    gcTime: 30 * 60_000,
    retry: false,
  })

  return {
    pools: query.data?.pools ?? [],
    isLoading: active && query.isPending,
    error: query.error ? errorText(query.error) : null,
  }
}

/**
 * The chains the new-pools feed sweeps.
 *
 * Fixed and short on purpose: every chain here is one request per refresh out
 * of a ~25/minute provider budget the candle poller, the tape and the chain
 * rail are already spending. These four carry the overwhelming majority of new
 * pool creation; adding the long tail would cost the pair chart its headroom to
 * show a handful more rows nobody scrolls to.
 *
 * Pairlens market ids, not provider slugs — Solana's market is `jupiter`, after
 * the connector that trades it, and the provider mapping happens inside the
 * plugin.
 */
export const NEW_POOL_MARKETS: ReadonlyArray<string> = [
  'jupiter',
  'ethereum',
  'base',
  'bsc',
]

/** A newly created pool, tagged with the Pairlens market it can be opened on. */
export type NewPoolRow = {
  market: string
  pool: PoolListingEntry
}

export type NewPoolsResult = {
  pools: Array<NewPoolRow>
  isLoading: boolean
  /** Set only when EVERY chain refused; one chain failing just drops its rows. */
  error: string | null
}

const EMPTY_NEW_POOLS: Array<NewPoolRow> = []

/**
 * Recently created pools across the major chains, newest first.
 *
 * One query, `Promise.allSettled` across the chains inside it: a throttled or
 * empty chain drops its own rows rather than blanking the tab, and the caller
 * gets one loading state instead of four.
 *
 * Refetch discipline. `staleTime` is two minutes and there is NO
 * `refetchInterval`, which is the difference between this tab and the pool
 * rail. A pool is created and then it exists; nothing about the row changes in
 * the next thirty seconds, so a poll would spend four requests a minute out of
 * the shared GeckoTerminal budget to redraw the same list. The tab refreshes
 * when it is mounted or refocused past the stale window, and that is all.
 */
export function useNewPools(
  markets: ReadonlyArray<string> = NEW_POOL_MARKETS,
  enabled = true,
): NewPoolsResult {
  const { pluginManager, pluginsReady } = usePairlens()
  const key = markets.slice().sort().join(',')
  const active = Boolean(enabled && pluginsReady && markets.length > 0)

  const query = useQuery({
    queryKey: ['new-pools', key],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        markets.map(async (market) => {
          const response = (await pluginManager.execute(
            'market-data:pool-stats',
            // `market` explicitly, as everywhere in this file: the manager's
            // own context carries the terminal's current venue, which for a
            // discovery tab is whatever pair happens to be charted.
            { action: 'new-pools', market },
          )) as PoolListingResponse | null
          return (response?.pools ?? []).map(
            (pool): NewPoolRow => ({ market, pool }),
          )
        }),
      )
      const rows: Array<NewPoolRow> = []
      for (const result of settled) {
        if (result.status === 'fulfilled') rows.push(...result.value)
      }
      if (rows.length === 0) {
        // Every chain refused: rethrow one of them so the pane can say the
        // provider is the reason rather than "no pools were created today".
        const rejected = settled.find((r) => r.status === 'rejected')
        if (rejected?.status === 'rejected') throw rejected.reason
        // Nothing rejected and nothing came back. On desktop that is the
        // fallback chain answering: DexPaprika returns null for this action
        // rather than throwing, so a throttled primary reads here as an empty
        // answer. The shared throttle registry is the only place that still
        // knows, and "the provider is rate limiting us" is a different
        // sentence from "no pools were created today". Asked without a
        // provider id, like the candle stream does, because the caller cannot
        // know which one the resolver ended up using.
        const until = providerThrottledUntil()
        if (until > 0) {
          throw new ProviderThrottledError(
            'The pool data provider',
            429,
            until - Date.now(),
          )
        }
      }
      return rows
    },
    enabled: active,
    staleTime: NEW_POOLS_REFRESH_MS,
    gcTime: 30 * 60_000,
    retry: false,
  })

  return {
    pools: query.data ?? EMPTY_NEW_POOLS,
    isLoading: active && query.isPending,
    error: query.error ? errorText(query.error) : null,
  }
}

export type ChainStatsResult = {
  /** Keyed by Pairlens market id — the `market` field each row echoes back. */
  byMarket: Map<string, ChainPoolStats>
  isLoading: boolean
  error: string | null
}

const EMPTY_CHAIN_STATS: Map<string, ChainPoolStats> = new Map()

/**
 * One row per chain, batched into a single execute.
 *
 * The two providers answer differently on purpose and the rows say which:
 * DexPaprika publishes chain-wide totals, GeckoTerminal can only sum the pools
 * it sampled. The rail reads `coverage` and labels the column accordingly
 * rather than presenting a top-20 sum as a chain's whole day.
 */
export function useChainStats(
  markets: Array<string>,
  displayNames: Record<string, string>,
  enabled = true,
): ChainStatsResult {
  const { pluginManager, pluginsReady } = usePairlens()
  const key = markets.slice().sort().join(',')
  const active = Boolean(enabled && pluginsReady && markets.length > 0)

  const query = useQuery({
    queryKey: ['chain-stats', key],
    queryFn: async () => {
      const rows = (await pluginManager.execute('market-data:pool-stats', {
        action: 'networks',
        markets,
        displayNames,
      })) as Array<ChainPoolStats> | null
      const map = new Map<string, ChainPoolStats>()
      for (const row of rows ?? []) map.set(row.market, row)
      return map
    },
    enabled: active,
    staleTime: LISTING_REFRESH_MS,
    refetchInterval: LISTING_REFRESH_MS,
    gcTime: 30 * 60_000,
    retry: false,
  })

  return {
    byMarket: query.data ?? EMPTY_CHAIN_STATS,
    isLoading: active && query.isPending,
    error: query.error ? errorText(query.error) : null,
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
