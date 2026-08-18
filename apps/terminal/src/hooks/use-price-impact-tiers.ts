// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What three fixed dollar sizes actually cost in this pool, quoted rather
 * than modelled.
 *
 * Each tier is a real aggregator quote at that notional, which is why the
 * panes label it aggregator-quoted impact: a router may split across pools
 * this process has never read, so the number can be BETTER than the pool's own
 * curve would give. Modelling it from reserves would be cheaper and wrong.
 *
 * Three quotes per pane view is the price. It is bounded by `enabled` (only a
 * visible pane asks), by react-query's cache (a size already quoted for this
 * pair is reused, including by the route pane), and by a 60s stale window.
 */
import { useQueries } from '@tanstack/react-query'

import type { SwapRouteQuote } from '@pairlens/market-engine/types'
import type { PoolStats } from '@pairlens/shared/instrument-types'

import { fetchSwapRoute, useDexConnectors } from '@/hooks/use-swap-route'
import { impactVsMid, usdToQuoteUnits } from '@/lib/dex/pool-math'

/** The three sizes the pool-stats grid quotes. Fixed, so rows are comparable. */
export const IMPACT_TIER_USD = [1_000, 10_000, 100_000] as const

const TIER_STALE_MS = 60_000

export type ImpactTierRow = {
  usd: number
  /** Fraction; positive is worse than mid. Null when nothing could quote it. */
  impact: number | null
  quote: SwapRouteQuote | null
  isLoading: boolean
}

/**
 * @param stats the pool, for the quote leg's USD price. Without it a dollar
 * size cannot be turned into units of the token being spent, and the grid
 * collapses rather than quoting an amount nobody asked for.
 * @param sizes the notionals to quote. Defaults to the three-size grid the
 * pool-stats pane draws; a pane that prints a single line (the detail pane's
 * "$10k") passes one size and spends one quote instead of three. Query keys
 * are per size, so a caller asking for a subset reuses whatever the fuller
 * grid already cached for the same pair rather than refetching it.
 */
export function usePriceImpactTiers(
  market: string | undefined,
  pairKey: string | undefined,
  stats: PoolStats | null,
  enabled = true,
  sizes: ReadonlyArray<number> = IMPACT_TIER_USD,
): Array<ImpactTierRow> {
  const connectors = useDexConnectors()
  const plugin = market ? (connectors.get(market) ?? null) : null

  // The mid to measure a quote against, in the quote's own direction: buying
  // base with quote, the fill is base-per-quote, so the reference is the
  // inverse of the pool's quoted price.
  const midBasePerQuote =
    stats?.priceInQuote && stats.priceInQuote > 0
      ? 1 / stats.priceInQuote
      : null

  const results = useQueries({
    queries: sizes.map((usd) => {
      const size = usdToQuoteUnits(usd, stats?.quotePriceUsd ?? null)
      const active = Boolean(enabled && plugin && pairKey && size)
      return {
        queryKey: [
          'swap-route',
          market,
          pairKey,
          'buy' as const,
          size === null ? null : Number(size.toPrecision(6)),
        ],
        queryFn: async () =>
          fetchSwapRoute(plugin, {
            market: market ?? '',
            pairKey: pairKey ?? null,
            side: 'buy' as const,
            size: size!,
          }),
        enabled: active,
        staleTime: TIER_STALE_MS,
        gcTime: 5 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      }
    }),
  })

  return sizes.map((usd, index) => {
    const result = results[index]
    const quote = (result?.data ?? null) as SwapRouteQuote | null
    return {
      usd,
      // The aggregator's own figure first; the mid comparison only as the
      // fallback, since it measures against a single pool's price while the
      // route may not have used that pool.
      impact:
        quote?.priceImpact ??
        impactVsMid(quote?.executionPrice ?? null, midBasePerQuote),
      quote,
      isLoading: Boolean(result?.isPending && result.fetchStatus !== 'idle'),
    }
  })
}
