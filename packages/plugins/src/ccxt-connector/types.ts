// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Structural types for the CCXT bridge.
 *
 * CCXT ships no TypeScript declarations on the deep `js/src/...` subpaths we
 * import (the package's typings sit behind the barrel, which we deliberately
 * never load — see index.ts), so the bridge declares the slice it actually
 * uses. Structural typing also makes the watch driver testable against a fake
 * exchange with no ccxt in the graph at all.
 */

/** A ccxt unified OHLCV row: [ts, open, high, low, close, volume]. */
export type CcxtOhlcvRow = Array<number | string | undefined>

/** A ccxt unified orderbook — `bids`/`asks` are LIVE, mutating arrays. */
export type CcxtOrderBookLike = {
  bids: Array<Array<number>>
  asks: Array<Array<number>>
  timestamp?: number | undefined
  nonce?: number | undefined
  symbol?: string | undefined
}

/** A ccxt unified ticker (only the fields the bridge reads). */
export type CcxtTickerLike = Record<string, unknown>

/** A ccxt unified public trade (only the fields the bridge reads). */
export type CcxtTradeLike = Record<string, unknown>

/**
 * The market entries we hand to `setMarkets` — the minimum `safeMarketStructure`
 * needs for symbol resolution, precision and order placement. See markets.ts
 * for why each field is load-bearing.
 */
export type CcxtMarketSeed = {
  id: string
  lowercaseId?: string
  symbol: string
  base: string
  quote: string
  baseId?: string
  quoteId?: string
  type: 'spot'
  spot: true
  active: boolean
  precision?: { amount?: number; price?: number }
  limits?: Record<string, { min?: number; max?: number }>
  info?: Record<string, unknown>
}

/**
 * The slice of a ccxt Pro exchange instance the bridge drives.
 *
 * Deliberately structural and deliberately narrow: everything here is either
 * called by the watch driver or overwritten by the exchange host.
 */
export type CcxtExchangeLike = {
  id: string
  has: Record<string, unknown>
  timeframes: Record<string, string>
  urls: Record<string, unknown>
  options: Record<string, unknown>
  markets?: Record<string, unknown> | undefined
  symbols?: Array<string> | undefined
  hostname?: string
  fetchImplementation?: unknown
  /** Bound once per client by ccxt — wrap it BEFORE the first socket opens. */
  handleMessage?: (client: unknown, message: unknown) => void

  setMarkets: (markets: Array<CcxtMarketSeed | unknown>) => unknown
  loadMarkets: (reload?: boolean) => Promise<unknown>
  market: (symbol: string) => Record<string, unknown>

  watchOHLCV: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<CcxtOhlcvRow>>
  watchTicker: (
    symbol: string,
    params?: Record<string, unknown>,
  ) => Promise<CcxtTickerLike>
  watchOrderBook: (
    symbol: string,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<CcxtOrderBookLike>
  watchTrades: (
    symbol: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<CcxtTradeLike>>

  unWatchOHLCV?: (symbol: string, timeframe?: string) => Promise<unknown>
  unWatchTicker?: (symbol: string) => Promise<unknown>
  unWatchOrderBook?: (symbol: string) => Promise<unknown>
  unWatchTrades?: (symbol: string) => Promise<unknown>

  fetchOHLCV: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<CcxtOhlcvRow>>
  fetchTickers: (
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, CcxtTickerLike>>

  close: (cleanInstanceCache?: boolean) => Promise<unknown>
}

export type CcxtExchangeCtor = new (
  config: Record<string, unknown>,
) => CcxtExchangeLike

/** Per-venue wiring for `createCcxtConnectorPlugin`. */
export type CcxtVenueConfig = {
  /** ccxt exchange id — 'binance', 'okx', … */
  exchangeId: string
  /** Pairlens market id (the capability `markets: [marketId]` scope key). */
  marketId: string
  /** Human label carried into typed errors and log lines. */
  displayName: string
  /**
   * Credential config keys copied into a slot by the CEX shell. A slot is only
   * created when every `required` key is present.
   */
  credentialKeys: Array<{ key: string; required: boolean }>
  /** Mode a slot takes when `initialize` supplies none. */
  defaultMode: 'paper' | 'live'
  /**
   * Loads the ccxt Pro class. MUST be a dynamic `import()` of a deep subpath
   * (`ccxt/js/src/pro/<id>.js`) so the venue's ~1 MB exchange class lands in
   * its own chunk and is never in the app's initial graph.
   */
  loadExchangeClass: () => Promise<CcxtExchangeCtor>
  /** Constructor options, merged over the bridge defaults. */
  options?: Record<string, unknown>
  /** Entries merged into `exchange.timeframes` (fills ccxt's gaps). */
  timeframeOverrides?: Record<string, string>
  /**
   * Point the instance at the right REST base and WS host for `country`.
   * Runs once per instance, right after construction — ccxt reads
   * `urls.api.*` on every call, but the REST base is also baked into signed
   * requests, so a region change rebuilds the instance rather than mutating it.
   */
  applyUrls?: (exchange: CcxtExchangeLike, country: string) => void
  /** Venue is unreachable from a CORS-constrained browser build. */
  requiresDesktop?: boolean
  /** Throw GeoRestrictedError to refuse a capability in a region. */
  geoCheck?: (country: string, capability: string) => void
  /**
   * Depth passed to `watchOrderBook`. Venue-specific enums apply (see the
   * venue matrix §1g) — an unsupported value throws at runtime on some venues.
   */
  orderbookDepth?: number
  /** Hard cap ccxt/the venue puts on one `fetchOHLCV` call. */
  maxHistoryLimit: number
  /**
   * Extra `fetchOHLCV` params for a paged (pan-left) read. Owns the venue's
   * cursor-inclusivity quirk; the result is filtered with `olderThan` anyway.
   */
  historyPageParams?: (endTs: number) => Record<string, unknown>
  /**
   * Inbound-silence budget before the socket is force-closed. Derived from
   * ccxt's `streaming.keepAlive` where the venue answers an app-level ping
   * (that pong IS inbound traffic); generous where it does not.
   */
  livenessTimeoutMs?: number
  /**
   * Stand-in market so a cold profile can subscribe before `loadMarkets`
   * finishes. Only supply it where the venue's market id is derivable from
   * BASE/QUOTE with certainty.
   */
  synthesizeMarket?: (pair: string) => CcxtMarketSeed | null
}
