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
  /**
   * OKX's numeric instrument code, a top-level unified-market field its WS
   * trade API requires (`createOrderWs` sends `instIdCode` in place of
   * `instId`; the demo/EEA endpoint rejects orders without it — measured
   * 2026-08-14, sCode 50014). Absent everywhere else.
   */
  instIdCode?: number
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
  /**
   * ccxt's per-symbol ticker cache, rewritten (object REPLACED, not mutated)
   * on every inbound ticker frame. The ticker fan reads it because a
   * `watchTickers` future resolves for only ONE of the frames in a batched
   * burst — the rest land only here (see the fan's cache sweep).
   */
  tickers?: Record<string, CcxtTickerLike> | undefined
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
  /** Batched ticker stream — see `CcxtVenueConfig.batchTickers`. */
  watchTickers?: (
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, CcxtTickerLike>>
  unWatchTickers?: (
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
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
  /** WS-native order placement — see `CcxtVenueConfig.wsOrders`. */
  createOrderWs?: (
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  cancelOrderWs?: (
    id: string,
    symbol?: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
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
  /** REST book snapshot — the first-paint seed, see `seedOrderBook`. */
  fetchOrderBook?: (
    symbol: string,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<CcxtOrderBookLike>
  /** REST recent public trades — the tape's first-paint seed, see `seedTrades`. */
  fetchTrades?: (
    symbol: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<CcxtTradeLike>>
  fetchTicker?: (
    symbol: string,
    params?: Record<string, unknown>,
  ) => Promise<CcxtTickerLike>
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
   * Multiplex every ticker subscription through ONE `watchTickers(symbols)`
   * call instead of one `watchTicker` per pair.
   *
   * Exists for venues whose ccxt class shards subscriptions across
   * connections (Binance's `stream()` gives each new subscription hash its
   * own socket): a 15-pair watchlist otherwise dials 15 TLS+WS handshakes on
   * a fresh page load and the chips fill in one by one. A batched call is a
   * single socket carrying a single SUBSCRIBE frame listing every stream —
   * one inbound message, so Binance's ~5 msg/s per-connection limit (the
   * reason a low `streamLimits` cap is forbidden, see venues/binance.ts)
   * cannot be tripped no matter how many pairs the list holds.
   *
   * Opt-in per venue rather than derived from `has.watchTickers`: on venues
   * that already share one socket per URL (everyone but Binance) batching
   * buys nothing and adds a resubscribe on every watchlist change.
   */
  batchTickers?: boolean
  /**
   * Paint the first order-book frame from a REST snapshot fired AT SUBSCRIBE
   * TIME, in parallel with the WebSocket dial.
   *
   * Exists for venues whose ccxt book algorithm is diff-stream + REST
   * snapshot (Binance): the stream cannot deliver anything until the socket
   * is dialed, the SUBSCRIBE is acked, a REST snapshot is fetched and the
   * buffered diffs are replayed against it — 1.5-2.5 s end to end, while
   * snapshot-push venues (OKX, ByBit, Kraken, Crypto.com) hand the book over
   * in their first socket frame. The seed is a plain `fetchOrderBook` racing
   * that pipeline; whichever arrives first paints, and the stream's own
   * synced snapshot always supersedes. Correctness is untouched — the seed
   * is display-only and never enters ccxt's book state.
   *
   * Also earns its keep on the buffered-delta venues (MEXC, KuCoin, Gate):
   * their ccxt classes buffer `snapshotDelay` diff FRAMES before even
   * requesting the REST snapshot, so the stream cannot paint for seconds —
   * unbounded on a quiet pair, where frames only arrive when the book moves.
   *
   * A number enables the seed AND overrides the REST depth, for venues
   * whose REST book endpoint accepts different limits than their WS
   * subscription (KuCoin's public REST serves exactly 20 or 100 levels;
   * `orderbookDepth` is 50). `true` fetches `orderbookDepth`.
   */
  seedOrderBook?: boolean | number
  /**
   * Fill the tape's first paint from REST `fetchTrades`, for venues whose
   * trade stream opens EMPTY (Binance sends only new prints — on a quiet
   * pair the pane sits blank until the next market trade). The per-key
   * trade-id memory dedupes the overlap when the stream starts, so no print
   * ever doubles.
   *
   * NEVER enable on a venue whose candles are derived from the trades
   * stream (`liveSource: 'trades'` folds — Coinbase, Upbit): the seed's
   * historical prints would re-add their volume to the forming bar. Also
   * skip venues whose stream already opens with a snapshot (Bitfinex) and
   * venues whose REST budget is a strict serial queue (Kraken at 1 s/call —
   * a seed there would delay the chart backfill behind it).
   *
   * A number enables the seed AND overrides the page size, for venues whose
   * recent-trades endpoint caps below the default 100 (ByBit spot: 60).
   */
  seedTrades?: boolean | number
  /**
   * Hold the tape seed back this long before its REST fetch, for venues whose
   * throttler is a strict serial queue (Kraken: ~1 s per public call). Fired
   * at subscribe time the seed would enter the queue AHEAD of the chart's
   * candle backfill and delay the primary pane by a full slot; delayed past
   * the subscribe burst it runs in the queue's idle tail instead. Only read
   * when `seedTrades` is enabled.
   */
  seedTradesDelayMs?: number
  /**
   * Paint the ticker's first frame from REST `fetchTicker`, for venues whose
   * per-symbol ticker stream emits only when the pair TRADES — on a quiet
   * pair the price header sits on '—' for seconds (measured 2026-08-14:
   * KuCoin 7 s, Gate 8.5 s worst-case first frame). Same contract as the
   * other seeds: delivered only while the key has never painted, any WS
   * frame wins the race, failure is silent. Venues whose subscribe already
   * answers with a ticker snapshot (OKX, ByBit, Kraken, Crypto.com, HTX,
   * Upbit) don't need it, and `batchTickers` venues have the fan's own
   * batched REST seed instead.
   */
  seedTicker?: boolean
  /**
   * Replace the ticker seed's `fetchTicker` with a cheaper venue call. MEXC's
   * unified fetchTicker maps to `ticker/24hr` at throttle weight 25 — 1.25 s
   * of budget at its 50 ms rateLimit, which starved the chart backfill queued
   * behind the seed (measured: chart 0.56 s → 1.8 s). Its `avgPrice` endpoint
   * answers a current price at weight 1. The hook returns a (possibly
   * partial) unified ticker; the WS frame that follows carries the full
   * 24 h fields. Only read when `seedTicker` is enabled.
   */
  seedTickerFetch?: (
    exchange: CcxtExchangeLike,
    symbol: string,
  ) => Promise<CcxtTickerLike>
  /**
   * Never call the venue's `unWatch*` methods — count every release as an
   * orphaned channel instead, letting the threshold rebuild shed them.
   *
   * Exists for Coinbase, whose ccxt unsubscribe path is broken in a way
   * that poisons the whole instance (verified live on ccxt 4.5.71,
   * 2026-08-14): `unSubscribe` sets `options.unSubscriptionPending` and
   * awaits an ack that `handleSubscriptionStatus` only matches when the
   * post-unsubscribe subscription list comes back EMPTY — never true while
   * any other channel is live. The flag wedges true (every later unWatch
   * throws 'another unSubscription is pending'), and the unsubscribed
   * channel keeps its local subscription entry, so a re-watch parks a
   * future on a channel the server no longer sends: revisiting a pair
   * leaves its price header dead forever, even on BTC-USD.
   */
  suppressUnwatch?: boolean
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
  /**
   * Keep `fetchCurrencies` enabled on the PUBLIC instance. By default the
   * host disables it there: ccxt's `loadMarketsHelper` awaits currencies
   * before markets — a serialized public round trip plus a throttle slot in
   * front of the download first paint is waiting on — and the bridge's
   * trimmed table stores no currency fields. Kraken is the one venue that
   * needs it: its `parseMarkets` reads `options.cachedCurrencies` to widen
   * amount precision, and the authed instance inherits the public table.
   */
  needsPublicCurrencies?: boolean
  /**
   * Carry venue-negotiated connection state across the host's discard-and-
   * rebuild lifecycle. `captureOptions` runs as an instance is closed;
   * `seedOptions` runs on the next instance built for the SAME country, with
   * whatever capture returned. The host discards instances on purpose (it is
   * the only reliable way to clear ccxt's per-instance `options` caches), but
   * some of that state is expensive to re-earn — KuCoin's bullet-token URL is
   * a serial REST POST in front of every cold WS connect, and the token is
   * valid for ~24 h. The venue owns what is safe to carry and for how long.
   */
  captureOptions?: (exchange: CcxtExchangeLike) => unknown
  seedOptions?: (exchange: CcxtExchangeLike, captured: unknown) => void

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
   * The venue's ccxt class gates BASE-denominated market buys on a price
   * (`createMarketBuyOrderRequiresPrice`) so it can compute the cost to spend
   * — without one, `createOrder` throws client-side before any request. Six of
   * the fourteen are in this state (Gate, Coinbase, Bitget, HTX, Crypto.com,
   * Upbit); the flag cannot be read generically at runtime because it hides in
   * a different `options` corner per venue (Bitget nests it under
   * `options.createOrder`, Crypto.com defaults it true with no entry at all).
   * Set it and the trading runtime fetches a reference price and passes it
   * through, restoring the native connectors' base→quote conversion.
   */
  marketBuyRequiresPrice?: boolean
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
   * `false` when the venue keeps trigger orders in the SAME book as regular
   * ones — its `fetchOpenOrders` ignores the trigger flag, so the second
   * probe would be a byte-for-byte duplicate signed request whose rows the
   * id de-dup throws away (Kraken; Binance spot). Defaults to true: probing
   * an id space that turns out shared costs a duplicate call, skipping one
   * that is real hides resting TP/SLs from the order pane.
   */
  separateTriggerOrderBook?: boolean
  /**
   * Place and cancel over the venue's WebSocket trade API
   * (`createOrderWs`/`cancelOrderWs`) instead of signed REST. After the first
   * call the authed socket stays open on the trading instance, so an order is
   * one frame instead of a TLS+HTTP round trip, and it leaves the REST
   * rate-limit budget to the open-orders/balances polls.
   *
   * Deliberately opt-in per venue rather than derived from `has`: the WS URL
   * must be one the venue's `applyUrls`/`applyPaperUrls` actually route
   * (Binance's `ws-api` host ignores the US split, OKX's private socket
   * carries the regional-entity stakes), and the venue's sandbox must serve
   * the trade socket. Enabled where the host is single and static: Kraken,
   * Crypto.com, Bitvavo, Gate — all already inside the desktop CSP baseline.
   */
  wsOrders?: boolean
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
