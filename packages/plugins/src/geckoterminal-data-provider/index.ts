// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { fetchOhlcv } from './ohlcv-client'
import { clearPoolCache, networkForMarket, resolvePool } from './pool-resolver'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { CandleUpdate, TickerUpdate } from '@pairlens/market-engine/types'

export const geckoterminalDataProviderManifest: PluginManifest = {
  id: 'geckoterminal-data-provider',
  name: 'GeckoTerminal',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'DEX market data powered by GeckoTerminal (CoinGecko) — deep history, native 4h candles',
  homepage: 'https://www.geckoterminal.com',
  metadata: { assetClass: 'dex' },
  // Priority 5 — the PRIMARY wildcard DEX data provider. GeckoTerminal sends
  // Access-Control-Allow-Origin: * so it works from the webview; DexPaprika
  // (priority 6) is CORS-closed and only serves non-browser contexts (CLI).
  capabilities: [
    {
      id: 'market-data:candles',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: true,
    },
    {
      id: 'market-data:ticker',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: true,
    },
    {
      id: 'market-data:history',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
  ],
  config: {},
}

const API_BASE = 'https://api.geckoterminal.com/api/v2'

export function createGeckoterminalDataProviderPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const candlePollers = new Map<string, ReturnType<typeof setInterval>>()
  const tickerPollers = new Map<string, ReturnType<typeof setInterval>>()

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

      // Initial snapshot. GeckoTerminal's free tier rate-limits aggressively
      // (~30 calls/min); if the snapshot is dropped, the poller below retries
      // a FULL snapshot until one lands, then switches to incremental updates.
      let snapshotDelivered = false
      fetchOhlcv(pair, timeframe, 500, network).then((candles) => {
        if (candles.length > 0) {
          snapshotDelivered = true
          callback({ type: 'snapshot', candles } satisfies CandleUpdate)
        }
      })

      // Clear any existing poller for this key to prevent leaks
      const existing = candlePollers.get(key)
      if (existing) clearInterval(existing)

      // Poll for updates every 15s
      const timer = setInterval(async () => {
        if (!snapshotDelivered) {
          const candles = await fetchOhlcv(pair, timeframe, 500, network)
          if (candles.length > 0) {
            snapshotDelivered = true
            callback({ type: 'snapshot', candles } satisfies CandleUpdate)
          }
          return
        }
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
      const pollerKey = `${network}:${pair}`

      // GeckoTerminal doesn't have SSE — poll REST. 10s keeps one active
      // pair (ticker + candles + resolution) well inside the ~30 req/min
      // free-tier rate limit.
      let active = true

      const poll = async () => {
        if (!active) return
        const pool = await resolvePool(pair, network)
        if (!pool || !active) return

        try {
          const res = await fetch(
            `${API_BASE}/networks/${pool.network}/pools/${pool.address}`,
          )
          if (!res.ok || !active) return
          const json = (await res.json()) as {
            data?: {
              attributes: {
                base_token_price_usd: string
                quote_token_price_usd: string
                volume_usd: { h24: string }
                price_change_percentage: { h24: string }
              }
            }
          }

          const attrs = json.data?.attributes
          if (!attrs || !active) return

          const last = parseFloat(attrs.base_token_price_usd) || 0
          callback({
            type: 'ticker',
            ticker: {
              last,
              bid: last * 0.999,
              ask: last * 1.001,
              high24h: 0,
              low24h: 0,
              volume24h: parseFloat(attrs.volume_usd.h24) || 0,
              change24h: parseFloat(attrs.price_change_percentage.h24) || 0,
              ts: Date.now(),
            },
          } satisfies TickerUpdate)
        } catch {
          // Retry next interval
        }
      }

      // Clear any existing poller for this pair to prevent leaks
      const existingTicker = tickerPollers.get(pollerKey)
      if (existingTicker) clearInterval(existingTicker)

      poll()
      const timer = setInterval(poll, 10_000)
      tickerPollers.set(pollerKey, timer)

      return () => {
        active = false
        clearInterval(timer)
        tickerPollers.delete(pollerKey)
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
      for (const timer of tickerPollers.values()) clearInterval(timer)
      tickerPollers.clear()
      clearPoolCache()
    },
  }
}
