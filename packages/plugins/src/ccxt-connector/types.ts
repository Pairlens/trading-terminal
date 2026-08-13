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

import type { CexCredentials, CexSlot } from '../cex-connector'

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

  // ── Trading ────────────────────────────────────────────────────────────
  //
  // Optional on the structural type, not because ccxt omits them (every
  // exchange class inherits all of these from the base) but because the
  // bridge must be drivable by a fake that implements only the read path —
  // and because `has[...]` is the real capability signal anyway, so every
  // call site checks that first.

  /** Set by `setSandboxMode`; unreliable on venues whose `urls.test` is undefined. */
  isSandboxModeEnabled?: boolean
  /**
   * Swaps `urls.api` for `urls.test` — or, on venues that override it
   * (Bitget), flips a demo-trading flag that only changes a header. Throws
   * `NotSupported` when the venue has neither, and silently BLANKS
   * `urls.api` when `urls.test` is present-but-undefined (Kraken, Upbit and
   * six others), which is why `exchange-host` verifies the result instead of
   * trusting the call.
   */
  setSandboxMode?: (enabled: boolean) => void

  createOrder?: (
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  /** Quote-denominated market buy. Each venue's override owns its own quirk. */
  createMarketBuyOrderWithCost?: (
    symbol: string,
    cost: number,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  createMarketSellOrderWithCost?: (
    symbol: string,
    cost: number,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  createMarketOrderWithCost?: (
    symbol: string,
    side: string,
    cost: number,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  cancelOrder?: (
    id: string,
    symbol?: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
  fetchOpenOrders?: (
    symbol?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>
  fetchClosedOrders?: (
    symbol?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>
  fetchOrders?: (
    symbol?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>
  fetchBalance?: (
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>

  watchOrders?: (
    symbol?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>
  watchBalance?: (
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>

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

/**
 * What an instance IS, handed to the URL hooks alongside the country.
 *
 * Regional routing is not one decision per venue, it is one decision per
 * instance: OKX public reads may fall back to the CORS-enabled global host from
 * a browser build, but ORDERS always go to the caller's regional entity — that
 * is the boundary with legal meaning. Without this the whole instance inherits
 * whichever answer the read path wanted, and an EEA user's orders leave for
 * `www.okx.com`, where the key does not exist (50119).
 */
export type CcxtUrlContext = {
  /**
   * The instance signs its requests — a trading or private-stream instance.
   * `false` is the market-data instance, which must never carry a signature.
   */
  authed: boolean
  /** The instance is being routed at the venue's sandbox/demo environment. */
  paper: boolean
  /**
   * The credential's declared home entity, for venues whose keys exist on
   * exactly one regional legal entity (OKX: 'global' | 'eea' | 'us'). Routing
   * by the user's country is only a guess at that entity, and it is wrong for
   * anyone trading away from where they registered — the venue then disowns
   * the key (OKX 50119) in a way that reads like a typo. Absent or '' means
   * "route by country"; only authed instances can carry one, because only a
   * credential has a home.
   */
  entity?: string
}

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
   *
   * `ctx` says what this instance is. Read it wherever public and authed
   * traffic route differently (OKX's CORS fallback is public-only).
   */
  applyUrls?: (
    exchange: CcxtExchangeLike,
    country: string,
    ctx: CcxtUrlContext,
  ) => void
  /** Venue is unreachable from a CORS-constrained browser build. */
  requiresDesktop?: boolean
  /**
   * Throw GeoRestrictedError to refuse a capability in a region. Runs at the
   * top of BOTH `execute` and `subscribe`, before slot resolution, with the
   * app-level country — so a refusal from `subscribe` is SYNCHRONOUS, which is
   * what the terminal's region dialog keys on.
   */
  geoCheck?: (country: string, capability: string) => void
  /**
   * Geo gate for `trading:orders` execute, run AFTER credential-slot
   * resolution with the SLOT's country.
   *
   * Two reasons this cannot be folded into `geoCheck`: the country a
   * credential was provisioned under is not necessarily the app-level one, and
   * running before slot resolution would report a geo error to a user whose
   * real problem is that they have no credentials at all.
   *
   * It must live here rather than lean on `applyUrls` throwing during the
   * instance build: everything on the trading path is caught and returned as
   * `{success:false, error}` (see orders.ts), which silently downgrades a typed
   * `GeoRestrictedError` into a plain order rejection and the region dialog
   * never fires.
   */
  tradeGeoCheck?: (slot: CexSlot<CexCredentials>) => void
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
   * Full-context version of `historyPageParams`, and takes precedence over it.
   *
   * Coinbase cannot express "the 300 bars before T": its REST candles endpoint
   * demands BOTH `start` and `end`, rejects an inverted pair with a 400 and
   * rejects a window wider than ~350 bars — so the cursor alone is not enough
   * to build a request, the timeframe and the limit are needed to size the
   * window. ccxt's own default (`start = now - limit·duration`) is only
   * correct for the first, unpaged page.
   */
  historyParams?: (ctx: {
    timeframe: string
    limit: number
    endTs?: number
  }) => Record<string, unknown>
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

  // ── Trading (all optional; every default is derived from ccxt) ──────────

  /**
   * Fix up the endpoints `setSandboxMode(true)` installed. It replaces the
   * whole `urls.api` subtree with `urls.test`, so anything `applyUrls` did —
   * a portless WS host, a regional REST base — is gone by the time a paper
   * instance makes its first call. Runs only on paper instances, after the
   * sandbox is enabled.
   */
  applyPaperUrls?: (
    exchange: CcxtExchangeLike,
    country: string,
    ctx: CcxtUrlContext,
  ) => void
  /**
   * Params merged into every `createOrder` call on this venue.
   */
  orderParams?: Record<string, unknown>
  /**
   * Params that make an order a dry run on a venue with no sandbox
   * environment (Kraken: `{ validate: true }`). Without either, a paper slot
   * is refused rather than routed to the live matching engine.
   */
  paperOrderParams?: Record<string, unknown>
  /**
   * Params that address the venue's trigger-order id space on cancel and on
   * the second `fetchOpenOrders` pass. Defaults to `{ trigger: true, stop:
   * true }` — ccxt reads both spellings (`safeValue2(params,'stop','trigger')`)
   * and which one a venue honors changed across releases.
   */
  triggerQueryParams?: Record<string, unknown>
  /**
   * Force trigger-order support on or off. Default: derived from
   * `exchange.has` (`createTriggerOrder` / `createStopLossOrder` /
   * `createTakeProfitOrder` / `createStopOrder`), which is `false` on Upbit
   * and true everywhere else in the fleet.
   */
  supportsTriggerOrders?: boolean
  /**
   * REST poll cadence for the private state ccxt cannot stream on this venue
   * (Coinbase has no `watchBalance`). Default 15 s, and only while a private
   * subscription is open.
   */
  privatePollMs?: number
  /**
   * Rewrite a trading-path error message the user cannot act on into one they
   * can. Runs on every rejection and warning after secret redaction, with the
   * slot for routing context. Return the message unchanged when it isn't
   * yours. OKX uses this for 50119: a key rejected by the wrong regional
   * entity reads like a typo'd key, and the fix — picking the account's
   * entity on the Accounts card — is not something an error code teaches.
   */
  describeTradingError?: (
    message: string,
    slot: CexSlot<CexCredentials>,
  ) => string
}
