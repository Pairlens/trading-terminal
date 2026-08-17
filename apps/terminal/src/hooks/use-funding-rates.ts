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
import { useQuery } from '@tanstack/react-query'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'
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
}

/** Current funding for the contracts each venue lists. */
export function useFundingRates(
  venues: Array<FuturesVenue>,
  scopeInput: FundingScope = {},
) {
  const { pairs, bases } = scopeInput
  const markets = venues
    .map((v) => v.market)
    .sort()
    .join(',')
  const scope = `${pairs ? [...pairs].sort().join(',') : ''}|${bases?.join(',') ?? ''}`

  return useQuery({
    queryKey: ['futures-funding', markets, scope],
    queryFn: async (): Promise<Array<FundingVenueResult>> =>
      Promise.all(
        venues.map(async (venue) => {
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
            }
          } catch (err) {
            return {
              market: venue.market,
              label: venue.label,
              entries: [],
              ...describeFailure(err),
            }
          }
        }),
      ),
    enabled: venues.length > 0,
    staleTime: FUNDING_STALE_MS,
    refetchInterval: FUNDING_REFETCH_MS,
    gcTime: 10 * 60_000,
  })
}

/**
 * Open interest for a NAMED set of contracts.
 *
 * Bounded by construction: two of the three venues answer one symbol per REST
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
