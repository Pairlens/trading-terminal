// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { BitgetWsClient } from './ws-client'
import { BitgetPrivateWsClient } from './private-ws'
import { fetchBitgetCandles, fetchBitgetTickerSnapshot } from './rest-client'
import {
  cancelBitgetOrder,
  fetchBitgetBalances,
  fetchBitgetOpenOrders,
  fetchBitgetOrderHistory,
  placeBitgetOrder,
} from './order-executor'
import { normalizePair } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png'

export const BITGET_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bitget',
  displayName: 'Bitget',
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
    '4h',
    '6h',
    '1d',
    '3d',
    '1w',
    '1M',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const bitgetMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bitget-market-connector',
    name: 'Bitget Market Connector',
    displayName: 'Bitget',
    marketId: 'bitget',
    icon: ICON_URL,
    gradient: 'from-cyan-400 to-teal-500',
    abbr: 'BG',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639322537228-f710d846310a?w=600&q=80',
  })

type BitgetCredentials = {
  apiKey: string
  apiSecret: string
  passphrase: string
}

const bitgetSpec: CexConnectorSpec<BitgetCredentials> = {
  id: 'bitget-market-connector',
  marketId: 'bitget',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    { key: 'passphrase', required: false },
  ],
  defaultMode: 'paper',
  createWsClient: () => new BitgetWsClient(),
  createPrivateWsClient: () => new BitgetPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, country) =>
    fetchBitgetCandles(pair, timeframe, limit, country),
  fetchTickerSnapshot: (country) => fetchBitgetTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchBitgetOpenOrders(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  fetchOrderHistory: (slot) =>
    fetchBitgetOrderHistory(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  cancelOrder: (orderId, pair, slot, opts) =>
    cancelBitgetOrder(
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
    return placeBitgetOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchBitgetBalances(slot.credentials, slot.country, slot.mode === 'paper'),
}

export function createBitgetMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(bitgetSpec, manifest)
}
