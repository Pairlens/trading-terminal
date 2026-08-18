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

/**
 * Events fetched per venue per browse, in ONE request each.
 *
 * A hundred rather than thirty. Both venues serve the whole page in a single
 * call — gamma's `/events` and Kalshi's event index both take the limit
 * straight through, and the connector clamps at 200 — so the cost of the wider
 * board is one larger response every sixty seconds, not more round trips. What
 * it buys is a category rail with real counts and a search box that can find
 * something without asking the venue: thirty events was roughly one screen of
 * cards, and the rail underneath it counted the same thirty.
 */
const EVENTS_LIMIT = 100

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

// ── One event, by id ─────────────────────────────────────────────────────
//
// The browse above is a fan-out over every venue; this is the opposite call
// and deserves its own query rather than a filter over that one. A prediction
// pair key IS an event id, so this is what a shared link, a reloaded tab and a
// watchlist row all resolve through: one venue, one id, one request, and an
// answer that cannot be the wrong event because nothing was searched for.

export type PredictionEventLookup = {
  event: PredictionEventSummary | null
  state: 'loading' | 'ready' | 'not-found' | 'desktop-only' | 'error'
  error: string | null
}

/**
 * The event a prediction pair key names.
 *
 * `enabled` is how a caller says "this pair is not a prediction" without
 * violating the rules of hooks — the route calls this unconditionally and the
 * non-prediction classes simply never fetch.
 *
 * A minute of stale time, matching the browse: an event's shape (its runners,
 * its rules, its close time) changes on the scale of a listing, and the prices
 * on it are a reading aid. Live prices come off the streaming contexts.
 */
export function usePredictionEventById({
  venue,
  eventId,
  enabled = true,
}: {
  venue: PredictionVenue | null
  eventId: string
  enabled?: boolean
}): PredictionEventLookup {
  const query = useQuery({
    queryKey: ['prediction-event', venue?.market ?? '', eventId],
    queryFn: async (): Promise<PredictionVenueResult> => {
      const country = getCountrySetting()
      const { plugin, market, label } = venue!
      try {
        const response = (await plugin.execute({
          capability: 'market-data:events',
          params: { eventId, limit: 1 },
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
    },
    enabled: enabled && Boolean(venue) && eventId.trim() !== '',
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })

  return useMemo(() => {
    const result = query.data
    if (query.isLoading && !result) {
      return { event: null, state: 'loading' as const, error: null }
    }
    if (result?.desktopOnly) {
      return { event: null, state: 'desktop-only' as const, error: null }
    }
    if (result?.error) {
      return { event: null, state: 'error' as const, error: result.error }
    }
    if (query.error) {
      return {
        event: null,
        state: 'error' as const,
        error:
          query.error instanceof Error
            ? query.error.message
            : String(query.error),
      }
    }
    // The venue answers a miss with an empty list rather than an error, and
    // the two mean different things to the caller: a closed or delisted event
    // still has a pinned title worth printing, an error does not.
    const event = matchEvent(result?.events ?? [], eventId)
    if (!event) return { event: null, state: 'not-found' as const, error: null }
    return { event, state: 'ready' as const, error: null }
  }, [query.data, query.error, query.isLoading, eventId])
}

/**
 * The event whose id was asked for.
 *
 * Both venues answer an id lookup with a list, and Polymarket's gamma
 * `/events?id=` has been seen returning a neighbour alongside the match. The
 * comparison is case-insensitive because a pair key travels through a URL,
 * where a Kalshi ticker survives being lower-cased by a mail client.
 */
function matchEvent(
  events: Array<PredictionEventSummary>,
  eventId: string,
): PredictionEventSummary | null {
  const needle = eventId.trim().toLowerCase()
  const exact = events.find((e) => e.id.trim().toLowerCase() === needle)
  return exact ?? events[0] ?? null
}
