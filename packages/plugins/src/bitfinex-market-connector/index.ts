// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { BfxWsClient } from './ws-client'
import { BfxPrivateWsClient } from './private-ws'
import { fetchBfxCandles, fetchBfxTickerSnapshot } from './rest-client'
import {
  cancelBfxOrder,
  fetchBfxBalances,
  fetchBfxOpenOrders,
  fetchBfxOrderHistory,
  placeBfxOrder,
} from './order-executor'
import { toBfxSymbol } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/37.png'

export const BITFINEX_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bitfinex',
  displayName: 'Bitfinex',
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

export const bitfinexMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bitfinex-market-connector',
    name: 'Bitfinex Market Connector',
    displayName: 'Bitfinex',
    marketId: 'bitfinex',
    icon: ICON_URL,
    gradient: 'from-green-600 to-emerald-800',
    abbr: 'BFX',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
    trades: true,
  })

type BitfinexCredentials = { apiKey: string; apiSecret: string }

const bitfinexSpec: CexConnectorSpec<BitfinexCredentials> = {
  id: 'bitfinex-market-connector',
  marketId: 'bitfinex',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  createWsClient: () => new BfxWsClient(),
  createPrivateWsClient: () => new BfxPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, _country, endTs) =>
    fetchBfxCandles(pair, timeframe, limit, endTs),
  fetchTickerSnapshot: () => fetchBfxTickerSnapshot(),
  fetchOpenOrders: (slot) => fetchBfxOpenOrders(slot.credentials),
  fetchOrderHistory: (slot) => fetchBfxOrderHistory(slot.credentials),
  cancelOrder: (orderId, _pair, slot) =>
    cancelBfxOrder(orderId, slot.credentials),
  placeOrder: (order, slot) => {
    slot.currentPair = toBfxSymbol(order.pair)
    return placeBfxOrder(order, slot.credentials)
  },
  fetchBalances: (slot) => fetchBfxBalances(slot.credentials),
}

export function createBitfinexMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(bitfinexSpec, manifest)
}
