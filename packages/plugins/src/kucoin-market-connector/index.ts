// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { KucoinWsClient } from './ws-client'
import { KucoinPrivateWsClient } from './private-ws'
import { fetchKucoinCandles, fetchKucoinTickerSnapshot } from './rest-client'
import {
  cancelKucoinOrder,
  fetchKucoinBalances,
  fetchKucoinOpenOrders,
  fetchKucoinOrderHistory,
  placeKucoinOrder,
} from './order-executor'
import { normalizePair } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png'

export const KUCOIN_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'kucoin',
  displayName: 'KuCoin',
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
    {
      key: 'passphrase',
      label: 'Passphrase',
      type: 'secret',
      required: true,
    },
  ],
  supportedTimeframes: [
    '1m',
    '5m',
    '15m',
    '30m',
    '1h',
    '2h',
    '4h',
    '1d',
    '1w',
    '1M',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const kucoinMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'kucoin-market-connector',
    name: 'KuCoin Market Connector',
    displayName: 'KuCoin',
    marketId: 'kucoin',
    icon: ICON_URL,
    gradient: 'from-emerald-500 to-teal-600',
    abbr: 'KC',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://assets.staticimg.com/cms/media/7feiEEHmJE61RECXMyp8rTcA5Qcsl0zSv6rz9NVjg.png',
  })

type KucoinCredentials = {
  apiKey: string
  apiSecret: string
  passphrase: string
}

const kucoinSpec: CexConnectorSpec<KucoinCredentials> = {
  id: 'kucoin-market-connector',
  marketId: 'kucoin',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    { key: 'passphrase', required: true },
  ],
  defaultMode: 'paper',
  createWsClient: () => new KucoinWsClient(),
  createPrivateWsClient: () => new KucoinPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, country) =>
    fetchKucoinCandles(pair, timeframe, limit, country),
  fetchTickerSnapshot: (country) => fetchKucoinTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchKucoinOpenOrders(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  fetchOrderHistory: (slot) =>
    fetchKucoinOrderHistory(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  cancelOrder: (orderId, pair, slot, opts) =>
    cancelKucoinOrder(
      orderId,
      pair,
      slot.credentials,
      slot.country,
      slot.mode,
      opts,
    ),
  placeOrder: (order, slot) => {
    const normalized = { ...order, pair: normalizePair(order.pair) }
    slot.currentPair = normalized.pair
    return placeKucoinOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchKucoinBalances(slot.credentials, slot.country, slot.mode === 'paper'),
}

export function createKucoinMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(kucoinSpec, manifest)
}
