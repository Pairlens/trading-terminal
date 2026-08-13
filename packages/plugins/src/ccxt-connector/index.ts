// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `createCcxtConnectorPlugin` — one factory behind every ccxt-backed venue.
 *
 * It does NOT reimplement the plugin surface. The CEX shell
 * (`../cex-connector`) already owns capability dispatch, credential slots,
 * platform/geo refusal ordering and the `trading:balances` execute/subscribe
 * asymmetry, and every one of those behaviors is load-bearing somewhere in the
 * terminal. So the bridge supplies a `CexConnectorSpec` whose WS client is
 * ccxt-driven and whose REST hooks call ccxt — and inherits the shell's
 * semantics exactly, rather than re-deriving them and drifting.
 *
 * What the bridge adds under that spec is everything ccxt does not do:
 * markets caching (markets.ts), instance lifecycle and transport wiring
 * (exchange-host.ts), and the reconnect/liveness/wake policy the pull-based
 * `watch*` API leaves entirely to the consumer (watch-driver.ts).
 *
 * ccxt itself is reached ONLY through `venue.loadExchangeClass()`, which must
 * be a dynamic `import('ccxt/js/src/pro/<id>.js')`. Two rules ride on that:
 * the barrel (`ccxt`) is never imported, because it pulls all ~130 exchange
 * classes into the graph; and no exchange class is constructed at module scope,
 * so each venue's ~1 MB chunk is fetched the first time someone actually uses
 * that venue.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { createCexConnectorPlugin } from '../cex-connector'
import { CcxtExchangeHost } from './exchange-host'
import { CcxtMarketsProvider } from './markets'
import { CcxtTradingRuntime } from './orders'
import { createCcxtPrivateStream } from './private-stream'
import { fetchCcxtBulkTickers, fetchCcxtHistory } from './rest'
import { mapTimeframeToCcxt, toCcxtSymbol } from './parser'
import { CcxtStreamHub } from './watch-driver'
import type {
  CexConnectorSpec,
  CexCredentials,
  CexPublicWsClient,
} from '../cex-connector'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { MarketsStorage } from './markets'
import type { CcxtPrivateStreamOptions } from './private-stream'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'
import type { Candle } from '@pairlens/shared/types'

export type { CcxtVenueConfig, CcxtExchangeLike, CcxtMarketSeed } from './types'
export { CcxtStreamHub } from './watch-driver'
export { CcxtExchangeHost, enableCcxtSandbox } from './exchange-host'
export {
  CcxtTradingRuntime,
  buildCcxtOrderCall,
  normalizeCcxtBalances,
  normalizeCcxtOrder,
} from './orders'
export { CcxtPrivateStream, createCcxtPrivateStream } from './private-stream'
export {
  CcxtMarketsProvider,
  memoryMarketsStorage,
  trimMarket,
  trimMarkets,
} from './markets'

export type CreateCcxtConnectorOptions = {
  /** Injectable markets cache — the CLI and tests run on an in-memory map. */
  marketsStorage?: MarketsStorage
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
 * One venue's runtime: the ccxt instance, its markets table, and the stream
 * hub. Created per plugin instance and shared by every capability, so a
 * history fetch and four live streams ride the same socket pool.
 */
class CcxtVenueRuntime {
  readonly host: CcxtExchangeHost
  readonly markets: CcxtMarketsProvider
  readonly hub: CcxtStreamHub
  readonly trading: CcxtTradingRuntime
  private client: CexPublicWsClient | null = null

  constructor(
    private readonly venue: CcxtVenueConfig,
    private readonly options: CreateCcxtConnectorOptions = {},
  ) {
    this.markets = new CcxtMarketsProvider(
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
      backfill: (pair, timeframe, limit, country) =>
        this.fetchCandles(pair, timeframe, limit, country),
      primeMarkets: (exchange, pair) => this.primeMarkets(exchange, pair),
      onError: (scope, error) => warn(venue.marketId, scope, error),
      ...options.hub,
    })
    this.trading = new CcxtTradingRuntime({
      venue,
      ensureMarkets: (exchange) => this.ensureMarkets(exchange),
      onError: (scope, error) => warn(venue.marketId, scope, error),
    })
  }

  privateClient() {
    return createCcxtPrivateStream({
      venue: this.venue,
      ensureMarkets: (exchange) => this.ensureMarkets(exchange),
      onError: (scope, error) => warn(this.venue.marketId, scope, error),
      ...this.options.privateStream,
    })
  }

  /**
   * Give an AUTHED instance a market table without letting it load one itself.
   *
   * ccxt signs opportunistically during `loadMarkets` — KuCoin adds
   * `privateGetMarginSymbols`, five venues switch `fetchCurrencies` to a
   * private endpoint — and the download is multi-MB. The public instance has
   * already paid for it (or will, once), so the authed one is handed the
   * trimmed copy. Cold profile with no cache: the PUBLIC instance does the
   * unsigned load and the result is copied across.
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
    // Nothing cacheable came back (a venue whose table trims to nothing);
    // the authed instance loading its own is better than a BadSymbol throw.
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

  /**
   * Make `exchange` able to resolve `pair` without a blocking network load.
   * Synchronous by contract — it runs inside `subscribe`, which cannot await.
   */
  private primeMarkets(exchange: CcxtExchangeLike, pair: string): void {
    const seed = this.venue.synthesizeMarket?.(pair) ?? null
    this.markets.primeSync(exchange, seed)
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
    const symbol = toCcxtSymbol(pair)
    const exchange = await this.acquireFor(country)
    try {
      this.primeMarkets(exchange, pair)
      // A stand-in seed covers the pair we are asked for; anything else has to
      // wait for the real table or `market()` throws BadSymbol.
      if (!this.markets.hasSymbol(exchange, symbol)) {
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

  async fetchTickerSnapshot(country: string) {
    const exchange = await this.acquireFor(country)
    try {
      // Needs the REAL table: `safeMarket` invents a symbol from the raw venue
      // id for anything it cannot resolve, and 'BTCUSDT' has no base/quote
      // split to normalize.
      await this.markets.whenReady(exchange)
      return await fetchCcxtBulkTickers(exchange, this.venue.marketId)
    } catch (error) {
      throw this.classify(error, country)
    } finally {
      this.hub.touchIdle()
    }
  }

  private async acquireFor(country: string): Promise<CcxtExchangeLike> {
    // A region change has to rebuild: the REST base is baked into signed
    // requests and ccxt keeps per-instance endpoint caches that survive close().
    if (this.host.setCountry(country)) await this.host.close()
    const lease = await this.host.acquire()
    return lease.exchange
  }

  /**
   * Second line of defence for the geo signal.
   *
   * The FIRST is the transport: `withGeoClassification` inspects the HTTP
   * status before ccxt sees the response, because most venues' `handleErrors`
   * throws from the body alone and never mentions the status (ByBit answers a
   * 451 with `ExchangeError('bybit {}')` — there is nothing left to parse).
   *
   * This still earns its place for the errors ccxt raises itself rather than
   * from a response the bridge fetched: a `RestrictedLocation`, or a message
   * that does carry the code. Same rule either way — 451 is unambiguous, 403
   * only counts with body evidence.
   */
  private classify(error: unknown, country: string): unknown {
    if (!(error instanceof Error)) return error
    const message = error.message
    if (error.name === 'RestrictedLocation' || /\b451\b/.test(message)) {
      return new GeoRestrictedError(this.venue.displayName, country, 451)
    }
    if (/\b403\b/.test(message) && GEO_MARKERS.test(message)) {
      return new GeoRestrictedError(this.venue.displayName, country, 403)
    }
    return error
  }
}

const GEO_MARKERS = /restricted|region|country|location|unavailable in your/i

export function createCcxtConnectorPlugin(
  venue: CcxtVenueConfig,
  manifest: PluginManifest,
  options: CreateCcxtConnectorOptions = {},
): PluginInstance {
  const runtime = new CcxtVenueRuntime(venue, options)

  const spec: CexConnectorSpec<CexCredentials> = {
    id: manifest.id,
    marketId: venue.marketId,
    credentialKeys: venue.credentialKeys,
    defaultMode: venue.defaultMode,
    ...(venue.requiresDesktop ? { requiresDesktop: true } : {}),
    ...(venue.geoCheck ? { geoCheck: venue.geoCheck } : {}),
    // Runs in the SHELL, after slot resolution and outside the trading
    // runtime's try/catch — which is the whole point. A geo refusal raised
    // inside `placeOrder` comes back as `{success:false, error}` and the
    // terminal's region dialog, which keys on a thrown GeoRestrictedError,
    // never fires.
    ...(venue.tradeGeoCheck ? { tradeGeoCheck: venue.tradeGeoCheck } : {}),
    createWsClient: () => runtime.publicClient(),
    createPrivateWsClient: () => runtime.privateClient(),
    fetchCandles: (pair, timeframe, limit, country, endTs) =>
      runtime.fetchCandles(pair, timeframe, limit, country, endTs),
    fetchTickerSnapshot: (country) => runtime.fetchTickerSnapshot(country),
    fetchOpenOrders: (slot) => runtime.trading.fetchOpenOrders(slot),
    fetchOrderHistory: (slot) => runtime.trading.fetchOrderHistory(slot),
    fetchBalances: (slot) => runtime.trading.fetchBalances(slot),
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
    // client for the shell to tear down. So the runtime's teardown hangs off
    // the plugin's, not off a client that may not exist.
    destroy: async () => {
      await instance.destroy?.()
      await runtime.destroy()
    },
  }
}

function warn(marketId: string, scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[ccxt:${marketId}] ${scope}: ${message}`)
}
