// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { GateWsClient } from './ws-client'
import { GatePrivateWsClient } from './private-ws'
import { fetchGateCandles, fetchGateTickerSnapshot } from './rest-client'
import {
  cancelGateOrder,
  fetchGateBalances,
  fetchGateOpenOrders,
  fetchGateOrderHistory,
  placeGateOrder,
} from './order-executor'
import { normalizePair } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/302.png'

export const GATE_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'gate',
  displayName: 'Gate.io',
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

export const gateMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'gate-market-connector',
    name: 'Gate.io Market Connector',
    displayName: 'Gate.io',
    marketId: 'gate',
    icon: ICON_URL,
    gradient: 'from-sky-500 to-blue-600',
    abbr: 'GT',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=600&q=80',
  })

type GateCredentials = { apiKey: string; apiSecret: string }

const gateSpec: CexConnectorSpec<GateCredentials> = {
  id: 'gate-market-connector',
  marketId: 'gate',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  createWsClient: () => new GateWsClient(),
  createPrivateWsClient: () => new GatePrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, country) =>
    fetchGateCandles(pair, timeframe, limit, country),
  fetchTickerSnapshot: (country) => fetchGateTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchGateOpenOrders(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  fetchOrderHistory: (slot) =>
    fetchGateOrderHistory(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  cancelOrder: (orderId, pair, slot, opts) =>
    cancelGateOrder(
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
    return placeGateOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchGateBalances(slot.credentials, slot.country, slot.mode === 'paper'),
}

export function createGateMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(gateSpec, manifest)
}
