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

export type Instrument = {
  id: string
  market: string
  symbol: string
  name: string
  base: string
  quote: string
  assetClass: string
}

export type CandleCallback = (update: CandleUpdate) => void
export type TickerCallback = (update: TickerUpdate) => void
export type OrderbookCallback = (update: OrderbookUpdate) => void

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

/** Normalized balance record — emitted by all connectors. */
export type NormalizedBalance = {
  currency: string
  available: string
  frozen: string
  total: string
}
