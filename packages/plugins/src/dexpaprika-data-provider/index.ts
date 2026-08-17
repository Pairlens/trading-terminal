// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { fetchOhlcv } from './ohlcv-client'
import { closeAllConnections, subscribeTicker } from './ticker-client'
import { clearPoolCache, networkForMarket } from './pool-resolver'
import { fetchNetworkStats, fetchPoolStats } from './pool-stats-client'
import type { CandleUpdate, TickerUpdate } from '@pairlens/market-engine/types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const dexpaprikaDataProviderManifest: PluginManifest = {
  id: 'dexpaprika-data-provider',
  name: 'DexPaprika',
  version: '0.1.0',
  author: 'Pairlens',
  description: 'DEX market data powered by DexPaprika',
  homepage: 'https://dexpaprika.com',
  metadata: { family: 'dex', assetClass: 'dex' },
  // Priority 6 — fallback behind GeckoTerminal (priority 5). DexPaprika's API
  // sends no Access-Control-Allow-Origin header, so browser/webview fetches
  // are CORS-blocked; it still serves non-browser contexts like the CLI.
  capabilities: [
    {
      id: 'market-data:candles',
      singleton: false,
      markets: ['*'],
      priority: 6,
      streaming: true,
    },
    {
      id: 'market-data:ticker',
      singleton: false,
      markets: ['*'],
      priority: 6,
      streaming: true,
    },
    {
      id: 'market-data:history',
      singleton: false,
      markets: ['*'],
      priority: 6,
      streaming: false,
    },
    // Behind GeckoTerminal, and worth reaching anyway: this is the only
    // provider that publishes per-token reserves, the 24h buy/sell split and
    // chain-WIDE totals rather than a sampled sum.
    {
      id: 'market-data:pool-stats',
      singleton: false,
      markets: ['*'],
      priority: 6,
      streaming: false,
    },
  ],
  config: {},
}

export function createDexpaprikaDataProviderPlugin(
  manifest: PluginManifest,
): PluginInstance {
  // Candle polling state per pair+timeframe
  const candlePollers = new Map<string, ReturnType<typeof setInterval>>()

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p, context } = params

    if (
      capability === 'market-data:history' ||
      capability === 'market-data:candles'
    ) {
      const pair = String(p['pair'] ?? context.pair)
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      const limit = typeof p['limit'] === 'number' ? p['limit'] : 300
      return fetchOhlcv(
        pair,
        timeframe,
        limit,
        networkForMarket(context.market),
      )
    }

    if (capability === 'market-data:pool-stats') {
      // See the GeckoTerminal provider: `params.market` wins over the
      // manager's shared context, which belongs to the terminal's own venue.
      const market = String(p['market'] ?? context.market ?? '')

      if (String(p['action'] ?? 'stats') === 'networks') {
        const markets = Array.isArray(p['markets'])
          ? (p['markets'] as Array<unknown>).map(String)
          : [market]
        return fetchNetworkStats(
          markets.map((id) => ({ market: id, network: networkForMarket(id) })),
        )
      }

      // `pools` and `trades` are GeckoTerminal-only for now; answering null
      // rather than throwing keeps the pane's "no data" honest instead of
      // reporting a provider failure that did not happen.
      if (String(p['action'] ?? 'stats') !== 'stats') return null

      return fetchPoolStats(
        String(p['pair'] ?? context.pair),
        networkForMarket(market),
      )
    }

    return null
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    const { capability, params: p, context } = params

    if (capability === 'market-data:candles') {
      const pair = String(p['pair'] ?? context.pair)
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      const network = networkForMarket(context.market)
      const key = `${network}:${pair}:${timeframe}`

      // Initial snapshot
      fetchOhlcv(pair, timeframe, 500, network).then((candles) => {
        if (candles.length > 0) {
          callback({ type: 'snapshot', candles } satisfies CandleUpdate)
        }
      })

      // Clear any existing poller for this key to prevent leaks
      const existing = candlePollers.get(key)
      if (existing) clearInterval(existing)

      // Poll for updates every 15s
      const timer = setInterval(async () => {
        const candles = await fetchOhlcv(pair, timeframe, 2, network)
        if (candles.length > 0) {
          callback({ type: 'update', candles } satisfies CandleUpdate)
        }
      }, 15_000)

      candlePollers.set(key, timer)

      return () => {
        clearInterval(timer)
        candlePollers.delete(key)
      }
    }

    if (capability === 'market-data:ticker') {
      const pair = String(p['pair'] ?? context.pair)
      const network = networkForMarket(context.market)
      let unsub: (() => void) | null = null
      let aborted = false

      subscribeTicker(
        pair,
        (ticker) => {
          if (!aborted) {
            callback({ type: 'ticker', ticker } satisfies TickerUpdate)
          }
        },
        network,
      ).then((u) => {
        if (aborted) {
          u()
        } else {
          unsub = u
        }
      })

      return () => {
        aborted = true
        unsub?.()
      }
    }

    return () => {}
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
    subscribe,
    async destroy() {
      for (const timer of candlePollers.values()) clearInterval(timer)
      candlePollers.clear()
      closeAllConnections()
      clearPoolCache()
    },
  }
}
