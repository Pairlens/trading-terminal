// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Aggregate liquidation clusters for one perpetual contract.
 *
 * One plugin answers `market-data:liquidations` today (`pairlens-intelligence`,
 * reading the App Server's collector), and it is still called DIRECTLY rather
 * than through `pluginManager.execute`. The reason is the same one the funding
 * fan-out gives, inverted: the resolver's wildcard fallback would let SOME
 * plugin answer for a venue nobody collects, and "this venue has no aggregate
 * feed" is a fact the pane must show rather than a gap to paper over. Reading
 * the manifest's own `markets` list settles that without spending a request.
 *
 * The window is part of the query key on purpose. A 1h and a 24h view are
 * different answers to different questions, and sharing one cache entry between
 * them would make the chips look broken for a minute after each switch.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type {
  LiquidationClustersResponse,
  LiquidationsUnavailableReason,
  LiquidationsUnavailableResponse,
} from '@pairlens/shared/instrument-types'

import { hasAppServer } from '@/lib/auth-client'
import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'

/** The collector aggregates by the minute; asking faster only re-reads a cache. */
const CLUSTERS_REFETCH_MS = 60_000
const CLUSTERS_STALE_MS = 55_000

export type LiquidationClustersResult = {
  data: LiquidationClustersResponse | null
  isLoading: boolean
  /**
   * Why there is no strip, when there is none. `standalone` is this build
   * having no App Server at all, which is a deployment fact rather than a
   * venue one and so is not in the wire taxonomy.
   */
  unavailable: LiquidationsUnavailableReason | 'standalone' | null
  /** For `collecting`: when the collector started watching the venue. */
  trackedSince: number | null
  error: string | null
}

const NO_CLUSTERS: LiquidationClustersResult = {
  data: null,
  isLoading: false,
  unavailable: null,
  trackedSince: null,
  error: null,
}

type ClustersAnswer =
  | LiquidationClustersResponse
  | LiquidationsUnavailableResponse

function isUnavailable(
  answer: ClustersAnswer,
): answer is LiquidationsUnavailableResponse {
  return 'error' in answer && answer.error === 'liquidations_unavailable'
}

export function useLiquidationClusters(
  market: string,
  pairKey: string,
  hours: number,
  enabled = true,
): LiquidationClustersResult {
  const { pluginManager, pluginsReady, pluginStateVersion } = usePairlens()

  // The plugin that declares this venue by name. A wildcard declaration is a
  // data source that claims everything, which for a per-venue collector would
  // be a claim it cannot keep. Lowest priority number wins, as everywhere else
  // in the plugin system: two plugins can claim one venue now (the App
  // Server's free collector at 5, a BYOK vendor at 20), and picking by
  // registration order made the answer depend on ledger insertion order.
  const provider = useMemo(() => {
    if (!market) return null
    let best: PluginInstance | null = null
    let bestPriority = Number.POSITIVE_INFINITY
    for (const plugin of pluginManager.getActivePlugins()) {
      for (const capability of plugin.manifest.capabilities) {
        if (capability.id !== 'market-data:liquidations') continue
        if (!capability.markets.includes(market)) continue
        if (capability.priority < bestPriority) {
          bestPriority = capability.priority
          best = plugin
        }
      }
    }
    return best
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion, market])

  // No hasAppServer gate: a BYOK provider (Coinglass) needs no App Server, so
  // whether a build is standalone says nothing about whether a provider can
  // answer. The distinction returns below, where no provider exists at all.
  const active = Boolean(enabled && pluginsReady && provider && pairKey)

  const query = useQuery({
    queryKey: ['liquidation-clusters', market, pairKey, hours],
    queryFn: async (): Promise<ClustersAnswer> =>
      (await provider!.execute({
        capability: 'market-data:liquidations',
        params: { venue: market, pair: pairKey, hours },
        context: {
          pair: pairKey,
          market,
          timeframe: '',
          mode: 'paper' as const,
          country: getCountrySetting(),
        },
      })) as ClustersAnswer,
    enabled: active,
    staleTime: CLUSTERS_STALE_MS,
    refetchInterval: CLUSTERS_REFETCH_MS,
    gcTime: 10 * 60_000,
    // A collector that is not watching this venue answers the same way every
    // time; three retries per mount would only slow the honest caption down.
    retry: false,
  })

  return useMemo(() => {
    // No contract on screen is no claim either way: "this venue is not tracked"
    // would be a statement about a venue nobody named.
    if (!pairKey || !market) return NO_CLUSTERS
    if (pluginsReady && !provider) {
      // 'standalone' is a claim about the cloud collector; 'not_tracked' is a
      // claim about the venue. A BYOK provider needs no App Server, so which
      // one is true depends on whether this build has one at all.
      return {
        ...NO_CLUSTERS,
        unavailable: hasAppServer ? 'not_tracked' : 'standalone',
      }
    }
    if (!active) return { ...NO_CLUSTERS, isLoading: enabled }

    const answer = query.data ?? null
    if (answer && isUnavailable(answer)) {
      return {
        data: null,
        isLoading: false,
        unavailable: answer.reason,
        trackedSince: answer.trackedSince ?? null,
        error: null,
      }
    }
    return {
      data: answer,
      isLoading: query.isPending,
      unavailable: null,
      trackedSince: answer?.trackedSince ?? null,
      error: query.error
        ? query.error instanceof Error
          ? query.error.message
          : String(query.error)
        : null,
    }
  }, [
    active,
    enabled,
    market,
    pairKey,
    pluginsReady,
    provider,
    query.data,
    query.error,
    query.isPending,
  ])
}
