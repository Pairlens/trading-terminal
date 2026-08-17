// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bridge connector, a quote from it, and the poller that follows a transfer
 * until it lands.
 *
 * The plugin is addressed DIRECTLY rather than through `pluginManager.execute`,
 * for the reason every chain-addressed question is: the manager resolves one
 * winner against its own shared market context, and a bridge quote names two
 * chains, neither of which is necessarily the one the terminal is looking at.
 * Calling the instance keeps the pair of chains explicit.
 *
 * Nothing here signs. The quote path runs before the connector looks at a wallet
 * slot, so a user can price a transfer with the vault sealed; execution lives in
 * `lib/dex/bridge-execution.ts` and is reached only from a confirm.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { BridgeStatusUpdate } from '@pairlens/shared/instrument-types'

import type {
  BridgeQuoteResponse,
  BridgeTransfer,
} from '@/lib/dex/bridge-types'
import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'
import { useBridgeTransfersStore } from '@/lib/dex/bridge-transfers-store'

/**
 * A quote is a live price on two chains at once and goes stale fast. 60s
 * matches the requote cadence the pane shows a countdown for; beyond it the
 * confirm is blocked rather than the number quietly refreshed under the cursor.
 */
export const QUOTE_STALE_MS = 60_000

/**
 * How often a pending transfer is polled, as a function of how long it has been
 * pending.
 *
 * The keyless LI.FI budget is 200 requests per rolling two hours, shared by
 * every tab. A transfer that lands in the usual seconds-to-minutes costs a
 * dozen polls at the fast cadence, which is nothing. A STUCK transfer at that
 * cadence costs 144 an hour and would starve the quote pane of the same budget,
 * so it backs off: the interesting information about a transfer that has been
 * pending half an hour arrives in minutes, not seconds.
 */
export function statusPollInterval(ageMs: number): number {
  if (ageMs < 5 * 60_000) return 25_000
  if (ageMs < 30 * 60_000) return 60_000
  return 5 * 60_000
}

/** The installed connector that serves `market-data:bridge`, or null. */
export function useBridgePlugin(): PluginInstance | null {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(() => {
    const active = pluginManager
      .getActivePlugins()
      .find((plugin) =>
        plugin.manifest.capabilities.some((c) => c.id === 'market-data:bridge'),
      )
    return active ?? null
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion])
}

function bridgeContext(market: string) {
  return {
    pair: '',
    market,
    timeframe: '',
    mode: 'paper' as const,
    country: getCountrySetting(),
  }
}

export type BridgeQuoteRequest = {
  fromMarket: string | null
  toMarket: string | null
  symbol: string | null
  /** Amount in `symbol` units, as typed. Empty or zero disables the query. */
  amount: string
  /** Sender, when a wallet is connected. The connector falls back to a probe address. */
  address: string | null
}

export async function fetchBridgeQuote(
  plugin: PluginInstance | null,
  request: BridgeQuoteRequest,
): Promise<BridgeQuoteResponse | null> {
  if (!plugin || !request.fromMarket || !request.toMarket || !request.symbol) {
    return null
  }
  return (await plugin.execute({
    capability: 'market-data:bridge',
    params: {
      action: 'quote',
      fromMarket: request.fromMarket,
      toMarket: request.toMarket,
      symbol: request.symbol,
      amount: request.amount,
      ...(request.address ? { address: request.address } : {}),
    },
    context: bridgeContext(request.fromMarket),
  })) as BridgeQuoteResponse | null
}

export type BridgeQuoteResult = {
  data: BridgeQuoteResponse | null
  isLoading: boolean
  isFetching: boolean
  error: string | null
  /** The quote is older than the pane will execute on. */
  refetch: () => void
}

export function useBridgeQuote(
  request: BridgeQuoteRequest,
  enabled = true,
): BridgeQuoteResult {
  const plugin = useBridgePlugin()
  const size = Number(request.amount)
  const active = Boolean(
    enabled &&
    plugin &&
    request.fromMarket &&
    request.toMarket &&
    request.symbol &&
    Number.isFinite(size) &&
    size > 0,
  )

  const query = useQuery({
    queryKey: [
      'bridge-quote',
      request.fromMarket,
      request.toMarket,
      request.symbol,
      request.amount,
      request.address,
    ],
    queryFn: async () => fetchBridgeQuote(plugin, request),
    enabled: active,
    staleTime: QUOTE_STALE_MS,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  return {
    data: query.data ?? null,
    isLoading: active && query.isPending,
    isFetching: query.isFetching,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
    refetch: () => {
      void query.refetch()
    },
  }
}

/**
 * Poll every transfer that has not settled, and fold each answer into the store.
 *
 * One query per transfer rather than one for all of them: they settle at
 * different times, and react-query then stops polling each hash the moment it
 * resolves instead of keeping the whole set alive for the slowest one. Mounting
 * this hook twice (both bridge panes on one board) shares the same queries.
 */
export function useBridgeTransferTracking(
  transfers: Array<BridgeTransfer>,
): void {
  const plugin = useBridgePlugin()
  const applyStatus = useBridgeTransfersStore((s) => s.applyStatus)

  const pending = useMemo(
    () => transfers.filter((transfer) => transfer.status === 'pending'),
    [transfers],
  )

  const fetchStatus = useCallback(
    async (transfer: BridgeTransfer): Promise<BridgeStatusUpdate | null> => {
      if (!plugin) return null
      return (await plugin.execute({
        capability: 'market-data:bridge',
        params: { action: 'status', txHash: transfer.sourceTxHash },
        context: bridgeContext(transfer.fromMarket),
      })) as BridgeStatusUpdate | null
    },
    [plugin],
  )

  const results = useQueries({
    queries: pending.map((transfer) => {
      const interval = statusPollInterval(Date.now() - transfer.startedAt)
      return {
        queryKey: ['bridge-status', transfer.sourceTxHash],
        queryFn: async () => fetchStatus(transfer),
        enabled: Boolean(plugin),
        refetchInterval: interval,
        staleTime: interval,
        gcTime: 5 * 60_000,
        // A throttled provider must not be hammered: the connector already holds
        // the queue back, and a retry here would spend the budget twice.
        retry: false,
        refetchOnWindowFocus: false,
      }
    }),
  })

  useEffect(() => {
    results.forEach((result, index) => {
      const update = result.data
      const transfer = pending[index]
      if (!update || !transfer) return
      applyStatus(transfer.id, update)
    })
  }, [results, pending, applyStatus])
}
