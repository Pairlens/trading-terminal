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
import { fetchCcxtBulkTickers, fetchCcxtHistory } from './rest'
import { mapTimeframeToCcxt, toCcxtSymbol } from './parser'
import { CcxtStreamHub } from './watch-driver'
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
import type { MarketsStorage } from './markets'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'
import type { Candle } from '@pairlens/shared/types'

export type { CcxtVenueConfig, CcxtExchangeLike, CcxtMarketSeed } from './types'
export { CcxtStreamHub } from './watch-driver'
export { CcxtExchangeHost } from './exchange-host'
export {
  CcxtMarketsProvider,
  memoryMarketsStorage,
  trimMarket,
  trimMarkets,
} from './markets'

/** Trading is a follow-up phase; the hooks exist so the shell dispatch is real. */
const TRADING_TODO = 'not yet implemented'

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
  private client: CexPublicWsClient | null = null

  constructor(
    private readonly venue: CcxtVenueConfig,
    options: CreateCcxtConnectorOptions = {},
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
   * ccxt collapses every HTTP failure into its own error classes, so the geo
   * signal the terminal's region dialog keys off has to be recovered from the
   * status code ccxt embeds in the message. Same classification as
   * `assertResponseOk`: 451 is unambiguous, 403 only counts with body evidence.
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

/** Trading arrives in the follow-up phase; the socket never opens today. */
function stubPrivateWsClient(): CexPrivateWsClient<CexCredentials> {
  return {
    connect: () => {},
    destroy: () => {},
  }
}

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
    createWsClient: () => runtime.publicClient(),
    createPrivateWsClient: stubPrivateWsClient,
    fetchCandles: (pair, timeframe, limit, country, endTs) =>
      runtime.fetchCandles(pair, timeframe, limit, country, endTs),
    fetchTickerSnapshot: (country) => runtime.fetchTickerSnapshot(country),
    fetchOpenOrders: async () => [],
    fetchOrderHistory: async () => [],
    fetchBalances: async () => [],
    cancelOrder: async () => ({
      success: false,
      error: `${venue.displayName} order cancel: ${TRADING_TODO}`,
    }),
    placeOrder: async () => ({
      success: false,
      error: `${venue.displayName} order placement: ${TRADING_TODO}`,
    }),
  }

  return createCexConnectorPlugin(spec, manifest)
}

function warn(marketId: string, scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[ccxt:${marketId}] ${scope}: ${message}`)
}
