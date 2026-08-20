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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'

import {
  ProviderThrottledError,
  isProviderThrottledError,
} from '@pairlens/market-engine/errors'
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
import {
  readDiscoverySnapshot,
  writeDiscoverySnapshot,
} from '@/lib/dex/discovery-cache'
import { learnedTokenPin } from '@/lib/dex/token-label'
import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'
import { registerDisplayToken } from '@/stores/token-directory-store'

/** Pool state moves with the price; a minute is well inside the budget. */
const STATS_REFRESH_MS = 60_000
/** The tape. Faster than this and one pair eats a third of the free tier. */
const TRADES_REFRESH_MS = 15_000
/** A chain's top pools reorder on the scale of hours, not seconds. */
const LISTING_REFRESH_MS = 5 * 60_000
/** New pools: fresh enough for a discovery tab, cheap on a shared budget. */
const NEW_POOLS_REFRESH_MS = 2 * 60_000

/**
 * How many times a throttled read is worth asking again.
 *
 * These reads do not retry in general, and that is right for the failure they
 * usually have: the provider answered and there is nothing there, so asking
 * again is a wasted request out of a budget four panes are sharing. A throttle
 * is the opposite failure. It says the same request succeeds later, and with
 * no retry the pane sat on it for the whole five-minute stale window — which
 * is what a rate-limited board opening actually looked like: empty, and empty
 * until you navigated away and came back.
 */
const THROTTLE_RETRIES = 2

/** Retry a provider throttle, and only a provider throttle. */
function retryOnThrottle(failureCount: number, error: unknown): boolean {
  return isProviderThrottledError(error) && failureCount <= THROTTLE_RETRIES
}

/**
 * The provider's own advice where it gave any, and a widening back-off
 * otherwise. Capped, because a pane that says "retrying" should mean it.
 */
function throttleRetryDelay(attempt: number, error: unknown): number {
  const advised = isProviderThrottledError(error) ? error.retryAfterMs : 0
  return Math.min(Math.max(advised, 1_500 * 2 ** attempt), 10_000)
}

/**
 * The chain listing every DEX Discovery pane reads.
 *
 * Exported so the panes cannot drift apart: react-query keys on these values,
 * so a pane asking for a different depth would open a SECOND listing query for
 * the same chain and spend the requests twice against a provider that is
 * already the board's tightest budget.
 */
export const DISCOVERY_POOL_LISTING = { sort: 'volume', depth: 3 } as const

export type PoolStatsResult = {
  stats: PoolStats | null
  isLoading: boolean
  /** The provider answered and there is no pool for this pair on this chain. */
  noPool: boolean
  error: string | null
  /** The failure is a provider rate limit, whose own message is readable. */
  throttled: boolean
  /** The failure is retryable and another attempt is already scheduled. */
  retrying: boolean
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

/**
 * `poolAddress` pins the read to a pool the caller already identified — the
 * discovery board's selection, an LP position's own pool — instead of letting
 * the provider re-derive one from `BASE-QUOTE`. It is part of the query key,
 * because two panes looking at two pools of the same pair are two answers.
 */
export function usePoolStats(
  market: string | undefined,
  pairKey: string | undefined,
  enabled = true,
  poolAddress?: string,
): PoolStatsResult {
  const { pluginManager, pluginsReady, pluginStateVersion } = usePairlens()
  const active = Boolean(enabled && pluginsReady && market && pairKey)

  const query = useQuery({
    queryKey: ['pool-stats', market, pairKey, poolAddress ?? null],
    queryFn: async () =>
      (await pluginManager.execute('market-data:pool-stats', {
        action: 'stats',
        market,
        pair: pairKey,
        ...(poolAddress ? { poolAddress } : {}),
      })) as PoolStats | null,
    enabled: active,
    staleTime: STATS_REFRESH_MS,
    refetchInterval: STATS_REFRESH_MS,
    gcTime: 10 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
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

  useLearnedTokenLabel(market, pairKey, merged.stats)

  return {
    stats: merged.stats,
    isLoading: active && query.isPending,
    noPool: query.isSuccess && query.data === null,
    // Only the primary's failure is the pane's error. A supplement that fails
    // means the pane shows exactly what it showed before there was one.
    error: query.error ? errorText(query.error) : null,
    throttled: isProviderThrottledError(query.error),
    // `isFetching` would read a backed-off retry, or one parked on the focus
    // gate with the window in the background, as a first load. See the same
    // test in `usePoolListing`.
    retrying: query.failureCount > 0 && query.fetchStatus !== 'idle',
    filledBy: merged.filledBy,
    filled: merged.filled,
  }
}

/**
 * Teach the token directory what the pool that just resolved is called, so a
 * pair reached by link stops rendering as a bare address. The rule, and the
 * orientation guard that makes it safe, live in `learnedTokenPin`.
 */
function useLearnedTokenLabel(
  market: string | undefined,
  pairKey: string | undefined,
  stats: PoolStats | null,
): void {
  const baseSymbol = stats?.baseSymbol ?? null
  const quoteSymbol = stats?.quoteSymbol ?? null

  useEffect(() => {
    const pin = learnedTokenPin(market, pairKey, { baseSymbol, quoteSymbol })
    if (pin) registerDisplayToken(pin)
  }, [market, pairKey, baseSymbol, quoteSymbol])
}

export type PoolTradesResult = {
  trades: Array<PoolTrade>
  isLoading: boolean
  noPool: boolean
  error: string | null
  /** The failure is a provider rate limit, whose own message is readable. */
  throttled: boolean
  /** The failure is retryable and another attempt is already scheduled. */
  retrying: boolean
}

/** Newest-first swaps through the pair's pool. One poll, no per-row sockets. */
export function usePoolTrades(
  market: string | undefined,
  pairKey: string | undefined,
  options: {
    enabled?: boolean
    minVolumeUsd?: number
    /** Pin the tape to this pool rather than resolving the pair. */
    poolAddress?: string
  } = {},
): PoolTradesResult {
  const { enabled = true, minVolumeUsd = 0, poolAddress } = options
  const { pluginManager, pluginsReady } = usePairlens()
  const active = Boolean(enabled && pluginsReady && market && pairKey)

  const query = useQuery({
    queryKey: [
      'pool-trades',
      market,
      pairKey,
      minVolumeUsd,
      poolAddress ?? null,
    ],
    queryFn: async () =>
      (await pluginManager.execute('market-data:pool-stats', {
        action: 'trades',
        market,
        pair: pairKey,
        minVolumeUsd,
        ...(poolAddress ? { poolAddress } : {}),
      })) as Array<PoolTrade> | null,
    enabled: active,
    staleTime: TRADES_REFRESH_MS,
    refetchInterval: TRADES_REFRESH_MS,
    gcTime: 5 * 60_000,
    // The ONE query here that must not retry internally, and the reason is
    // the interval above rather than the budget. A retry sequence has to fit
    // inside its own poll: this tape refreshes every fifteen seconds and the
    // shared throttle back-off is eight, so two retries outlast the interval,
    // the interval restarts the sequence before it can exhaust, and the query
    // never reaches an error state at all. It just stays `pending` — which is
    // exactly what the flow pane rendered, forever, as "Loading swaps".
    //
    // The poll IS the retry, and a better one: it is already scheduled, it
    // costs the same single request, and between attempts the pane gets to
    // say what went wrong instead of pretending to still be loading.
    retry: false,
  })

  return {
    trades: query.data ?? [],
    isLoading: active && query.isPending,
    noPool: query.isSuccess && query.data === null,
    error: query.error ? errorText(query.error) : null,
    throttled: isProviderThrottledError(query.error),
    retrying: query.failureCount > 0 && query.fetchStatus !== 'idle',
  }
}

/**
 * React Query options that paint a stored snapshot while a fresh read runs.
 *
 * `initialDataUpdatedAt` is the load-bearing half. Without it React Query dates
 * the seed to now, treats it as inside the stale window and skips the refetch
 * entirely, and the board shows half-hour-old numbers with nothing in flight.
 * With it, every seeded query refetches on mount and the snapshot is only ever
 * the first paint.
 */
function seededFromSnapshot<T>(key: string | null): {
  initialData?: () => T
  initialDataUpdatedAt?: number
} {
  const seed = key ? readDiscoverySnapshot<T>(key) : null
  if (!seed) return {}
  return { initialData: () => seed.data, initialDataUpdatedAt: seed.ts }
}

/**
 * Keep `key`'s snapshot in step with a query's data.
 *
 * `updatedAt` is React Query's own `dataUpdatedAt`, which is the measurement
 * time rather than the render time — see `writeDiscoverySnapshot` for why
 * re-stamping a seeded value would make it immortal.
 */
function useSnapshotWriter(
  key: string | null,
  data: unknown,
  updatedAt: number,
): void {
  useEffect(() => {
    if (!key || data === undefined || data === null) return
    writeDiscoverySnapshot(key, data, updatedAt)
  }, [key, data, updatedAt])
}

export type PoolListingResult = {
  pools: PoolListingResponse['pools']
  isLoading: boolean
  /**
   * The first page is on screen and the depth pages behind it are still in
   * flight. Not a loading state: the map has tiles to draw and is only going to
   * gain more.
   */
  deepening: boolean
  /**
   * What is on screen was restored from a stored snapshot and a fresh read is
   * in flight. The pane says so rather than presenting half-hour-old volume as
   * a live reading.
   */
  revalidating: boolean
  /**
   * The failure, when there is one — and only ever shown to a reader when
   * `throttled` says it was written for one. Everything else that reaches here
   * is plumbing ("All candidates for capability 'market-data:pool-stats'
   * failed"), which a pane must translate rather than print.
   */
  error: string | null
  /** The failure is a provider rate limit, whose own message is readable. */
  throttled: boolean
  /** The failure is retryable and another attempt is already scheduled. */
  retrying: boolean
  /** Ask again now. Wired to the pane's retry control. */
  retry: () => void
}

/** Where a listing's snapshot lives between reloads. */
function listingSnapshotKey(
  market: string,
  sort: string,
  depth: number,
): string {
  return `dex-listing:${market}:${sort}:${depth}`
}

/**
 * A chain's pools, ranked by the provider's own 24h volume ordering.
 *
 * Two queries where there used to be one, and the split is the whole reason the
 * board paints in seconds rather than in double figures.
 *
 * A depth walk is three sequential requests through a limiter that paces at
 * 1.2s, and the OLD shape resolved only when all three had landed. Nothing
 * downstream could start until then: the map seeds the board's pool selection
 * from this listing, and the detail pane and the flow chart cannot ask for
 * anything until a pool is selected. So a chart of one pool's swaps waited on
 * two pages of OTHER pools it would never draw.
 *
 * Now page one is its own query. It is also the exact page the chain rail
 * already asks for when it samples this chain, so on a cold board it usually
 * costs no request at all (see the in-flight map in `pool-listing-client`). The
 * map draws its first tiles from it, seeds the selection, and the panes beside
 * it get their high-priority reads into the queue while the depth pages are
 * still walking. The deep answer replaces it wholesale when it lands, and it is
 * a superset, so nothing on screen moves except by gaining tiles.
 *
 * Both halves are seeded from the stored snapshot, so a reload paints the last
 * ranking immediately and revalidates behind the reader.
 */
export function usePoolListing(
  market: string | null | undefined,
  enabled = true,
  opts?: { sort?: 'volume'; depth?: number },
): PoolListingResult {
  const { pluginManager, pluginsReady } = usePairlens()
  const active = Boolean(enabled && pluginsReady && market)
  const sort = opts?.sort
  const sortKey = sort ?? 'trending'
  const depth = opts?.depth ?? 1
  /** A depth walk has a fast half worth splitting out; a single page does not. */
  const deep = depth > 1
  /**
   * When this pane started looking, and the only way to tell a snapshot paint
   * from a live one.
   *
   * `initialData` puts a query straight into `success`, so every "is it still
   * loading" flag reads false the moment a seed is served — which is what makes
   * the seed useful and also what hides the fact that the numbers on screen were
   * measured before the reader arrived. Comparing React Query's `dataUpdatedAt`
   * against this is the test: older than the mount means it is the seed, and a
   * fetch in flight beside it means a live copy is coming. A routine five-minute
   * poll is newer than the mount, so it never flashes the label.
   */
  const [mountedAt] = useState(() => Date.now())

  const request = useCallback(
    async (pages: number) =>
      (await pluginManager.execute('market-data:pool-stats', {
        action: 'pools',
        market,
        ...(sort ? { sort } : {}),
        ...(pages > 1 ? { depth: pages } : {}),
      })) as PoolListingResponse | null,
    [pluginManager, market, sort],
  )

  // Page one. Same key the depth-1 callers have always used, so a pane that
  // wants one page and a pane that wants three share this query rather than
  // opening two.
  const head = useQuery({
    queryKey: ['pool-listing', market, sortKey, 1],
    queryFn: () => request(1),
    enabled: active,
    staleTime: LISTING_REFRESH_MS,
    refetchInterval: LISTING_REFRESH_MS,
    gcTime: 30 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
    ...seededFromSnapshot<PoolListingResponse | null>(
      market ? listingSnapshotKey(market, sortKey, 1) : null,
    ),
  })

  const full = useQuery({
    queryKey: ['pool-listing', market, sortKey, depth],
    queryFn: () => request(depth),
    enabled: active && deep,
    staleTime: LISTING_REFRESH_MS,
    refetchInterval: LISTING_REFRESH_MS,
    gcTime: 30 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
    ...seededFromSnapshot<PoolListingResponse | null>(
      market && deep ? listingSnapshotKey(market, sortKey, depth) : null,
    ),
  })

  // The deep answer wins whenever it exists: it contains page one, so swapping
  // to it only ever adds pools. Falling back the other way would drop tiles.
  const data = (deep ? full.data : undefined) ?? head.data ?? null

  useSnapshotWriter(
    market ? listingSnapshotKey(market, sortKey, 1) : null,
    head.data,
    head.dataUpdatedAt,
  )
  useSnapshotWriter(
    market && deep ? listingSnapshotKey(market, sortKey, depth) : null,
    full.data,
    full.dataUpdatedAt,
  )

  // Page one is what must succeed; the plugin already swallows a failed page
  // two or three rather than throwing the first page away with them, so in
  // practice these two carry the same failure.
  const failure = head.error ?? (deep ? full.error : null)
  const headRetrying = head.failureCount > 0 && head.fetchStatus !== 'idle'
  const fullRetrying =
    deep && full.failureCount > 0 && full.fetchStatus !== 'idle'

  return {
    pools: data?.pools ?? [],
    isLoading:
      active && data === null && (head.isPending || (deep && full.isPending)),
    deepening: deep && data !== null && full.isPending,
    revalidating:
      data !== null &&
      (head.isFetching || (deep && full.isFetching)) &&
      Math.max(head.dataUpdatedAt, deep ? full.dataUpdatedAt : 0) < mountedAt,
    error: failure ? errorText(failure) : null,
    throttled: isProviderThrottledError(failure),
    // `isFetching` is the wrong test, and the news feed learned this the hard
    // way (see `newsFeedView` in components/news/news-feed-state.ts): a retry
    // that is backing off, or parked on the focus gate because the window is
    // in the background, sits at `fetchStatus: 'paused'` with nothing in
    // flight. Read through `isFetching` that is indistinguishable from a first
    // load, and the pane holds a skeleton for as long as the tab stays hidden.
    retrying: headRetrying || fullRetrying,
    retry: () => {
      void head.refetch()
      if (deep) void full.refetch()
    },
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
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
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
  /**
   * Chains still waiting on their own answer, so a row can shimmer while the
   * rows beside it show real numbers. The rail fills in chain by chain now,
   * and a single pane-wide flag cannot express that.
   */
  pendingMarkets: ReadonlySet<string>
  error: string | null
  /** The failure is a provider rate limit, whose own message is readable. */
  throttled: boolean
}

const EMPTY_CHAIN_STATS: Map<string, ChainPoolStats> = new Map()
const EMPTY_PENDING: ReadonlySet<string> = new Set()

/** Where a chain's aggregate row is kept across a reload. */
function chainStatsSnapshotKey(market: string): string {
  return `dex-chain-stats:${market}`
}

/**
 * One row per chain, one QUERY per chain.
 *
 * This used to be a single execute carrying every market, and the plugin
 * behind it fans out with `Promise.allSettled` — so the rail painted nothing
 * until the LAST chain answered. On a metered provider paced at roughly one
 * request every 1.2 seconds, behind the map's own reads, that is the whole
 * rail sitting blank for the better part of ten seconds and then filling in
 * one frame. Per chain, each row lands on its own, and the first numbers show
 * up as soon as the first request does.
 *
 * `leadMarket` is the chain the reader has selected, and it is asked for at
 * normal priority while the rest of the sweep stays in the background. That
 * costs nothing: it is the same listing page the pool map is already fetching
 * for that chain, so the two collapse into one request inside the plugin, and
 * the row the reader is looking at fills with the map rather than behind it.
 *
 * The two providers answer differently on purpose and the rows say which:
 * DexPaprika publishes chain-wide totals, GeckoTerminal can only sum the pools
 * it sampled. The rail reads `coverage` and labels the column accordingly
 * rather than presenting a top-20 sum as a chain's whole day.
 */
export function useChainStats(
  markets: Array<string>,
  displayNames: Record<string, string>,
  options: { enabled?: boolean; leadMarket?: string | null } = {},
): ChainStatsResult {
  const { pluginManager, pluginsReady } = usePairlens()
  const { enabled = true, leadMarket = null } = options
  const active = Boolean(enabled && pluginsReady && markets.length > 0)

  const results = useQueries({
    queries: markets.map((market) => ({
      queryKey: ['chain-stats', market],
      queryFn: async () => {
        const rows = (await pluginManager.execute('market-data:pool-stats', {
          action: 'networks',
          market,
          markets: [market],
          displayNames: { [market]: displayNames[market] ?? market },
          // Not part of the query key: priority is about who is waiting, not
          // about what comes back, and keying on it would split one chain's
          // row into two queries the moment the selection moved.
          priority: market === leadMarket ? 'normal' : 'low',
        })) as Array<ChainPoolStats> | null
        return rows ?? []
      },
      enabled: active,
      staleTime: LISTING_REFRESH_MS,
      refetchInterval: LISTING_REFRESH_MS,
      gcTime: 30 * 60_000,
      retry: retryOnThrottle,
      retryDelay: throttleRetryDelay,
      // Rows, not the Map the rail reads: a Map does not survive JSON, and the
      // snapshot has to be the thing that crosses a reload.
      ...seededFromSnapshot<Array<ChainPoolStats>>(
        chainStatsSnapshotKey(market),
      ),
    })),
  })

  // One effect over the whole sweep rather than a writer hook per chain: the
  // number of chains is data, and a hook per row would change the hook count
  // when a connector is installed.
  const writeSignature = results
    .map((result, index) => `${markets[index]}:${result.dataUpdatedAt}`)
    .join('|')
  useEffect(() => {
    results.forEach((result, index) => {
      const market = markets[index]
      if (!market || !result.data || result.data.length === 0) return
      writeDiscoverySnapshot(
        chainStatsSnapshotKey(market),
        result.data,
        result.dataUpdatedAt,
      )
    })
    // The signature is the change worth reacting to; `results` is a fresh array
    // every render and would run this on each one.
  }, [writeSignature])

  const byMarket = useMemo(() => {
    const map = new Map<string, ChainPoolStats>()
    for (const result of results) {
      for (const row of result.data ?? []) map.set(row.market, row)
    }
    return map.size === 0 ? EMPTY_CHAIN_STATS : map
    // Same reasoning as the writer: rebuild when an answer changed, not when
    // React re-rendered.
  }, [writeSignature])

  // Pending, not `isFetching`: a five-minute refresh of a row that is already
  // on screen is not a row the reader should watch shimmer.
  const pendingSignature = results
    .map((result, index) => (result.isPending ? markets[index] : ''))
    .join('|')
  const pendingMarkets = useMemo(() => {
    if (!active) return EMPTY_PENDING
    const pending = new Set(pendingSignature.split('|').filter(Boolean))
    return pending.size === 0 ? EMPTY_PENDING : pending
  }, [active, pendingSignature])

  // A chain that failed on its own is a dash on one row; the pane's banner is
  // for the case where nothing answered at all, so the failure it names is the
  // first one that came back.
  const failure = results.find((result) => result.error)?.error ?? null

  return {
    byMarket,
    pendingMarkets,
    error: failure ? errorText(failure) : null,
    throttled: results.some((result) => isProviderThrottledError(result.error)),
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
