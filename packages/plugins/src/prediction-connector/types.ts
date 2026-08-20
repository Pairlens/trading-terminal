// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The shapes the prediction bridge models, and the per-venue config that
 * drives it.
 *
 * These deliberately do NOT reuse `ccxt-connector/types.ts`. ccxt's prediction
 * classes extend `PredictionExchange`, not `Exchange`: every unified method is
 * keyed by an OUTCOME symbol rather than a `BASE/QUOTE` symbol, the market rows
 * carry no `symbol` at all, and `spot` is false everywhere — the three
 * assumptions the spot bridge's markets pipeline, parser and order builder are
 * all written on. Modelling the surface separately is what keeps a prediction
 * venue from silently taking a spot code path that returns nothing.
 */

import type { Timeframe } from '@pairlens/shared/types'

/** One ccxt unified OHLCV row: `[ts, open, high, low, close, volume]`. */
export type PredictionOhlcvRow = Array<number | string | undefined>

export type PredictionTickerLike = Record<string, unknown>
export type PredictionTradeLike = Record<string, unknown>
export type PredictionOrderLike = Record<string, unknown>
export type PredictionPositionLike = Record<string, unknown>
export type PredictionEventLike = Record<string, unknown>

export type PredictionOrderBookLike = {
  bids: Array<Array<number>>
  asks: Array<Array<number>>
  timestamp?: number | undefined
  nonce?: number | undefined
}

/**
 * The slice of a ccxt `PredictionExchange` this bridge touches.
 *
 * Structural rather than nominal so tests can drive a fake without importing
 * ccxt — the same reason the spot bridge models `CcxtExchangeLike` by hand.
 * Everything optional is genuinely optional: Kalshi has no `watch*` at all
 * (`pro: false`) and Polymarket has no `watchOHLCV`, and the runtime picks its
 * strategy from the venue config rather than probing at the call site.
 */
export type PredictionExchangeLike = {
  has: Record<string, unknown>
  urls: Record<string, unknown>
  options: Record<string, unknown>
  timeframes: Record<string, unknown>
  isSandboxModeEnabled?: boolean
  fetchImplementation?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>
  setSandboxMode?: (enabled: boolean) => void
  handleMessage?: (client: unknown, message: unknown) => unknown
  close: (closedByUser?: boolean) => Promise<unknown>

  fetchTicker: (
    outcome: string,
    params?: Record<string, unknown>,
  ) => Promise<PredictionTickerLike>
  fetchOrderBook: (
    outcome: string,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<PredictionOrderBookLike>
  fetchOHLCV: (
    outcome: string,
    timeframe?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionOhlcvRow>>
  fetchTrades: (
    outcome: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionTradeLike>>
  fetchEvents?: (
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionEventLike>>

  // ── Unscoped browse ──────────────────────────────────────────────────
  //
  // `fetchEvents` refuses a call carrying no scope selector, and a venue whose
  // scope vocabulary cannot express "what is busy right now" therefore cannot
  // serve an events browser through it at all. The members below are what such
  // a venue's `browseEvents` hook drives instead: its own raw listing endpoint,
  // run through ccxt's OWN parsers so the result is the identical
  // `PredictionEvent` shape and the outcome cache is populated exactly as
  // `fetchEvents` would have populated it.

  /** Venue-native raw event listing. Polymarket's gamma `/events`. */
  fetchRawEventsList?: (
    params?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>
  parseEventToMarkets?: (
    event: Record<string, unknown>,
  ) => Array<Record<string, unknown>>
  parseEvent?: (event: Record<string, unknown>) => PredictionEventLike
  /** Rebuilds the outcome cache from whatever is in `markets`. */
  populateOutcomes?: () => void
  createSafeDictionary?: () => Record<string, unknown>
  markets?: Record<string, unknown>

  watchTicker?: (
    outcome: string,
    params?: Record<string, unknown>,
  ) => Promise<PredictionTickerLike>
  watchOrderBook?: (
    outcome: string,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<PredictionOrderBookLike>
  watchTrades?: (
    outcome: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionTradeLike>>

  createOrder?: (
    outcome: string,
    type: string,
    side: string,
    amount: number,
    price?: number,
    params?: Record<string, unknown>,
  ) => Promise<PredictionOrderLike>
  cancelOrder?: (
    id: string,
    outcome?: string,
    params?: Record<string, unknown>,
  ) => Promise<PredictionOrderLike>
  fetchOpenOrders?: (
    outcome?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionOrderLike>>
  fetchClosedOrders?: (
    outcome?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionOrderLike>>
  fetchOrders?: (
    outcome?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionOrderLike>>
  fetchBalance?: (
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  fetchPositions?: (
    outcomes?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<Array<PredictionPositionLike>>
}

export type PredictionExchangeCtor = new (
  config: Record<string, unknown>,
) => PredictionExchangeLike

/**
 * ccxt's credential fields for the prediction venues.
 *
 * Wider than the spot bridge's `{apiKey, secret, password}` because neither
 * venue signs that way: Kalshi signs RSA-PSS with a PEM in `privateKey` and
 * never reads `secret`, and Polymarket signs EIP-712 with an EOA key plus the
 * funder address (or, alternatively, its derived L2 triple).
 */
export type PredictionCredentialSet = {
  apiKey?: string
  secret?: string
  password?: string
  privateKey?: string
  walletAddress?: string
}

/**
 * A provisioned credential, as the plugin shell holds it.
 *
 * `secretRef` is what makes the wallet path work: an EOA key never sits in the
 * slot, it is fetched from the terminal's wallet store per use (the same
 * accessor shape `evm-dex-connector` receives through `initialize`), so the key
 * material is never part of a long-lived object the rest of the runtime can
 * reach.
 */
export type PredictionSlot = {
  id: string
  kind: 'credential' | 'wallet'
  /** Non-secret fields copied from the initialize config. */
  fields: Record<string, string>
  /** Wallet slots only: resolves the EOA private key on demand. */
  secretRef: (() => Promise<string | null>) | null
  mode: 'paper' | 'live'
  country: string
  /** Last pair the slot traded — several venue reads need an outcome scope. */
  currentPair: string
  orderCallback: ((data: unknown) => void) | null
  balanceCallback: ((data: unknown) => void) | null
}

/** How the connector turns a Pairlens pair key into a ccxt outcome symbol. */
export type OutcomeAddressing =
  /** The pair key IS a valid ccxt id-form outcome symbol (Kalshi tickers). */
  | 'passthrough'
  /** The pair key is a sanitized handle resolved through the key map. */
  | 'mapped'

/**
 * Which market-order shapes the venue can actually honour.
 *
 * Deliberately two-valued. A third mode for "cost-denominated market buy only"
 * existed briefly and was removed: no venue shipped it, and its branch handed
 * `OrderParams.size` — a CONTRACT COUNT — to `createMarketBuyOrderWithCost`,
 * which reads its argument as COLLATERAL. An order for 10 contracts at 20¢
 * would have spent $10 and bought roughly 50. Adding it back means converting
 * count × price at the call site, not passing the count through.
 */
export type PredictionMarketOrderSupport =
  /** Both sides accept `type: 'market'`. */
  | 'native'
  /** Limit orders only. */
  | 'none'

export type PredictionVenueConfig = {
  /** ccxt exchange id, e.g. 'kalshi'. */
  exchangeId: string
  /** Pairlens market id — the manifest's capability scope. */
  marketId: string
  /** Human label used in error messages and geo dialogs. */
  displayName: string
  /**
   * MUST be a literal deep import of `ccxt/js/src/prediction/<id>.js`. The
   * barrel pulls every exchange class into the graph; a literal deep import
   * gives each ~1 MB class its own chunk.
   */
  loadExchangeClass: () => Promise<PredictionExchangeCtor>
  /** Timeframes the venue's own OHLCV endpoint accepts. Nothing else is sent. */
  timeframes: Array<Timeframe>
  /** Collateral currency of the venue's contracts ('USD', 'USDC'). */
  collateral: string
  credentialKeys: Array<{ key: string; required: boolean }>
  /** Credentials arrive as a wallet (address + key accessor), not a key pair. */
  walletCredentials?: boolean
  defaultMode: 'paper' | 'live'
  /** Venue is unreachable from a browser build — see the manifest flag's doc. */
  requiresDesktop?: boolean
  /**
   * A `/__*` dev proxy prefix in apps/terminal/vite.config.ts covers this
   * venue's REST hosts, so `requiresDesktop` must not refuse under
   * `bun run dev`. Neither prediction venue has one — see `isVenueRestBlocked`.
   */
  devProxy?: boolean
  outcomeAddressing: OutcomeAddressing
  /** REST polling (`pro: false`) or ccxt `watch*` run-loops. */
  streaming: 'poll' | 'watch'
  marketOrders: PredictionMarketOrderSupport
  /** Extra ccxt constructor config (options, streaming knobs). */
  options?: Record<string, unknown>
  /** Throw `GeoRestrictedError` to refuse market data in a region. */
  geoCheck?: (country: string, capability: string) => void
  /** Throw `GeoRestrictedError` to refuse ORDER placement for a slot. */
  tradeGeoCheck?: (slot: PredictionSlot) => void
  /** Slot fields (plus a resolved wallet key) → ccxt's credential fields. */
  toCcxtCredentials: (
    fields: Record<string, string>,
  ) => PredictionCredentialSet | null
  /**
   * The events browser's cold open: what this venue answers with when nothing
   * has been searched for or filtered to.
   *
   * `fetchEvents` REQUIRES a scope selector, because an unscoped call would
   * page the venue's whole universe and ccxt throws `ArgumentsRequired` rather
   * than try. But no venue's scope vocabulary can express "the busiest events
   * right now", which is exactly what a browser opens on: Polymarket declares
   * no `eventScopeParams` at all, and Kalshi's are category and series ticker,
   * neither of which means "busy". So a browse goes to the venue's own ranked
   * listing instead and returns the same `PredictionEvent[]` `fetchEvents`
   * would have. A venue that genuinely can express its cold open as a scope is
   * free to implement this by calling `fetchEvents` with it.
   */
  browseEvents?: (
    exchange: PredictionExchangeLike,
    limit: number,
  ) => Promise<Array<PredictionEventLike>>
  /** Poll cadences, ms. Ignored when `streaming: 'watch'`. */
  pollIntervals?: {
    candles?: number
    ticker?: number
    orderbook?: number
    trades?: number
  }
  /** Watch mode: how long inbound silence may last before a forced rebuild. */
  livenessTimeoutMs?: number
  /** Book depth passed to fetch/watchOrderBook; undefined means venue default. */
  orderbookDepth?: number
}
