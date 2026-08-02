// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { HtxWsClient } from './ws-client'
import { HtxPrivateWsClient } from './private-ws'
import { fetchHtxCandles, fetchHtxTickerSnapshot } from './rest-client'
import {
  cancelHtxOrder,
  fetchHtxBalances,
  fetchHtxOpenOrders,
  fetchHtxOrderHistory,
  placeHtxOrder,
} from './order-executor'
import { toHtxSymbol } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/102.png'

export const HTX_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'htx',
  displayName: 'HTX',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    {
      key: 'apiSecret',
      label: 'API Secret',
      type: 'secret',
      required: true,
    },
  ],
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const htxMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'htx-market-connector',
    name: 'HTX Market Connector',
    displayName: 'HTX (formerly Huobi)',
    marketId: 'htx',
    icon: ICON_URL,
    gradient: 'from-blue-600 to-blue-800',
    abbr: 'HTX',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1642790551116-18e150f248e5?w=600&q=80',
  })

type HtxCredentials = { apiKey: string; apiSecret: string }

const htxSpec: CexConnectorSpec<HtxCredentials> = {
  id: 'htx-market-connector',
  marketId: 'htx',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  createWsClient: () => new HtxWsClient(),
  createPrivateWsClient: () => new HtxPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit) =>
    fetchHtxCandles(pair, timeframe, limit),
  fetchTickerSnapshot: () => fetchHtxTickerSnapshot(),
  fetchOpenOrders: (slot) =>
    fetchHtxOpenOrders(slot.credentials, slot.currentPair || undefined),
  fetchOrderHistory: (slot) =>
    fetchHtxOrderHistory(slot.credentials, slot.currentPair || undefined),
  cancelOrder: (orderId, _pair, slot, opts) =>
    cancelHtxOrder(orderId, slot.credentials, opts),
  placeOrder: (order, slot) => {
    slot.currentPair = toHtxSymbol(order.pair)
    return placeHtxOrder(order, slot.credentials)
  },
  fetchBalances: (slot) => fetchHtxBalances(slot.credentials),
}

export function createHtxMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(htxSpec, manifest)
}
