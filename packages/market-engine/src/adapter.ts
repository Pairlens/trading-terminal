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
