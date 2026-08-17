// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The aggregator's split for a size, read without committing to it.
 *
 * Calls the chain's connector DIRECTLY rather than through
 * `pluginManager.execute`, for the reason every venue-addressed question does:
 * the manager resolves one winner for `trading:orders` against its own shared
 * market context, and the chain ladder asks five chains the same question at
 * once. Direct calls also keep the market explicit, which is what stops a
 * Base quote being answered by the Solana connector.
 *
 * Nothing on this path signs. `action: 'quote'` returns a data shape with no
 * calldata and no transaction in it, and it runs before either connector
 * looks at a wallet slot, so a preview works with no account connected.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { SwapRouteQuote } from '@pairlens/market-engine/types'

import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'
import { venuePluginsFor } from '@/lib/venues/venue-plugins'

/**
 * A quote is a live price and goes stale fast, but every refresh is an
 * aggregator round trip. 45s keeps the route pane honest without turning a
 * parked workspace into a polling loop; the impact grid reuses the same
 * entries through react-query rather than quoting the same size twice.
 */
const QUOTE_STALE_MS = 45_000

/** Connector plugins by market id, for every installed DEX chain. */
export function useDexConnectors(): Map<string, PluginInstance> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () =>
      new Map(
        venuePluginsFor(
          pluginManager.getActivePlugins(),
          'trading:orders',
          'dex',
        ).map((venue) => [venue.market, venue.plugin]),
      ),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )
}

export type SwapRouteRequest = {
  market: string | undefined
  pairKey: string | undefined
  side: 'buy' | 'sell'
  /** Size in INPUT-token units: a buy spends the quote leg, a sell the base. */
  size: number | null
}

export type SwapRouteResult = {
  quote: SwapRouteQuote | null
  isLoading: boolean
  /** The aggregator has no route for this pair at this size. */
  noRoute: boolean
  error: string | null
}

/**
 * `plugin` and `pairKey` are nullable on purpose. Every caller builds its
 * queries before it knows whether the chain has a connector or the pair has
 * two legs, and `enabled` already keeps those from running — so the guard
 * lives here rather than as a non-null assertion at four call sites, one of
 * which would eventually be wrong.
 */
export async function fetchSwapRoute(
  plugin: PluginInstance | null,
  request: {
    market: string
    pairKey: string | null
    side: 'buy' | 'sell'
    size: number
  },
): Promise<SwapRouteQuote | null> {
  if (!plugin || !request.pairKey) return null
  return (await plugin.execute({
    capability: 'trading:orders',
    params: {
      action: 'quote',
      pair: request.pairKey,
      side: request.side,
      // A string, deliberately: the connectors scale to raw token units with
      // integer math, and a float here would lose the tail of a memecoin size.
      size: formatSize(request.size),
    },
    context: {
      pair: request.pairKey,
      market: request.market,
      timeframe: '',
      mode: 'paper' as const,
      country: getCountrySetting(),
    },
  })) as SwapRouteQuote | null
}

export function useSwapRoute(
  request: SwapRouteRequest,
  enabled = true,
): SwapRouteResult {
  const connectors = useDexConnectors()
  const plugin = request.market
    ? (connectors.get(request.market) ?? null)
    : null
  const size = request.size !== null && request.size > 0 ? request.size : null
  const active = Boolean(enabled && plugin && request.pairKey && size)

  const query = useQuery({
    queryKey: [
      'swap-route',
      request.market,
      request.pairKey,
      request.side,
      // Quantized so a size typed one digit at a time does not fire a quote
      // per keystroke; the pane debounces on top of this.
      size === null ? null : Number(size.toPrecision(6)),
    ],
    queryFn: async () =>
      fetchSwapRoute(plugin, {
        market: request.market ?? '',
        pairKey: request.pairKey ?? null,
        side: request.side,
        size: size!,
      }),
    enabled: active,
    staleTime: QUOTE_STALE_MS,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  return {
    quote: query.data ?? null,
    isLoading: active && query.isPending,
    noRoute: query.isSuccess && query.data === null,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
  }
}

/** Enough precision for any token size, without exponent notation. */
function formatSize(size: number): string {
  return size.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 18,
  })
}
