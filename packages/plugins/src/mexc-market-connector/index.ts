// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { MexcWsClient } from './ws-client'
import { MexcPrivateWsClient } from './private-ws'
import { fetchMexcCandles, fetchMexcTickerSnapshot } from './rest-client'
import {
  cancelMexcOrder,
  fetchMexcBalances,
  fetchMexcOpenOrders,
  fetchMexcOrderHistory,
  placeMexcOrder,
} from './order-executor'
import { normalizePair } from './parser'
import { resolveMexcUrls } from './regions'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/544.png'

export const MEXC_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'mexc',
  displayName: 'MEXC',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  requiresDesktop: true,
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
  ],
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'],
  iconUrl: ICON_URL,
}

export const mexcMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'mexc-market-connector',
    name: 'MEXC Market Connector',
    displayName: 'MEXC',
    marketId: 'mexc',
    icon: ICON_URL,
    gradient: 'from-blue-600 to-blue-800',
    abbr: 'MX',
    requiresDesktop: true,
    tickerSnapshot: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
  })

type MexcCredentials = { apiKey: string; apiSecret: string }

function checkBlocked(country: string): void {
  if (!resolveMexcUrls(country)) {
    throw new GeoRestrictedError('MEXC', country)
  }
}

const mexcSpec: CexConnectorSpec<MexcCredentials> = {
  id: 'mexc-market-connector',
  marketId: 'mexc',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  requiresDesktop: true,
  createWsClient: () => new MexcWsClient(),
  createPrivateWsClient: () => new MexcPrivateWsClient(),
  // Market-data paths are gated by region; trading is gated separately via
  // tradeGeoCheck (after slot resolution) using the slot's country.
  geoCheck: (country, capability) => {
    if (capability.startsWith('market-data:')) checkBlocked(country)
  },
  tradeGeoCheck: (slot) => checkBlocked(slot.country),
  fetchCandles: (pair, timeframe, limit, country, endTs) =>
    fetchMexcCandles(pair, timeframe, limit, country, endTs),
  fetchTickerSnapshot: (country) => fetchMexcTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchMexcOpenOrders(slot.credentials, slot.country, slot.mode === 'paper'),
  fetchOrderHistory: (slot) =>
    fetchMexcOrderHistory(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  cancelOrder: (orderId, pair, slot) =>
    cancelMexcOrder(orderId, pair, slot.credentials, slot.country, slot.mode),
  placeOrder: (order, slot) => {
    const normalized = { ...order, pair: normalizePair(order.pair) }
    slot.currentPair = normalized.pair
    return placeMexcOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchMexcBalances(slot.credentials, slot.country, slot.mode === 'paper'),
}

export function createMexcMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(mexcSpec, manifest)
}
