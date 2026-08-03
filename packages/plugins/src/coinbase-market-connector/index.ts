// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { CoinbaseWsClient } from './ws-client'
import { CoinbasePrivateWsClient } from './private-ws'
import {
  fetchCoinbaseCandles,
  fetchCoinbaseTickerSnapshot,
} from './rest-client'
import {
  cancelCoinbaseOrder,
  fetchCoinbaseBalances,
  fetchCoinbaseOpenOrders,
  fetchCoinbaseOrderHistory,
  placeCoinbaseOrder,
} from './order-executor'
import { normalizePair } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/89.png'

export const COINBASE_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'coinbase',
  displayName: 'Coinbase',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    {
      key: 'apiSecret',
      label: 'API Secret (PEM)',
      type: 'secret',
      required: true,
    },
  ],
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '2h', '6h', '1d'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const coinbaseMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'coinbase-market-connector',
    name: 'Coinbase Market Connector',
    displayName: 'Coinbase',
    description:
      'Direct market data and trading via Coinbase Advanced Trade APIs',
    marketId: 'coinbase',
    icon: ICON_URL,
    gradient: 'from-blue-500 to-indigo-600',
    abbr: 'CB',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=600&q=80',
    trades: true,
  })

type CoinbaseCredentials = { apiKey: string; apiSecret: string }

const coinbaseSpec: CexConnectorSpec<CoinbaseCredentials> = {
  id: 'coinbase-market-connector',
  marketId: 'coinbase',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  createWsClient: () => new CoinbaseWsClient(),
  createPrivateWsClient: () => new CoinbasePrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, country) =>
    fetchCoinbaseCandles(pair, timeframe, limit, country),
  fetchTickerSnapshot: (country) => fetchCoinbaseTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchCoinbaseOpenOrders(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  fetchOrderHistory: (slot) =>
    fetchCoinbaseOrderHistory(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  cancelOrder: (orderId, pair, slot) =>
    cancelCoinbaseOrder(
      orderId,
      pair,
      slot.credentials,
      slot.country,
      slot.mode,
    ),
  placeOrder: (order, slot) => {
    const normalized = { ...order, pair: normalizePair(order.pair) }
    slot.currentPair = normalized.pair
    return placeCoinbaseOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchCoinbaseBalances(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
    ),
}

export function createCoinbaseMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(coinbaseSpec, manifest)
}
