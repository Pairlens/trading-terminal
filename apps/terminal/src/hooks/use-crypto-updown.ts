// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The crypto up/down scanner's three feeds, and why they are three.
 *
 * The board joins data from two different asset classes, which is the whole
 * reason it can say something the venues cannot:
 *
 *  - **The windows** come from `market-data:events` with the `crypto-updown`
 *    preset, fanned out across every active prediction venue the same way the
 *    events browser fans out — directly per connector, never through the
 *    resolver, because a fan-out has no single winner and a venue's refusal
 *    ("Kalshi needs the desktop app") is a fact the pane has to show.
 *  - **Spot** rides the bulk ticker snapshots the whole terminal already
 *    shares. Free: one REST call per CEX every sixty seconds, already in
 *    flight for the watchlist.
 *  - **The settlement candles** are the only thing this board asks for on its
 *    own — one five-minute history per settlement pair, which serves both the
 *    Polymarket reference (the open of the window's candle, and the open of the
 *    5m bar starting on the hour IS that number) and the volatility behind the
 *    model column. Five minutes rather than an hour because volatility is a
 *    function of sampling frequency and these contracts settle in minutes: see
 *    `SETTLEMENT_TIMEFRAME`.
 *
 * The window fetch is on a thirty-second cadence rather than the events
 * browser's minute. A Kalshi window is fifteen minutes long: at sixty seconds
 * a row could be a fifteenth of its life stale, and the last minute before a
 * close is when the board is being read hardest.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'

import type {
  PredictionVenue,
  PredictionVenueResult,
} from '@/hooks/use-prediction-events'
import type { Candle } from '@pairlens/shared/types'
import type { PredictionEventsResponse } from '@pairlens/shared/instrument-types'
import {
  SETTLEMENT_TIMEFRAME,
  VOL_SAMPLE_BARS,
} from '@/lib/predictions/crypto-updown'
import { getCountrySetting } from '@/lib/region-settings'
import { useMarketData } from '@/lib/market-data-provider'
import { usePairlens } from '@/lib/pairlens-provider'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { venuePluginsFor } from '@/lib/venues/venue-plugins'
import { CHART_SEED_BARS } from '@/lib/predictions/updown-focus'

/** How often the open windows are re-read. See the note above. */
const WINDOWS_REFETCH_MS = 30_000

/**
 * Where the settlement candles are read from, when that venue is installed.
 *
 * Polymarket's rules name Binance explicitly ("the resolution source for this
 * market is Binance, specifically the BTC/USDT pair"), so its reference is the
 * Binance bar and nothing else. Any other venue's BTC-USDT is within a few
 * basis points, which is fine for the volatility estimate and NOT fine for a
 * reference the contract settles on — hence the preference, and hence the
 * `referenceState` a row carries so the pane can say which it got.
 */
const SETTLEMENT_VENUE = 'binance'

export type SpotHistory = {
  candles: Array<Candle> | undefined
  state: 'pending' | 'ready' | 'unavailable'
}

/**
 * Every open up/down window across every active prediction venue.
 *
 * A venue with no such contracts answers with an empty list rather than an
 * error, so a terminal running one prediction connector shows that connector's
 * slate and nothing missing.
 */
export function useCryptoUpDownWindows(venues: Array<PredictionVenue>) {
  const markets = venues
    .map((v) => v.market)
    .sort()
    .join(',')

  return useQuery({
    queryKey: ['crypto-updown', markets],
    queryFn: async (): Promise<Array<PredictionVenueResult>> => {
      const country = getCountrySetting()
      return Promise.all(
        venues.map(async ({ plugin, market, label }) => {
          try {
            const response = (await plugin.execute({
              capability: 'market-data:events',
              params: { preset: 'crypto-updown' },
              context: {
                pair: '',
                market,
                timeframe: '',
                mode: 'paper' as const,
                country,
              },
            })) as PredictionEventsResponse
            return {
              market,
              label,
              events: Array.isArray(response?.events) ? response.events : [],
              error: null,
              desktopOnly: false,
            }
          } catch (err) {
            return {
              market,
              label,
              events: [],
              error: isPlatformRestrictedError(err)
                ? null
                : err instanceof Error
                  ? err.message
                  : String(err),
              desktopOnly: isPlatformRestrictedError(err),
            }
          }
        }),
      )
    },
    enabled: venues.length > 0,
    refetchInterval: WINDOWS_REFETCH_MS,
    staleTime: WINDOWS_REFETCH_MS - 5_000,
    gcTime: 5 * 60_000,
    // The one query in the terminal that opts back INTO focus refetching (the
    // client turns it off globally). React Query parks `refetchInterval` while
    // the document is hidden, and the sockets behind spot and the countdown do
    // not park with it — so a tab returned to after ten minutes paints a live
    // price and a live clock against a probability from ten minutes ago, and
    // the edge between them is nonsense. Two requests on refocus is a cheap
    // price for the card not lying in the moment someone looks back at it.
    refetchOnWindowFocus: true,
  })
}

/**
 * Settlement candles for each pair, keyed by pair.
 *
 * One query per pair rather than one per row: five pairs serve thirteen rows,
 * and the Polymarket daily and hourly contracts on the same asset read the
 * same series. `useQueries` rather than a single query over the whole set so a
 * pair that no installed venue lists fails alone.
 *
 * Three hundred five-minute bars is just over 25 hours. The depth is set by the
 * REFERENCE rather than by the volatility: it has to reach back past the
 * furthest one a row can name, twenty-four hours for a daily window that has
 * just opened. The volatility sample rides along in the same fetch.
 */
export function useSpotHistories(
  pairs: Array<string>,
): Map<string, SpotHistory> {
  const { fetchHistory, probeVenueHistory } = useMarketData()
  const resolvePreferred = usePreferredMarketResolver()
  const fallbackVenue = resolvePreferred('crypto-spot')

  return useQueries({
    queries: pairs.map((pair) => ({
      queryKey: ['updown-history', pair, fallbackVenue],
      queryFn: async (): Promise<Array<Candle>> => {
        // The settlement venue first, with no fallback — `probeVenueHistory`
        // returns null rather than letting another connector answer on
        // Binance's behalf, which is exactly right when the question is "what
        // did the bar this contract settles on open at".
        const settlement = probeVenueHistory(
          SETTLEMENT_VENUE,
          pair,
          SETTLEMENT_TIMEFRAME,
          VOL_SAMPLE_BARS,
        )
        if (settlement) {
          const candles = await settlement
          if (candles.length > 0) return candles
        }
        return fetchHistory(
          fallbackVenue,
          pair,
          SETTLEMENT_TIMEFRAME,
          VOL_SAMPLE_BARS,
        )
      },
      // The FORMING bar is what a reference reads on a window that just
      // opened, so the refresh has to be finer than the bar. A minute matches
      // the bulk quotes beside it.
      refetchInterval: 60_000,
      staleTime: 55_000,
      gcTime: 10 * 60_000,
      retry: 1,
    })),
    // `combine` rather than a `useMemo` over the returned array: `useQueries`
    // hands back a fresh array on every render, so a memo keyed on it would
    // rebuild the map each time the countdown ticked. TanStack memoises this
    // on the underlying query results instead, which is the thing that
    // actually moves.
    combine: (results) => {
      const map = new Map<string, SpotHistory>()
      for (const [index, result] of results.entries()) {
        const pair = pairs[index]
        if (!pair) continue
        map.set(pair, {
          candles: result.data,
          state: result.isError
            ? 'unavailable'
            : result.data
              ? 'ready'
              : 'pending',
        })
      }
      return map
    },
  })
}

/**
 * The venue the focus card streams its tape from.
 *
 * The settlement venue when its connector is installed, and the user's
 * preferred spot venue otherwise. The preference is not cosmetic here: this
 * card's whole claim is "here is the price your contract settles against, live",
 * and Polymarket's rules name Binance's BTC/USDT specifically. Another venue's
 * BTC-USDT is within a few basis points, which is close enough to watch and not
 * close enough to call the settlement price — so the card names the venue it is
 * actually reading beside the number.
 */
export function useUpDownSpotVenue(): {
  market: string
  /** The connector's own display name, for the card to credit. */
  label: string
  isSettlement: boolean
} {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const resolvePreferred = usePreferredMarketResolver()
  const fallback = resolvePreferred('crypto-spot')

  return useMemo(() => {
    const venues = venuePluginsFor(
      pluginManager.getActivePlugins(),
      'market-data:ticker',
      'cex',
    )
    const settlement = venues.find((v) => v.market === SETTLEMENT_VENUE)
    if (settlement) {
      return {
        market: settlement.market,
        label: settlement.label,
        isSettlement: true,
      }
    }
    const chosen = venues.find((v) => v.market === fallback)
    return {
      market: fallback,
      label: chosen?.label ?? fallback,
      isSettlement: fallback === SETTLEMENT_VENUE,
    }
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion, fallback])
}

/**
 * Minute candles for the focused window, so its chart has a shape on mount.
 *
 * One pair at a time, and only the focused one: this is the one request the
 * focus card adds over the scanner it replaces, and it is what stops the chart
 * from growing a line out of the right edge over the first thirty seconds of
 * looking at it. Refreshed on the minute like the hourly series beside it; the
 * live tape carries everything finer.
 */
export function useUpDownMinuteCandles(
  pair: string | null,
  market: string,
): Array<Candle> | undefined {
  const { fetchHistory } = useMarketData()

  const query = useQuery({
    queryKey: ['updown-minutes', market, pair],
    queryFn: () => fetchHistory(market, pair as string, '1m', CHART_SEED_BARS),
    enabled: Boolean(pair),
    refetchInterval: 60_000,
    staleTime: 55_000,
    gcTime: 5 * 60_000,
    retry: 1,
  })

  return query.data
}
