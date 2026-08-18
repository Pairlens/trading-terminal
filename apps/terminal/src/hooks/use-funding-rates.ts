// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Funding, open interest and the settled-rate series, fanned out across every
 * active perpetual-futures venue.
 *
 * Each connector is invoked DIRECTLY rather than through
 * `pluginManager.execute`, for the reasons the prediction and instrument-search
 * fan-outs give: the manager's market context is shared mutable state that
 * concurrent calls fight over, and its resolver picks ONE winner per capability
 * — which is exactly what a matrix of venues is not. A venue's refusal is also
 * a fact the pane has to show ("KuCoin Futures needs the desktop app"), and a
 * resolver that fell through to another venue would hide it behind a column of
 * someone else's numbers.
 *
 * No credentials anywhere. Funding is public data, so the scanners work on a
 * fresh install with nothing connected — which is what makes them worth putting
 * on a discovery board.
 */
import { useMemo } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'
import { isVenueRestBlocked } from '@pairlens/market-engine/platform'
import type { PluginInstance } from '@pairlens/plugin-system/types'
import type {
  FundingHistoryResponse,
  FundingRateEntry,
  FundingSnapshotResponse,
  OpenInterestEntry,
  OpenInterestResponse,
} from '@pairlens/shared/instrument-types'

import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'
import { futuresPluginsFor } from '@/lib/venues/venue-plugins'

/**
 * Funding is recomputed by a venue once a minute at most, and the panes that
 * read it are scanners rather than tickers. The connector holds its own shorter
 * cache underneath, so a second board opening costs nothing.
 */
const FUNDING_STALE_MS = 60_000
const FUNDING_REFETCH_MS = 120_000

/** Open interest is a five-minute number on every venue in the fleet. */
const OI_STALE_MS = 120_000
const OI_REFETCH_MS = 300_000

export type FuturesVenue = {
  plugin: PluginInstance
  market: string
  label: string
}

/** What one venue answered, or why it could not. */
export type FundingVenueResult = {
  market: string
  label: string
  entries: Array<FundingRateEntry>
  /** Set when the venue itself refused; rendered in place of its column. */
  error: string | null
  /** This build cannot reach the venue at all. */
  desktopOnly: boolean
  /**
   * This venue's own sweep is still in flight.
   *
   * A result exists for a pending venue on purpose: the panes draw its column
   * from the moment the board mounts and fill the cells when it answers, so a
   * slow venue costs the reader a shimmering column rather than an empty pane.
   */
  pending: boolean
}

export type OpenInterestVenueResult = {
  market: string
  label: string
  entries: Array<OpenInterestEntry>
  /** False when the venue publishes no open interest at all. */
  supported: boolean
  error: string | null
  desktopOnly: boolean
}

/** Every active venue that answers `market-data:funding`. */
export function useFuturesFundingVenues(): Array<FuturesVenue> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () =>
      futuresPluginsFor(
        pluginManager.getActivePlugins(),
        'market-data:funding',
      ),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )
}

type ExecuteInput = {
  venue: FuturesVenue
  params: Record<string, unknown>
}

async function callVenue({ venue, params }: ExecuteInput): Promise<unknown> {
  return venue.plugin.execute({
    capability: 'market-data:funding',
    params,
    context: {
      pair: '',
      market: venue.market,
      timeframe: '',
      mode: 'paper' as const,
      country: getCountrySetting(),
    },
  })
}

/**
 * A venue this build provably cannot reach, known before it is asked.
 *
 * The connector refuses these itself with a `PlatformRestrictedError`, and
 * that refusal stays authoritative. Knowing it up front is a rendering matter:
 * a board that asks all five venues draws five columns and then drops two the
 * instant the refusals land, which is a visible reflow on every page load of
 * the hosted terminal. Skipping the ask keeps the column count right from the
 * first paint, and saves two plugin calls.
 *
 * `isVenueRestBlocked(true)` is the deliberately conservative form: it asks
 * whether the venue is blocked EVEN IF it declares a dev proxy. Under `bun run
 * dev` a proxy exists, so nothing is pre-marked and the connector's own rule
 * decides; in a production browser no proxy can exist, so pre-marking cannot
 * disagree with it.
 */
function venueUnreachable(venue: FuturesVenue): boolean {
  return (
    venue.plugin.manifest.metadata?.['requiresDesktop'] === true &&
    isVenueRestBlocked(true)
  )
}

/** A thrown venue failure as the two facts a pane renders differently. */
function describeFailure(err: unknown): {
  error: string | null
  desktopOnly: boolean
} {
  if (isPlatformRestrictedError(err)) return { error: null, desktopOnly: true }
  return {
    error: err instanceof Error ? err.message : String(err),
    desktopOnly: false,
  }
}

export type FundingScope = {
  /**
   * Exact contracts to ask about. What the belt uses: it wants one, and naming
   * it skips a venue-wide sweep entirely.
   */
  pairs?: Array<string>
  /**
   * Assets to ask about, resolved venue-side against each venue's own markets
   * table. This is how a scanner reaches KuCoin Futures, which declares
   * `fetchFundingRates: false` and answers one contract per call: the caller
   * never has to guess that KuCoin spells BTC `XBTUSDTM`. Venues that CAN sweep
   * ignore the hint and return their whole universe.
   */
  bases?: Array<string>
  /**
   * Hold the sweep until the caller's hint set is settled.
   *
   * The scanners derive `bases` from the top-coins snapshot, which lands a
   * moment after the board mounts. Sweeping before it arrives and again after
   * would spend two rounds of REST on every venue and repaint a full matrix
   * back to skeletons when the second round started, because a changed hint is
   * a changed cache key. Held queries report `pending`, so the panes shimmer
   * through the wait instead of claiming the venues answered with nothing.
   */
  enabled?: boolean
}

/**
 * Current funding for the contracts each venue lists — ONE QUERY PER VENUE.
 *
 * The fan-out used to be a single `Promise.all` under one cache key, which
 * made the whole board as slow as its slowest exchange: Binance answers a
 * venue-wide sweep in a few hundred milliseconds, KuCoin walks twenty-five
 * contracts one REST call at a time, and the matrix showed nothing at all
 * until the last one landed. Per venue, a column paints the moment its own
 * exchange answers, and a venue that hangs never holds the others hostage.
 *
 * It also fixes the cache: the old key carried the whole venue list, so
 * installing a second perp connector threw away the first one's rates and
 * blanked a board that had been full a second earlier.
 */
export function useFundingRates(
  venues: Array<FuturesVenue>,
  scopeInput: FundingScope = {},
) {
  const { pairs, bases, enabled = true } = scopeInput
  const scope = `${pairs ? [...pairs].sort().join(',') : ''}|${bases?.join(',') ?? ''}`
  const unreachable = venues.map(venueUnreachable)

  return useQueries({
    queries: venues.map((venue, index) => ({
      queryKey: ['futures-funding', venue.market, scope],
      queryFn: async (): Promise<FundingVenueResult> => {
        try {
          const response = (await callVenue({
            venue,
            params: {
              action: 'funding-rates',
              ...(pairs && pairs.length > 0 ? { pairs } : {}),
              ...(bases && bases.length > 0 ? { bases } : {}),
            },
          })) as FundingSnapshotResponse
          return {
            market: venue.market,
            label: venue.label,
            entries: Array.isArray(response?.entries) ? response.entries : [],
            error: null,
            desktopOnly: false,
            pending: false,
          }
        } catch (err) {
          return {
            market: venue.market,
            label: venue.label,
            entries: [],
            ...describeFailure(err),
            pending: false,
          }
        }
      },
      enabled: enabled && !unreachable[index],
      staleTime: FUNDING_STALE_MS,
      refetchInterval: FUNDING_REFETCH_MS,
      gcTime: 10 * 60_000,
    })),
    combine: (results) => {
      // A venue still in flight keeps its place in the array so the panes can
      // draw its column and shimmer the cells. The order is the venue order,
      // which is what makes the columns stable as answers arrive.
      const data = results.map((result, index): FundingVenueResult => {
        const venue = venues[index]
        const base = {
          market: venue?.market ?? '',
          label: venue?.label ?? '',
          entries: [],
          error: null,
        }
        if (unreachable[index]) {
          return { ...base, desktopOnly: true, pending: false }
        }
        return result.data ?? { ...base, desktopOnly: false, pending: true }
      })
      // Both flags count only the venues actually being asked. A board that
      // waited on the unreachable ones — whose queries are disabled and so
      // report `pending` forever — would shimmer for the rest of the session.
      const asked = results.filter((_, index) => !unreachable[index])
      return {
        data,
        /** Nothing at all has landed yet. */
        isPending: asked.length > 0 && asked.every((r) => r.isPending),
        /** At least one venue is still sweeping — the board is filling in. */
        isSettling: asked.some((r) => r.isPending),
      }
    },
  })
}

/**
 * Open interest for a NAMED set of contracts.
 *
 * Bounded by construction: most of the venues answer one symbol per REST
 * call, so the pane asks only about the contracts it is already showing. A
 * `history` pass costs a second call per contract and is what fills the 24h
 * change bar; venues that serve no series simply come back without one.
 */
export function useOpenInterest(
  venues: Array<FuturesVenue>,
  pairsByMarket: Record<string, Array<string>>,
  history = true,
) {
  const markets = venues
    .map((v) => v.market)
    .sort()
    .join(',')
  const scope = Object.entries(pairsByMarket)
    .map(([market, pairs]) => `${market}:${[...pairs].sort().join('|')}`)
    .sort()
    .join(',')

  return useQuery({
    queryKey: ['futures-open-interest', markets, scope, history],
    queryFn: async (): Promise<Array<OpenInterestVenueResult>> =>
      Promise.all(
        venues.map(async (venue) => {
          const pairs = pairsByMarket[venue.market] ?? []
          if (pairs.length === 0) {
            return {
              market: venue.market,
              label: venue.label,
              entries: [],
              supported: true,
              error: null,
              desktopOnly: false,
            }
          }
          try {
            const response = (await callVenue({
              venue,
              params: { action: 'open-interest', pairs, history },
            })) as OpenInterestResponse
            return {
              market: venue.market,
              label: venue.label,
              entries: Array.isArray(response?.entries) ? response.entries : [],
              supported: response?.supported !== false,
              error: null,
              desktopOnly: false,
            }
          } catch (err) {
            return {
              market: venue.market,
              label: venue.label,
              entries: [],
              supported: true,
              ...describeFailure(err),
            }
          }
        }),
      ),
    enabled: venues.length > 0 && scope !== '',
    staleTime: OI_STALE_MS,
    refetchInterval: OI_REFETCH_MS,
    gcTime: 10 * 60_000,
  })
}

/**
 * The settled-rate series for one contract on one venue.
 *
 * What the belt's 8h / 24h / 7d figures are summed from. Refetched slowly: a
 * new point only exists once per settlement, which is hourly at best.
 */
export function useFundingHistory(
  venue: FuturesVenue | null,
  pair: string,
  limit = 200,
) {
  return useQuery({
    queryKey: ['futures-funding-history', venue?.market ?? '', pair, limit],
    queryFn: async (): Promise<FundingHistoryResponse | null> => {
      if (!venue) return null
      return (await callVenue({
        venue,
        params: { action: 'funding-history', pair, limit },
      })) as FundingHistoryResponse
    },
    enabled: venue !== null && pair !== '',
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    gcTime: 30 * 60_000,
    // A venue with no public history is a missing figure on one belt cell, not
    // a reason to retry a refusal three times per mount.
    retry: false,
  })
}

/** Stamps covering 30 days of hourly settlement, which is the densest clock. */
const HISTORY_STAMPS_30D = 720

/**
 * A settled series only gains a point once per settlement, and the rail reads
 * it as a 30-day distribution rather than a live number. Fifteen minutes is
 * therefore already far more often than the answer can change.
 */
const HISTORIES_STALE_MS = 15 * 60_000

/** Histories in flight at once, across every venue. */
const HISTORY_CONCURRENCY = 4

export type FundingHistoryTarget = { market: string; pair: string }

/** `market:pair`, the key a caller looks a resolved history up by. */
export function fundingHistoryKey(market: string, pair: string): string {
  return `${market}:${pair}`
}

/**
 * A 30-day settled series for each of a bounded set of contracts.
 *
 * ONE subscription for the whole batch rather than a hook per contract: the
 * extremes rail asks about up to sixteen contracts at once, and sixteen
 * `useQuery` calls would be sixteen subscriptions re-rendering the pane
 * independently as each landed. The fan-out inside is paced at
 * `HISTORY_CONCURRENCY`, because these share the same unauthenticated budget
 * the chart's backfill draws on.
 *
 * Each contract still gets its OWN cache entry, filled through `fetchQuery`
 * rather than fetched inline. That is what makes the rail affordable: its
 * candidate list is redrawn every time funding refreshes, and a batch cached
 * as one blob would re-read a month of stamps for fifteen unchanged contracts
 * because the sixteenth swapped out. Here a churned candidate costs exactly one
 * request, and the entry it shares with the belt's `useFundingHistory` is the
 * same shape at the same key.
 *
 * A venue that publishes no history for a contract simply has no entry in the
 * answer. That is the pane's cue to fall back to what it can source, not an
 * error worth surfacing: Kraken serves a series, KuCoin does not, and the rail
 * must read correctly either way.
 */
export function useFundingHistories(
  venues: Array<FuturesVenue>,
  targets: Array<FundingHistoryTarget>,
  limit = HISTORY_STAMPS_30D,
) {
  const client = useQueryClient()
  const byMarket = useMemo(() => {
    const map = new Map<string, FuturesVenue>()
    for (const venue of venues) map.set(venue.market, venue)
    return map
  }, [venues])

  const scope = targets
    .map((t) => fundingHistoryKey(t.market, t.pair))
    .sort()
    .join(',')

  return useQuery({
    queryKey: ['futures-funding-histories', scope, limit],
    queryFn: async (): Promise<Array<FundingHistoryResponse>> => {
      const wanted = targets.filter((target) => byMarket.has(target.market))
      const settled = await mapWithConcurrency(
        wanted,
        HISTORY_CONCURRENCY,
        async (target) => {
          const venue = byMarket.get(target.market)
          if (!venue) throw new Error(`No venue for ${target.market}`)
          return client.fetchQuery({
            queryKey: [
              'futures-funding-history',
              target.market,
              target.pair,
              limit,
            ],
            queryFn: async (): Promise<FundingHistoryResponse> =>
              (await callVenue({
                venue,
                params: {
                  action: 'funding-history',
                  pair: target.pair,
                  limit,
                },
              })) as FundingHistoryResponse,
            staleTime: HISTORIES_STALE_MS,
            gcTime: 30 * 60_000,
            retry: false,
          })
        },
      )
      const out: Array<FundingHistoryResponse> = []
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue
        if (!result.value || !Array.isArray(result.value.points)) continue
        out.push(result.value)
      }
      return out
    },
    enabled: scope !== '',
    staleTime: HISTORIES_STALE_MS,
    gcTime: 30 * 60_000,
    refetchInterval: HISTORIES_STALE_MS,
    retry: false,
  })
}

/**
 * Run `task` over `items` with at most `limit` in flight, never rejecting.
 *
 * One venue refusing a contract must not take the other fifteen answers down
 * with it, which is what `Promise.all` would do — and firing all sixteen at
 * once would put the board's first paint behind its own sweep.
 */
async function mapWithConcurrency<TIn, TOut>(
  items: Array<TIn>,
  limit: number,
  task: (item: TIn) => Promise<TOut>,
): Promise<Array<PromiseSettledResult<TOut>>> {
  const results = new Array<PromiseSettledResult<TOut>>(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor++
        if (index >= items.length) return
        try {
          results[index] = {
            status: 'fulfilled',
            value: await task(items[index]),
          }
        } catch (reason) {
          results[index] = { status: 'rejected', reason }
        }
      }
    }),
  )
  return results
}
