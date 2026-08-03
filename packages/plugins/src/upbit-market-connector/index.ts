// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { UpbitWsClient } from './ws-client'
import { UpbitPrivateWsClient } from './private-ws'
import { fetchUpbitCandles, fetchUpbitTickerSnapshot } from './rest-client'
import {
  cancelUpbitOrder,
  fetchUpbitBalances,
  fetchUpbitOpenOrders,
  fetchUpbitOrderHistory,
  placeUpbitOrder,
} from './order-executor'
import { toUpbitCode } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/351.png'

export const UPBIT_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'upbit',
  displayName: 'Upbit',
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
}

export const upbitMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'upbit-market-connector',
    name: 'Upbit Market Connector',
    displayName: 'Upbit Global',
    marketId: 'upbit',
    icon: ICON_URL,
    gradient: 'from-blue-500 to-blue-700',
    abbr: 'UPB',
    tickerSnapshot: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
    trades: true,
  })

type UpbitCredentials = { apiKey: string; apiSecret: string }

const upbitSpec: CexConnectorSpec<UpbitCredentials> = {
  id: 'upbit-market-connector',
  marketId: 'upbit',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  createWsClient: () => new UpbitWsClient(),
  createPrivateWsClient: () => new UpbitPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, country) =>
    fetchUpbitCandles(pair, timeframe, limit, country),
  fetchTickerSnapshot: (country) => fetchUpbitTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchUpbitOpenOrders(slot.credentials, slot.country),
  fetchOrderHistory: (slot) =>
    fetchUpbitOrderHistory(slot.credentials, slot.country),
  cancelOrder: (orderId, _pair, slot) =>
    cancelUpbitOrder(orderId, slot.credentials, slot.country),
  placeOrder: (order, slot) => {
    slot.currentPair = toUpbitCode(order.pair)
    return placeUpbitOrder(order, slot.credentials, slot.country)
  },
  fetchBalances: (slot) => fetchUpbitBalances(slot.credentials, slot.country),
}

export function createUpbitMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(upbitSpec, manifest)
}
