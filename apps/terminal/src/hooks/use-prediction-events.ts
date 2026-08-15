// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event browser's data: `market-data:events`, fanned out across every
 * active prediction venue.
 *
 * Each connector is invoked DIRECTLY rather than through
 * `pluginManager.execute`. Two reasons, both the ones the instrument search
 * fan-out gives: the manager's market context is shared mutable state that
 * concurrent calls would fight over, and its resolver picks a single winner
 * per capability — which is exactly what a fan-out is not. A venue's failure
 * is also a fact the pane has to show ("Kalshi needs the desktop app"), and a
 * resolver that silently fell through to another venue would hide it.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'
import type { PluginInstance } from '@pairlens/plugin-system/types'
import type {
  PredictionEventSummary,
  PredictionEventsResponse,
} from '@pairlens/shared/instrument-types'

import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'
import { predictionPluginsFor } from '@/lib/venues/venue-plugins'

/** Events fetched per venue per browse. */
const EVENTS_LIMIT = 30

export type PredictionVenue = {
  plugin: PluginInstance
  market: string
  label: string
}

export type PredictionVenueResult = {
  market: string
  label: string
  events: Array<PredictionEventSummary>
  /** Set when the venue itself refused — shown in place of that venue's rows. */
  error: string | null
  /** The venue cannot answer from a browser build at all. */
  desktopOnly: boolean
}

export function usePredictionVenues(): Array<PredictionVenue> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () =>
      predictionPluginsFor(
        pluginManager.getActivePlugins(),
        'market-data:events',
      ),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )
}

export type PredictionEventsOptions = {
  /**
   * EVERY active prediction venue, always — never the user's current venue
   * filter. The filter is a view over this result, applied at render: folding
   * it into the fetch made each chip its own react-query entry, so picking one
   * refetched data the "all" entry already held and re-paid a desktop-only
   * venue's failing request on every switch.
   */
  venues: Array<PredictionVenue>
  query: string
  category: string | null
  limit?: number
}

export function usePredictionEvents({
  venues,
  query,
  category,
  limit = EVENTS_LIMIT,
}: PredictionEventsOptions) {
  const markets = venues
    .map((v) => v.market)
    .sort()
    .join(',')

  return useQuery({
    queryKey: ['prediction-events', markets, query, category, limit],
    queryFn: async (): Promise<Array<PredictionVenueResult>> => {
      const country = getCountrySetting()
      return Promise.all(
        venues.map(async ({ plugin, market, label }) => {
          try {
            const response = (await plugin.execute({
              capability: 'market-data:events',
              params: {
                ...(query ? { query } : {}),
                ...(category ? { category } : {}),
                limit,
              },
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
    // Event boards move on the scale of minutes, not ticks; the outcome prices
    // on a card are a browse aid, and a chart is one click away for the real
    // thing.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}

/** Categories the returned events actually carry, deduped and sorted. */
export function categoriesOf(
  results: Array<PredictionVenueResult> | undefined,
): Array<string> {
  const seen = new Set<string>()
  for (const result of results ?? []) {
    for (const event of result.events) {
      if (event.category) seen.add(event.category)
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}
