// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { BybitWsClient } from './ws-client'
import { BybitPrivateWsClient } from './private-ws'
import { fetchBybitCandles, fetchBybitTickerSnapshot } from './rest-client'
import {
  cancelBybitOrder,
  fetchBybitBalances,
  fetchBybitOpenOrders,
  fetchBybitOrderHistory,
  placeBybitOrder,
} from './order-executor'
import { normalizePair } from './parser'
import { resolveBybitUrls } from './regions'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL = 'https://www.bybit.com/favicon.ico'

export const BYBIT_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bybit',
  displayName: 'ByBit',
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

export const bybitMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bybit-market-connector',
    name: 'ByBit Market Connector',
    displayName: 'ByBit',
    marketId: 'bybit',
    icon: ICON_URL,
    gradient: 'from-orange-500 to-orange-600',
    abbr: 'BB',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://cdn.prod.website-files.com/67ed326db9d26b1dc1df7929/680180233aeb270c28777c41_67b3e61a44517e3aa323445d_bybit%2520supported%2520and%2520restricted%2520countries.webp',
    trades: true,
  })

type BybitCredentials = { apiKey: string; apiSecret: string }

const bybitSpec: CexConnectorSpec<BybitCredentials> = {
  id: 'bybit-market-connector',
  marketId: 'bybit',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  createWsClient: () => new BybitWsClient(),
  createPrivateWsClient: () => new BybitPrivateWsClient(),
  // ByBit blocks US users for all capabilities; resolveBybitUrls only yields
  // null for unserved regions, so both checks surface the same typed error.
  geoCheck: (country, capability) => {
    if (country.toUpperCase() === 'US') {
      throw new GeoRestrictedError('ByBit', country)
    }
    if (capability.startsWith('market-data:') && !resolveBybitUrls(country)) {
      throw new GeoRestrictedError('ByBit', country)
    }
  },
  fetchCandles: (pair, timeframe, limit, country, endTs) =>
    fetchBybitCandles(pair, timeframe, limit, country, endTs),
  defaultHistoryLimit: 200,
  fetchTickerSnapshot: (country) => fetchBybitTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchBybitOpenOrders(slot.credentials, slot.country, slot.mode === 'paper'),
  fetchOrderHistory: (slot) =>
    fetchBybitOrderHistory(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
    ),
  cancelOrder: (orderId, pair, slot, opts) =>
    cancelBybitOrder(
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
    return placeBybitOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchBybitBalances(slot.credentials, slot.country, slot.mode === 'paper'),
}

export function createBybitMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(bybitSpec, manifest)
}
