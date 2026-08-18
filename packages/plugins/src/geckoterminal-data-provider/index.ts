// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import { fetchOhlcv } from './ohlcv-client'
import { clearPoolCache, networkForMarket, resolvePool } from './pool-resolver'
import { fetchPoolStats } from './pool-stats-client'
import { fetchPoolTrades } from './pool-trades-client'
import {
  aggregateChainStats,
  clearListingCache,
  fetchNewPools,
  fetchTopPools,
  mergePoolPages,
} from './pool-listing-client'
import { geckoFetch as fetch } from './rate-limiter'
import type {
  PoolListingEntry,
  PoolStatsAction,
} from '@pairlens/shared/instrument-types'
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
  metadata: { family: 'dex', assetClass: 'dex' },
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
    // Pool state, the pool's swaps, ranked pools, newly created pools and
    // chain aggregates — one capability with an `action` param, because they
    // share a provider, a pool cache and one free-tier request budget.
    {
      id: 'market-data:pool-stats',
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

    if (capability === 'market-data:pool-stats') {
      // `params.market` FIRST, and this is not a nicety: the manager's context
      // carries the terminal's own current venue, which for a pool pane on a
      // second chain is the wrong network entirely — and networkForMarket
      // silently defaults to Solana rather than failing.
      const market = String(p['market'] ?? context.market ?? '')
      const network = networkForMarket(market)
      const action = String(p['action'] ?? 'stats') as PoolStatsAction

      if (action === 'trades') {
        const minVolumeUsd =
          typeof p['minVolumeUsd'] === 'number' ? p['minVolumeUsd'] : 0
        return fetchPoolTrades(
          String(p['pair'] ?? context.pair),
          network,
          minVolumeUsd,
        )
      }

      if (action === 'pools') {
        // `sort: 'volume'` walks up to `depth` pages of the volume ranking and
        // merges them, because on bot-heavy chains the real top pools only
        // surface once several pages of painted volume are filtered out by the
        // caller. Each page rides the shared listing cache, so a refresh costs
        // one request per uncached page, never per render.
        const sort = p['sort'] === 'volume' ? 'volume' : 'trending'
        const depth =
          sort === 'volume'
            ? Math.min(Math.max(Number(p['depth']) || 1, 1), 3)
            : 1
        // Page 1 is the answer; pages 2 and 3 are DEPTH, and the difference
        // matters when the provider starts refusing mid-walk. All-or-nothing
        // here threw twenty perfectly good pools away because the third page
        // was rate limited, and the board drew an empty state over a chain it
        // had the top of. So the first page decides whether this call can
        // answer at all, and the rest only ever add to it.
        const pages: Array<Array<PoolListingEntry>> = [
          await fetchTopPools(network, 1, sort),
        ]
        for (let page = 2; page <= depth; page++) {
          try {
            pages.push(await fetchTopPools(network, page, sort))
          } catch {
            break
          }
        }
        const pools = mergePoolPages(pages)
        return { network, pools, source: 'geckoterminal' as const }
      }

      if (action === 'new-pools') {
        // The only endpoint on this provider that publishes a creation time,
        // which is what makes a "new listings" feed answerable on-chain at
        // all. Same response shape as `pools` so callers stay uniform.
        const pools = await fetchNewPools(network)
        return { network, pools, source: 'geckoterminal' as const }
      }

      if (action === 'networks') {
        // One listing request per chain — see the aggregate's `coverage`.
        const markets = Array.isArray(p['markets'])
          ? (p['markets'] as Array<unknown>).map(String)
          : [market]
        const names = (p['displayNames'] ?? {}) as Record<string, string>
        // Settled, not all: one rate-limited chain must not blank the whole
        // rail. But if EVERY chain failed this is a provider failure rather
        // than an answer, so it throws and the manager can try DexPaprika,
        // which has a real network endpoint on desktop.
        // Sampled from the VOLUME ranking, not the trending feed, for two
        // reasons: a volume aggregate summed over the twenty highest-volume
        // pools is a better sample than one summed over whatever is trending,
        // and it is the exact page the pool map asks for on the selected
        // chain, so the rail and the map collapse into one request there
        // instead of two (see the in-flight map in pool-listing-client).
        const settled = await Promise.allSettled(
          markets.map(async (id) => {
            const slug = networkForMarket(id)
            const pools = await fetchTopPools(slug, 1, 'volume')
            return aggregateChainStats(slug, id, names[id] ?? id, pools)
          }),
        )
        const rows = settled
          .filter((r) => r.status === 'fulfilled')
          .map((r) => r.value)
        if (rows.length === 0 && markets.length > 0) {
          // Rethrow the throttle rather than flattening it into a generic
          // failure: the rail's message is the difference between "retrying"
          // and "this chain has no pools".
          const throttled = settled.find(
            (r) =>
              r.status === 'rejected' && isProviderThrottledError(r.reason),
          )
          if (throttled?.status === 'rejected') throw throttled.reason
          throw new Error('GeckoTerminal: no network could be sampled')
        }
        return rows
      }

      return fetchPoolStats(String(p['pair'] ?? context.pair), network)
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
      // (~30 calls/min, paced by ./rate-limiter); if the snapshot is dropped,
      // the poller below retries a FULL snapshot until one lands, then switches
      // to incremental updates.
      let snapshotDelivered = false
      // One request in flight at a time. With the limiter in front, a queued
      // request can outlive the 15s interval, and a second one behind it would
      // spend budget re-asking a question already on the wire.
      let inFlight = false

      const pollCandles = async () => {
        if (inFlight) return
        inFlight = true
        try {
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
        } catch {
          // Throttled or transient. The provider-level cool-off is already
          // recorded (see ./rate-limiter), the terminal reads it rather than
          // publishing a no-data verdict, and the next tick retries.
        } finally {
          inFlight = false
        }
      }

      void pollCandles()

      // Clear any existing poller for this key to prevent leaks
      const existing = candlePollers.get(key)
      if (existing) clearInterval(existing)

      // Poll for updates every 15s
      const timer = setInterval(() => void pollCandles(), 15_000)

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
      // free-tier rate limit, which ./rate-limiter enforces for the whole
      // provider rather than per poller.
      let active = true
      let inFlight = false

      const poll = async () => {
        if (!active || inFlight) return
        inFlight = true
        try {
          const pool = await resolvePool(pair, network)
          if (!pool || !active) return

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
          // Retry next interval. A throttle has already recorded the
          // provider's cool-off, so the terminal knows the silence is
          // temporary.
        } finally {
          inFlight = false
        }
      }

      // Clear any existing poller for this pair to prevent leaks
      const existingTicker = tickerPollers.get(pollerKey)
      if (existingTicker) clearInterval(existingTicker)

      void poll()
      const timer = setInterval(() => void poll(), 10_000)
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
      clearListingCache()
    },
  }
}
