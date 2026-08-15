// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `createCcxtFuturesConnectorPlugin` — one factory behind every perpetual
 * venue.
 *
 * A sibling of the spot bridge, sharing everything that is about ccxt-the-
 * library and forking only what is about spot-the-instrument.
 *
 * REUSED VERBATIM, because each is load-bearing policy the terminal was tuned
 * against and a second copy would drift:
 * - `createCexConnectorPlugin` — capability dispatch, credential slots, the
 *   fail-closed slot lookup, and the platform/geo refusal ORDER (both thrown
 *   synchronously from `subscribe`, which is what the region dialog keys on)
 * - `CcxtExchangeHost` — instance lifecycle, transport, geo classification at
 *   the status code, region rebuilds, sandbox verification
 * - `CcxtStreamHub` — reconnect pacing, inbound-silence watchdog, wake
 *   recovery, refcounted subscriptions, the seeds. Its ONE new seam is
 *   `toSymbol`, because a perp pair has a settlement leg the spot mapper
 *   cannot express
 * - `createCcxtPrivateStream` — reconnect, liveness, wake and the REST
 *   fallbacks, with the mirror-image seam: `symbolToPair`, mapping an order
 *   update's symbol back to a three-segment key at the source rather than
 *   trying to restore the leg downstream
 * - `fetchCcxtHistory`, `normalizeCcxtOrder`, the parsers
 *
 * FORKED: symbols (three segments), the markets table (own cache namespace,
 * inverted filter) and the order path (contracts, reduce-only, leverage,
 * positions). See each module's header.
 *
 * NOT imported from here by the terminal's discovery surfaces: the cached
 * listing reads live at `./listings`, a leaf module with its own package
 * export, because everything above would otherwise ride into the main bundle
 * with them (see that file's header).
 *
 * ccxt is reached ONLY through `venue.loadExchangeClass()`, which must be a
 * literal deep `import('ccxt/js/src/pro/<id>.js')`: the barrel would pull ~130
 * exchange classes into the graph, and a literal deep import gives each venue
 * its own chunk.
 */

import { createCexConnectorPlugin } from '../cex-connector'
import {
  CcxtExchangeHost,
  classifyCcxtGeoError,
} from '../ccxt-connector/exchange-host'
import { createCcxtPrivateStream } from '../ccxt-connector/private-stream'
import { fetchCcxtHistory } from '../ccxt-connector/rest'
import { mapTimeframeToCcxt } from '../ccxt-connector/parser'
import { CcxtStreamHub } from '../ccxt-connector/watch-driver'
import { CcxtFuturesMarketsProvider } from './futures-markets'
import { CcxtFuturesTradingRuntime } from './futures-orders'
import { fromFuturesSymbol, toFuturesSymbol } from './futures-symbols'
import type {
  CexConnectorSpec,
  CexCredentials,
  CexPrivateWsClient,
  CexPublicWsClient,
} from '../cex-connector'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { CcxtPrivateStreamOptions } from '../ccxt-connector/private-stream'
import type { CcxtExchangeLike } from '../ccxt-connector/types'
import type { Candle } from '@pairlens/shared/types'
import type { FuturesMarketsStorage } from './futures-markets'
import type {
  CcxtFuturesExchangeLike,
  CcxtFuturesVenueConfig,
} from './futures-types'

export type {
  CcxtFuturesVenueConfig,
  CcxtFuturesExchangeLike,
  CcxtFuturesMarketSeed,
} from './futures-types'
export {
  createCexFuturesConnectorManifest,
  type CexFuturesManifestOptions,
} from './manifest'
export {
  futuresPairSegments,
  fromFuturesSymbol,
  normalizeFuturesPair,
  toFuturesSymbol,
} from './futures-symbols'
export {
  CCXT_FUTURES_VENUE_IDS,
  CcxtFuturesMarketsProvider,
  defaultFuturesMarketsStorage,
  futuresMarketsCacheKey,
  memoryFuturesMarketsStorage,
  readCachedFuturesListings,
  trimFuturesMarket,
  trimFuturesMarkets,
} from './futures-markets'
export type {
  CachedFuturesListings,
  CachedFuturesMarkets,
  FuturesListingRow,
  FuturesMarketsStorage,
} from './futures-markets'
export {
  CcxtFuturesTradingRuntime,
  buildCcxtFuturesOrderCall,
  normalizeCcxtPositions,
} from './futures-orders'

export type CreateCcxtFuturesConnectorOptions = {
  /** Injectable markets cache — the CLI and tests run on an in-memory map. */
  marketsStorage?: FuturesMarketsStorage
  /** Forwarded to the watch driver (backoff knobs, wake source, clocks). */
  hub?: Partial<{
    gracePeriodMs: number
    baseBackoffMs: number
    maxBackoffMs: number
    stableResetMs: number
    livenessTimeoutMs: number
    backfillRetryDelayMs: number
  }>
  /** Forwarded to the private stream (backoff knobs, poll cadence, clocks). */
  privateStream?: Omit<
    CcxtPrivateStreamOptions,
    'venue' | 'ensureMarkets' | 'onError'
  >
}

/**
 * One venue's runtime: the ccxt instance, its perp markets table, and the
 * stream hub. Created per plugin instance and shared by every capability, so a
 * history fetch and four live streams ride the same socket pool.
 */
class CcxtFuturesVenueRuntime {
  readonly host: CcxtExchangeHost
  readonly markets: CcxtFuturesMarketsProvider
  readonly hub: CcxtStreamHub
  readonly trading: CcxtFuturesTradingRuntime
  private client: CexPublicWsClient | null = null

  constructor(
    private readonly venue: CcxtFuturesVenueConfig,
    private readonly options: CreateCcxtFuturesConnectorOptions = {},
  ) {
    this.markets = new CcxtFuturesMarketsProvider(
      venue.exchangeId,
      options.marketsStorage,
    )
    this.host = new CcxtExchangeHost({
      venue,
      onInbound: () => this.hub.noteInbound(),
      onError: (scope, error) => warn(venue.marketId, scope, error),
    })
    this.hub = new CcxtStreamHub({
      venue,
      host: this.host,
      // The seam this whole runtime turns on: `BTC-USDT-USDT` →
      // `BTC/USDT:USDT`, which the spot mapper's single-dash replace cannot
      // produce.
      toSymbol: toFuturesSymbol,
      backfill: (pair, timeframe, limit, country) =>
        this.fetchCandles(pair, timeframe, limit, country),
      primeMarkets: (exchange) => {
        this.markets.primeSync(exchange)
      },
      onError: (scope, error) => warn(venue.marketId, scope, error),
      ...options.hub,
    })
    this.trading = new CcxtFuturesTradingRuntime({
      venue,
      ensureMarkets: (exchange) => this.ensureMarkets(exchange),
      onError: (scope, error) => warn(venue.marketId, scope, error),
    })
  }

  /**
   * The shared private stream, driven through its `symbolToPair` seam.
   *
   * Reused wholesale — the reconnect, liveness, wake and REST-fallback policy
   * is the whole value and none of it is spot-specific. The one thing that is
   * spot-specific is how an order update's unified symbol becomes a pair key,
   * and that is a parameter: mapping `BTC/USDT:USDT` at the source keeps the
   * settle leg, where restoring it afterwards would have to guess it from a
   * markets table that is empty on a cold profile — and a guessed settlement
   * currency is a fill in the wrong position-ledger slot.
   */
  privateClient(): CexPrivateWsClient<CexCredentials> {
    return createCcxtPrivateStream({
      venue: this.venue,
      ensureMarkets: (exchange) => this.ensureMarkets(exchange),
      symbolToPair: fromFuturesSymbol,
      onError: (scope, error) => warn(this.venue.marketId, scope, error),
      ...this.options.privateStream,
    })
  }

  /**
   * Give an AUTHED instance a market table without letting it load one itself.
   *
   * ccxt signs opportunistically during `loadMarkets`, and the download is
   * multi-MB. The public instance has already paid for it (or will, once), so
   * the authed one is handed the trimmed copy.
   */
  private async ensureMarkets(target: CcxtExchangeLike): Promise<void> {
    if (target.markets !== undefined) return
    const cached = this.markets.peek() ?? (await this.markets.prefetch())
    if (cached && cached.markets.length > 0) {
      target.setMarkets(cached.markets)
      return
    }
    const lease = await this.host.acquire()
    await this.markets.whenReady(lease.exchange)
    this.hub.touchIdle()
    const loaded = this.markets.peek()
    if (loaded && loaded.markets.length > 0) {
      target.setMarkets(loaded.markets)
      return
    }
    // Nothing cacheable came back; the authed instance loading its own is
    // better than a BadSymbol throw.
    await target.loadMarkets()
  }

  publicClient(): CexPublicWsClient {
    if (!this.client) {
      const hub = this.hub
      this.client = {
        subscribeCandles: (pair, timeframe, country, callback) =>
          hub.acquire(
            { channel: 'candles', pair, timeframe },
            country,
            callback,
          ),
        subscribeTicker: (pair, country, callback) =>
          hub.acquire({ channel: 'ticker', pair }, country, callback),
        subscribeOrderbook: (pair, country, callback) =>
          hub.acquire({ channel: 'orderbook', pair }, country, callback),
        subscribeTrades: (pair, country, callback) =>
          hub.acquire({ channel: 'trades', pair }, country, callback),
        destroy: () => {
          void this.hub.destroy()
        },
      }
    }
    return this.client
  }

  /** Everything this venue holds open: sockets, timers, ccxt instances. */
  async destroy(): Promise<void> {
    await Promise.all([this.hub.destroy(), this.trading.destroy()])
  }

  async fetchCandles(
    pair: string,
    timeframe: string,
    limit: number,
    country: string,
    endTs?: number,
  ): Promise<Array<Candle>> {
    const tf = mapTimeframeToCcxt(timeframe)
    if (!tf) throw new Error(`Unsupported timeframe: ${timeframe}`)
    const symbol = toFuturesSymbol(pair)
    const exchange = await this.acquireFor(country)
    try {
      // No stand-in markets on a futures venue (contract ids are not derivable
      // from BASE/QUOTE), so an unresolvable symbol means the real table has
      // not landed yet rather than that the seed missed.
      if (
        this.markets.primeSync(exchange) === 'none' ||
        !this.markets.hasSymbol(exchange, symbol)
      ) {
        await this.markets.whenReady(exchange)
      }
      return await fetchCcxtHistory(
        exchange,
        this.venue,
        symbol,
        tf,
        limit,
        endTs,
      )
    } catch (error) {
      throw this.classify(error, country)
    } finally {
      this.hub.touchIdle()
    }
  }

  private async acquireFor(country: string): Promise<CcxtFuturesExchangeLike> {
    // A region change has to rebuild: the REST base is baked into signed
    // requests and ccxt keeps per-instance endpoint caches that survive close().
    if (this.host.setCountry(country)) await this.host.close()
    const lease = await this.host.acquire()
    return lease.exchange as CcxtFuturesExchangeLike
  }

  /**
   * Second line of defence for the geo signal — the first is the transport's
   * status-code classification inside `CcxtExchangeHost`. Shared with the spot
   * bridge; see `classifyCcxtGeoError`.
   */
  private classify(error: unknown, country: string): unknown {
    return classifyCcxtGeoError(error, this.venue.displayName, country)
  }
}

export function createCcxtFuturesConnectorPlugin(
  venue: CcxtFuturesVenueConfig,
  manifest: PluginManifest,
  options: CreateCcxtFuturesConnectorOptions = {},
): PluginInstance {
  const runtime = new CcxtFuturesVenueRuntime(venue, options)

  const spec: CexConnectorSpec<CexCredentials> = {
    id: manifest.id,
    marketId: venue.marketId,
    credentialKeys: venue.credentialKeys,
    defaultMode: venue.defaultMode,
    ...(venue.requiresDesktop ? { requiresDesktop: true } : {}),
    ...(venue.geoCheck ? { geoCheck: venue.geoCheck } : {}),
    // Runs in the SHELL, after slot resolution and outside the trading
    // runtime's try/catch — a geo refusal raised inside `placeOrder` comes back
    // as `{success:false, error}` and the region dialog never fires.
    ...(venue.tradeGeoCheck ? { tradeGeoCheck: venue.tradeGeoCheck } : {}),
    createWsClient: () => runtime.publicClient(),
    createPrivateWsClient: () => runtime.privateClient(),
    fetchCandles: (pair, timeframe, limit, country, endTs) =>
      runtime.fetchCandles(pair, timeframe, limit, country, endTs),
    fetchOpenOrders: (slot) => runtime.trading.fetchOpenOrders(slot),
    fetchOrderHistory: (slot) => runtime.trading.fetchOrderHistory(slot),
    fetchBalances: (slot) => runtime.trading.fetchBalances(slot),
    fetchPositions: (slot) => runtime.trading.fetchPositions(slot),
    cancelOrder: (orderId, pair, slot, opts) =>
      runtime.trading.cancelOrder(orderId, pair, slot, opts),
    placeOrder: (order, slot) => runtime.trading.placeOrder(order, slot),
  }

  const instance = createCexConnectorPlugin(spec, manifest)
  return {
    ...instance,
    // The shell's `destroy()` reaches the public client and each slot's private
    // client, both of which it created — but the authed REST instances have no
    // hook there, and a plugin that only ever traded never built a public
    // client for the shell to tear down.
    destroy: async () => {
      await instance.destroy?.()
      await runtime.destroy()
    },
  }
}

function warn(marketId: string, scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[ccxt-futures:${marketId}] ${scope}: ${message}`)
}
