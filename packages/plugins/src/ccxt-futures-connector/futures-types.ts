// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Structural types for the futures runtime.
 *
 * Both of the shapes here EXTEND the spot bridge's rather than restating it.
 * That is deliberate and load-bearing: the futures runtime reuses
 * `CcxtExchangeHost`, `CcxtStreamHub` and `fetchCcxtHistory` verbatim, all of
 * which are written against `CcxtVenueConfig` / `CcxtExchangeLike`, so an
 * intersection is what lets a futures venue be handed to them with no cast and
 * no second copy of the reconnect, liveness and region policy.
 */

import type { CcxtExchangeLike, CcxtVenueConfig } from '../ccxt-connector/types'

/**
 * A trimmed linear-perp market row, as `setMarkets` wants it.
 *
 * Every flag is stated explicitly because ccxt's `setMarkets` does NOT infer
 * them: `safeMarketStructure` seeds each one as `undefined` and the merge drops
 * undefined keys, so an omitted `contract: true` leaves the flag falsy and
 * ccxt's KuCoin class quietly routes the subscription to the SPOT topic
 * (`pro/kucoin.js` branches on `market['contract']` for every channel).
 *
 * - `settle` / `settleId` are what make the symbol a perp at all — ccxt builds
 *   `BASE/QUOTE:SETTLE` from them and several venues sign with `settleId`.
 * - `contractSize` converts a contract count to a base amount and is not 1 on
 *   every venue (KuCoin's XBTUSDTM is 0.001 BTC). The ticket's base-equivalent
 *   hint and the risk guard's notional both read it.
 * - `info` keeps the venue payload keys the order path reads. Binance's
 *   `createOrder` throws `InvalidOrder` without `info.orderTypes`, on futures
 *   exactly as on spot.
 */
export type CcxtFuturesMarketSeed = {
  id: string
  lowercaseId?: string
  symbol: string
  base: string
  quote: string
  settle: string
  baseId?: string
  quoteId?: string
  settleId?: string
  type: 'swap'
  spot: false
  swap: true
  future: false
  option: false
  margin: false
  index: false
  contract: true
  linear: true
  inverse: false
  active: boolean
  contractSize?: number
  precision?: { amount?: number; price?: number }
  limits?: Record<string, { min?: number; max?: number }>
  info?: Record<string, unknown>
}

/**
 * The derivatives slice of a ccxt Pro exchange, on top of the spot surface.
 *
 * All optional: the runtime must be drivable by a fake that implements only the
 * read path, and `has[...]` is the capability signal every call site checks
 * first anyway.
 */
export type CcxtFuturesExchangeLike = CcxtExchangeLike & {
  fetchPositions?: (
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>
  watchPositions?: (
    symbols?: Array<string>,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>
  setLeverage?: (
    leverage: number,
    symbol?: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
  setMarginMode?: (
    marginMode: string,
    symbol?: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
  fetchFundingRate?: (
    symbol: string,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  /**
   * Every contract's rate in one call. Declared `false` by KuCoin, which is
   * why `funding.ts` checks `has` rather than the method's presence — the
   * method is inherited from the base class on all three venues and throws.
   */
  fetchFundingRates?: (
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
  /** Per-contract funding periods; only Binance publishes a table. */
  fetchFundingIntervals?: (
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
  fetchFundingRateHistory?: (
    symbol?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
  fetchOpenInterest?: (
    symbol: string,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  fetchOpenInterests?: (
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
  fetchOpenInterestHistory?: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<unknown>
}

/** Per-venue wiring for `createCcxtFuturesConnectorPlugin`. */
export type CcxtFuturesVenueConfig = CcxtVenueConfig & {
  /**
   * The highest leverage the venue accepts on any linear perp, published as
   * `MarketAdapterInfo.maxLeverage` so the ticket can clamp its selector.
   *
   * Venue-wide rather than per instrument on purpose: the real cap is per
   * symbol and per position tier and only a `fetchLeverageTiers` round trip
   * knows it, which is not a call the ticket can make on every keystroke. The
   * venue still owns the final refusal.
   */
  maxLeverage: number
  /**
   * The venue has no sandbox at all, so a paper credential cannot be honoured.
   * Refused with this sentence rather than routed to the live matching engine.
   */
  noPaperReason?: string
  /**
   * How many hours pass between funding settlements on this venue, when ccxt's
   * own row does not say.
   *
   * Load-bearing rather than cosmetic: an annualised rate is the per-interval
   * rate times the number of intervals in a year, so assuming eight hours on a
   * venue that settles hourly understates the carry eightfold. Binance's
   * premium-index rows carry no period at all, which is why this has to be
   * declared; where the venue DOES state one, `funding.ts` prefers it and
   * stamps `intervalKnown`.
   */
  fundingIntervalHours?: number
  /**
   * Open interest for venues ccxt gives no `fetchOpenInterest*` method.
   *
   * Returns rows in ccxt's own open-interest shape (`symbol`,
   * `openInterestAmount`, `openInterestValue`, `timestamp`) so the caller has
   * one mapping path. Kraken Futures is the case it exists for: its ticker
   * payload carries `openInterest` on every contract and ccxt parses those
   * tickers already, it simply never projects them onto the unified structure.
   */
  openInterestFallback?: (
    exchange: CcxtFuturesExchangeLike,
    symbols: Array<string>,
  ) => Promise<Array<Record<string, unknown>>>
}
