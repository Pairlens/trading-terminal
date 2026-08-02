// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { KrakenWsClient } from './ws-client'
import { KrakenPrivateWsClient } from './private-ws'
import { fetchKrakenCandles, fetchKrakenTickerSnapshot } from './rest-client'
import {
  cancelKrakenOrder,
  fetchKrakenBalances,
  fetchKrakenOpenOrders,
  fetchKrakenOrderHistory,
  placeKrakenOrder,
} from './order-executor'
import { toRestPair } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/24.png'

export const KRAKEN_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'kraken',
  displayName: 'Kraken',
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
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const krakenMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'kraken-market-connector',
    name: 'Kraken Market Connector',
    displayName: 'Kraken',
    marketId: 'kraken',
    icon: ICON_URL,
    gradient: 'from-purple-500 to-violet-600',
    abbr: 'KR',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
  })

type KrakenCredentials = { apiKey: string; apiSecret: string }

const krakenSpec: CexConnectorSpec<KrakenCredentials> = {
  id: 'kraken-market-connector',
  marketId: 'kraken',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  createWsClient: () => new KrakenWsClient(),
  createPrivateWsClient: () => new KrakenPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit) =>
    fetchKrakenCandles(pair, timeframe, limit),
  fetchTickerSnapshot: () => fetchKrakenTickerSnapshot(),
  fetchOpenOrders: (slot) => fetchKrakenOpenOrders(slot.credentials),
  fetchOrderHistory: (slot) => fetchKrakenOrderHistory(slot.credentials),
  cancelOrder: (orderId, _pair, slot) =>
    cancelKrakenOrder(orderId, slot.credentials),
  placeOrder: (order, slot) => {
    slot.currentPair = toRestPair(order.pair)
    return placeKrakenOrder(order, slot.credentials)
  },
  fetchBalances: (slot) => fetchKrakenBalances(slot.credentials),
}

export function createKrakenMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(krakenSpec, manifest)
}
