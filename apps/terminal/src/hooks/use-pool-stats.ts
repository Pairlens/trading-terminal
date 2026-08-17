// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pool reads behind every on-chain pane: state, swaps, a chain's ranked
 * pools, and chain-level activity.
 *
 * All four go through `pluginManager.execute('market-data:pool-stats', …)`
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
 */
import { useQuery } from '@tanstack/react-query'

import type {
  ChainPoolStats,
  PoolListingResponse,
  PoolStats,
  PoolTrade,
} from '@pairlens/shared/instrument-types'

import { usePairlens } from '@/lib/pairlens-provider'

/** Pool state moves with the price; a minute is well inside the budget. */
const STATS_REFRESH_MS = 60_000
/** The tape. Faster than this and one pair eats a third of the free tier. */
const TRADES_REFRESH_MS = 15_000
/** A chain's top pools reorder on the scale of hours, not seconds. */
const LISTING_REFRESH_MS = 5 * 60_000

export type PoolStatsResult = {
  stats: PoolStats | null
  isLoading: boolean
  /** The provider answered and there is no pool for this pair on this chain. */
  noPool: boolean
  error: string | null
}

export function usePoolStats(
  market: string | undefined,
  pairKey: string | undefined,
  enabled = true,
): PoolStatsResult {
  const { pluginManager, pluginsReady } = usePairlens()
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

  return {
    stats: query.data ?? null,
    isLoading: active && query.isPending,
    noPool: query.isSuccess && query.data === null,
    error: query.error ? errorText(query.error) : null,
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
