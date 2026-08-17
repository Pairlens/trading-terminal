// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which chains have a connector behind them, and what gas costs on each.
 *
 * The chain rail draws every chain in the catalog and dims the ones with no
 * connector installed, so a chain is never simply absent. `connected` is the
 * gate for everything that would need the connector to answer: selection,
 * routing, and the gas column.
 *
 * Gas comes from the connector rather than from a direct RPC call here, for
 * the reason every venue call does: the endpoint, its CSP allowance and its
 * failure modes belong to the plugin. `eth_gasPrice` reads nothing that
 * belongs to an account and signs nothing, and Solana declines entirely — its
 * fee is a base charge plus a priority bid decided at send time, so the rail
 * shows a dash instead of a number that would be stale on arrival.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'

import type { DexChain } from '@/lib/dex/chain-catalog'
import { DEX_CHAINS } from '@/lib/dex/chain-catalog'
import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'
import { venuePluginsFor } from '@/lib/venues/venue-plugins'

/** Gas moves with block demand; half a minute is a live enough reading. */
const GAS_REFRESH_MS = 30_000

export type DexChainRow = DexChain & {
  /** The chain's connector is installed and active. */
  connected: boolean
  plugin: PluginInstance | null
}

export function useDexChains(): Array<DexChainRow> {
  const { pluginManager, pluginStateVersion } = usePairlens()

  return useMemo(() => {
    const byMarket = new Map(
      venuePluginsFor(
        pluginManager.getActivePlugins(),
        'trading:orders',
        'dex',
      ).map((venue) => [venue.market, venue.plugin]),
    )
    return DEX_CHAINS.map((chain) => ({
      ...chain,
      connected: byMarket.has(chain.market),
      plugin: byMarket.get(chain.market) ?? null,
    }))
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion])
}

export type ChainGasResult = {
  /** Gas price in gwei, keyed by market id. Absent means not published. */
  gweiByMarket: Map<string, number>
  isLoading: boolean
}

const EMPTY_GAS: Map<string, number> = new Map()

/**
 * One `eth_gasPrice` per connected EVM chain, fanned out with
 * `Promise.allSettled` inside a single query — the same shape the prediction
 * event fan-out uses, and for the same reason: the manager's resolver picks
 * one winner per capability, which is the opposite of asking every chain.
 */
export function useChainGas(
  rows: Array<DexChainRow>,
  enabled = true,
): ChainGasResult {
  const targets = rows.filter((row) => row.connected && row.hasGasPrice)
  const key = targets
    .map((row) => row.market)
    .sort()
    .join(',')

  const query = useQuery({
    queryKey: ['chain-gas', key],
    queryFn: async () => {
      const results = await Promise.allSettled(
        targets.map(async (row) => {
          const response = (await row.plugin!.execute({
            capability: 'trading:orders',
            params: { action: 'gas' },
            context: {
              pair: '',
              market: row.market,
              timeframe: '',
              mode: 'paper' as const,
              country: getCountrySetting(),
            },
          })) as { gasPriceWei?: string | null } | null
          const wei = response?.gasPriceWei
          if (typeof wei !== 'string') return null
          const gwei = Number(BigInt(wei)) / 1e9
          return Number.isFinite(gwei) ? { market: row.market, gwei } : null
        }),
      )
      const map = new Map<string, number>()
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          map.set(result.value.market, result.value.gwei)
        }
      }
      return map
    },
    enabled: enabled && targets.length > 0,
    staleTime: GAS_REFRESH_MS,
    refetchInterval: GAS_REFRESH_MS,
    gcTime: 5 * 60_000,
    retry: false,
  })

  return {
    gweiByMarket: query.data ?? EMPTY_GAS,
    isLoading: query.isPending && targets.length > 0,
  }
}
