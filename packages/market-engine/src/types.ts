// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'

export type { Candle }

export type CandleUpdate = {
  type: 'snapshot' | 'update'
  candles: Array<Candle>
}

export type TickerSnapshot = {
  last: number
  bid: number
  ask: number
  high24h: number
  low24h: number
  volume24h: number
  change24h: number
  ts: number
}

export type TickerUpdate = {
  type: 'ticker'
  ticker: TickerSnapshot
}

export type OrderbookLevel = [price: number, size: number]

export type OrderbookUpdate = {
  type: 'snapshot' | 'update'
  bids: Array<OrderbookLevel>
  asks: Array<OrderbookLevel>
  ts: number
}

/**
 * A single public execution off the venue's trade feed (time and sales).
 *
 * `side` is the AGGRESSOR — the taker who crossed the spread — not the maker
 * whose resting order was hit. Venues disagree about which side they report
 * (Binance sends "was the buyer the maker?", OKX sends the taker directly),
 * so each connector normalizes to this meaning. Getting it backwards silently
 * inverts every buy/sell in the tape, so connectors must not guess: a venue
 * whose semantics aren't established simply doesn't declare the capability.
 *
 * `id` is the venue's own trade id, used to drop duplicates across a
 * reconnect — feeds commonly replay a few executions after a resubscribe.
 */
export type Trade = {
  id: string
  price: number
  size: number
  side: OrderSide
  ts: number
}

export type TradesUpdate = {
  type: 'snapshot' | 'update'
  trades: Array<Trade>
}

export type OrderSide = 'buy' | 'sell'
export type OrderType = 'market' | 'limit'

export type OrderTriggerType = 'tp' | 'sl'

/**
 * Exchange-native trigger (algo/stop) order section. When present on
 * OrderParams, the order rests on the exchange and activates when the
 * market crosses triggerPrice — `type: 'market'` executes at market on
 * trigger, `type: 'limit'` places a limit at `price` on trigger. Only
 * connectors advertising `triggerOrders` in their MarketAdapterInfo
 * accept it; others must reject the order.
 */
export type OrderTrigger = {
  triggerPrice: string
  triggerType: OrderTriggerType
}

export type OrderParams = {
  market: string
  pair: string
  side: OrderSide
  type: OrderType
  size: string
  price?: string
  trigger?: OrderTrigger
  mode: 'paper' | 'live'
  tgtCcy?: string // 'base_ccy' or 'quote_ccy' — which currency the size is denominated in
  slippageBps?: number // slippage tolerance in basis points (DEX swaps)
  walletId?: string // which wallet to use (DEX trading)
  /**
   * Route an equities order into the pre-market / after-hours sessions
   * instead of queueing it for the next regular open.
   *
   * Opt-in per order, never inferred: those sessions are thinner and wider,
   * so a fill there is a decision the trader makes, not one the terminal
   * makes for them. Venues restrict which orders are eligible at all
   * (Alpaca: limit orders only, no stops) and must reject the rest rather
   * than silently dropping the flag.
   */
  extendedHours?: boolean
  /**
   * Perpetual futures: the order may only REDUCE an open position, never open
   * or flip one. The venue rejects it outright if it would increase exposure,
   * which is exactly the guarantee a "close position" control needs — a plain
   * opposite-side order raced against a partial fill can leave the trader short
   * where they meant to be flat.
   *
   * Opt-in per order like `extendedHours`: a venue that cannot express it must
   * reject the order rather than drop the flag and send a plain one.
   */
  reduceOnly?: boolean
  /**
   * Perpetual futures: leverage to apply to this symbol before the order is
   * placed. Not part of the order payload on any venue — it is account state,
   * set per symbol by a separate call, so the connector applies it first and
   * fails the order if it cannot. Absent leaves whatever the account already
   * has; the venue's own maximum is published as `MarketAdapterInfo.maxLeverage`.
   */
  leverage?: number
  // Client-generated idempotency key. The exchange rejects a second order
  // carrying an id it has already seen, so a retried/double-clicked submit
  // cannot execute twice. Generated once per logical order by the caller and
  // mapped to each exchange's own field (OKX clOrdId / Binance
  // newClientOrderId / ByBit orderLinkId).
  clientOrderId?: string
}

export type OrderResult = {
  success: boolean
  orderId?: string
  error?: string
}

export type InstrumentFilter = {
  assetClass?: string
  category?: string
  q?: string
}

// Instrument identity is owned by the shared contract (a discriminated
// union across asset classes). Re-exported here so connector code keeps a
// single import path; the loose local shape this replaced let DEX
// connectors emit rows with no identity — exactly the drift the union kills.
export type { Instrument } from '@pairlens/shared/instrument-types'

export type CandleCallback = (update: CandleUpdate) => void
export type TickerCallback = (update: TickerUpdate) => void
export type OrderbookCallback = (update: OrderbookUpdate) => void
export type TradesCallback = (update: TradesUpdate) => void

// ── Normalized trading types ─────────────────────────────────────────
// Exchange-agnostic types emitted by all connectors via trading:orders
// and trading:balances capabilities. Each connector encapsulates its own
// exchange-specific field mapping and emits these clean types.

/** Normalized order update — emitted by all connectors. */
export type NormalizedOrderUpdate = {
  orderId: string
  pair: string
  side: OrderSide
  type: OrderType
  size: string
  price: string
  fillSize: string
  avgPrice: string
  status: 'live' | 'partially_filled' | 'filled' | 'cancelled'
  fee: string
  feeCcy: string
  ts: number
  createdAt: number
  /**
   * Set for resting trigger (TP/SL) orders. Many venues keep these in a
   * separate algo-order id space — cancellation must be routed to the
   * venue's trigger-order endpoint, not the regular one.
   */
  triggerOrder?: boolean
  /** Trigger price of a trigger order (display; price may be empty for
   * market-execution triggers). */
  triggerPrice?: string
}

/**
 * An open perpetual-futures position, as `trading:positions` reports it.
 *
 * Numbers rather than strings, unlike `NormalizedOrderUpdate`: every field here
 * is arithmetic input (notional, PnL, a liquidation distance) rather than a
 * value the terminal echoes back to the venue at the venue's own precision, and
 * the round-trip risk a string contract exists to avoid does not apply to a
 * read-only snapshot.
 *
 * `pair` is the connector's own pair key, three segments on a perp
 * (`BTC-USDT-USDT`). That is load-bearing: the position ledger is keyed by pair
 * alone, so a two-segment perp key would let a perp fill overwrite the spot
 * `BTC-USDT` slot.
 *
 * `contracts` is a CONTRACT COUNT and is always positive — the direction lives
 * in `side`. Multiply by `contractSize` for the base-asset equivalent; the two
 * are not the same number on any venue whose contract is not one unit of base
 * (KuCoin's XBTUSDTM is 0.001 BTC).
 */
export type NormalizedPosition = {
  pair: string
  side: 'long' | 'short'
  contracts: number
  contractSize?: number
  entryPrice?: number
  markPrice?: number
  liquidationPrice?: number
  leverage?: number
  unrealizedPnl?: number
  notionalUsd?: number
  marginMode?: 'cross' | 'isolated'
  timestamp?: number
}

/** Normalized balance record — emitted by all connectors. */
export type NormalizedBalance = {
  currency: string
  available: string
  frozen: string
  total: string
}
