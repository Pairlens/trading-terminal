// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  Candle,
  CandleCallback,
  Instrument,
  InstrumentFilter,
  OrderParams,
  OrderResult,
  OrderbookCallback,
  TickerCallback,
  TickerSnapshot,
  TradesCallback,
} from './types'

export type AssetClass =
  | 'crypto-spot'
  | 'crypto-perp'
  | 'stocks'
  | 'prediction'
  | 'dex'

export type WalletChain = 'solana' | 'ethereum' | 'bitcoin'

export type MarketAdapterCapability = 'read' | 'trade'

export type CredentialField = {
  key: string
  label: string
  type: 'text' | 'secret'
  required: boolean
  placeholder?: string
}

export type MarketAdapterInfo = {
  marketId: string
  displayName: string
  assetClasses: Array<AssetClass>
  capabilities: Array<MarketAdapterCapability>
  credentialSchema: Array<CredentialField>
  supportedTimeframes: Array<string>
  iconUrl?: string
  walletChain?: WalletChain
  /** DEX venues only: the connector supports resting limit orders. */
  dexLimitOrders?: boolean
  /** Exchange-native trigger (TP/SL) orders via OrderParams.trigger. */
  triggerOrders?: boolean
  /**
   * The venue's book cannot honour a `type: 'market'` order at all — every
   * order carries a price (Kalshi). The ticket hides the market/limit toggle
   * on the strength of it rather than letting the venue reject the submit.
   *
   * Equivalent to `marketOrders === 'none'`, and derived from it when a venue
   * declares only that one: two fields that can disagree about the same fact
   * is a bug waiting for whichever surface reads the other one.
   */
  limitOnly?: boolean
  /**
   * How a market order reaches the book, when the venue declares it: `'none'`
   * (limit-only — the `limitOnly` case) or `'native'` (the venue accepts a
   * priceless order). Absent means the CEX default, which is native.
   */
  marketOrders?: 'none' | 'native'
  /**
   * Venue that cannot work in a browser build, because its public REST host
   * refuses cross-origin requests — either by sending no
   * `Access-Control-Allow-Origin` at all, or by answering a foreign `Origin`
   * with an outright 403 (Kalshi, which does serve candle history and simply
   * will not serve it to a browser). The venue picker marks it, and the
   * connector refuses with a PlatformRestrictedError rather than presenting a
   * chart that never seeds. Always reachable on desktop, which fetches from
   * Rust and is CORS-exempt.
   */
  requiresDesktop?: boolean
  /**
   * Venue with no public market-data feed: candles, quotes and the book are
   * all served from the user's own credentialed session (Alpaca). Without a
   * key nothing streams, and the honest answer is "connect" or "unlock" — not
   * a switching badge that never resolves. Panes read this to say so, and the
   * terminal re-subscribes them when a credential is finally provisioned.
   */
  credentialedMarketData?: boolean
  /**
   * Perpetual-futures venues: the highest leverage the venue will accept on any
   * of its linear perps. The ticket clamps its selector to this rather than
   * offering a number the venue rejects at submit time.
   *
   * A venue-wide ceiling, not a per-instrument one — the real cap is per symbol
   * and per position tier, and only the venue knows it. So this is the top of
   * the selector, and the venue still owns the final refusal.
   */
  maxLeverage?: number
}

export interface MarketAdapter {
  getInfo: () => MarketAdapterInfo

  // Streaming
  subscribeCandles: (
    pair: string,
    timeframe: string,
    country: string,
    cb: CandleCallback,
  ) => () => void
  subscribeTicker: (
    pair: string,
    country: string,
    cb: TickerCallback,
  ) => () => void
  subscribeOrderbook: (
    pair: string,
    country: string,
    cb: OrderbookCallback,
  ) => () => void
  /**
   * Public trade feed (time and sales). Optional: a venue only implements it
   * once its aggressor-side semantics are established, since a wrong mapping
   * inverts the whole tape. Callers must treat its absence as "this venue has
   * no trade feed" rather than an error.
   */
  subscribeTrades?: (
    pair: string,
    country: string,
    cb: TradesCallback,
  ) => () => void

  // One-shot data
  fetchHistoricalCandles: (
    pair: string,
    timeframe: string,
    limit: number,
    country: string,
  ) => Promise<Array<Candle>>
  fetchTicker: (pair: string, country: string) => Promise<TickerSnapshot>
  getInstruments: (filter?: InstrumentFilter) => Promise<Array<Instrument>>

  // Trading (optional — only if capability includes 'trade')
  placeOrder?: (params: OrderParams) => Promise<OrderResult>
  cancelOrder?: (orderId: string) => Promise<OrderResult>

  // Credentials (optional — only if capability includes 'trade')
  setCredentials?: (credentials: Record<string, string>) => void

  // Lifecycle
  destroy: () => void
}
