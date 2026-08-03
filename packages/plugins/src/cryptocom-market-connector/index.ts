// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { CryptocomWsClient } from './ws-client'
import { CryptocomPrivateWsClient } from './private-ws'
import {
  fetchCryptocomCandles,
  fetchCryptocomTickerSnapshot,
} from './rest-client'
import {
  cancelCryptocomOrder,
  fetchCryptocomBalances,
  fetchCryptocomOpenOrders,
  fetchCryptocomOrderHistory,
  placeCryptocomOrder,
} from './order-executor'
import { toCryptocomSymbol } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/1149.png'

export const CRYPTOCOM_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'cryptocom',
  displayName: 'Crypto.com',
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
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1M'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const cryptocomMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'cryptocom-market-connector',
    name: 'Crypto.com Market Connector',
    displayName: 'Crypto.com',
    marketId: 'cryptocom',
    icon: ICON_URL,
    gradient: 'from-blue-700 to-indigo-900',
    abbr: 'CDC',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
    trades: true,
  })

type CryptocomCredentials = { apiKey: string; apiSecret: string }

const cryptocomSpec: CexConnectorSpec<CryptocomCredentials> = {
  id: 'cryptocom-market-connector',
  marketId: 'cryptocom',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  createWsClient: () => new CryptocomWsClient(),
  createPrivateWsClient: () => new CryptocomPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit) =>
    fetchCryptocomCandles(pair, timeframe, limit),
  fetchTickerSnapshot: () => fetchCryptocomTickerSnapshot(),
  fetchOpenOrders: (slot) =>
    fetchCryptocomOpenOrders(
      slot.credentials,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  fetchOrderHistory: (slot) =>
    fetchCryptocomOrderHistory(
      slot.credentials,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  cancelOrder: (orderId, pair, slot, opts) =>
    cancelCryptocomOrder(
      orderId,
      pair,
      slot.credentials,
      slot.mode === 'paper',
      opts,
    ),
  placeOrder: (order, slot) => {
    slot.currentPair = toCryptocomSymbol(order.pair)
    return placeCryptocomOrder(order, slot.credentials, slot.mode === 'paper')
  },
  fetchBalances: (slot) =>
    fetchCryptocomBalances(slot.credentials, slot.mode === 'paper'),
}

export function createCryptocomMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(cryptocomSpec, manifest)
}
