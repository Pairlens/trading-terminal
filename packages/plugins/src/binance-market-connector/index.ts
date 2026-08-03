// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { BinanceWsClient } from './ws-client'
import { BinancePrivateWsClient } from './private-ws'
import { fetchBinanceCandles, fetchBinanceTickerSnapshot } from './rest-client'
import {
  cancelBinanceOrder,
  fetchBinanceBalances,
  fetchBinanceOpenOrders,
  fetchBinanceOrderHistory,
  placeBinanceOrder,
} from './order-executor'
import { normalizePair } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL = 'https://bin.bnbstatic.com/static/images/common/favicon.ico'

export const BINANCE_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'binance',
  displayName: 'Binance',
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
    '3d',
    '1w',
    '1M',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const binanceMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'binance-market-connector',
    name: 'Binance Market Connector',
    displayName: 'Binance',
    marketId: 'binance',
    icon: ICON_URL,
    gradient: 'from-amber-400 to-amber-500',
    abbr: 'BN',
    tickerSnapshot: true,
    triggerOrders: true,
    trades: true,
    headerImage:
      'https://public.bnbstatic.com/image/cms/blog/20240531/6422bedf-f72e-44e8-be9e-bf77d329bdbd.png',
  })

type BinanceCredentials = { apiKey: string; apiSecret: string }

const binanceSpec: CexConnectorSpec<BinanceCredentials> = {
  id: 'binance-market-connector',
  marketId: 'binance',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  createWsClient: () => new BinanceWsClient(),
  createPrivateWsClient: () => new BinancePrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, country, endTs) =>
    fetchBinanceCandles(pair, timeframe, limit, country, endTs),
  fetchTickerSnapshot: (country) => fetchBinanceTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchBinanceOpenOrders(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
    ),
  fetchOrderHistory: (slot) =>
    fetchBinanceOrderHistory(
      slot.credentials,
      slot.country,
      slot.mode === 'paper',
      slot.currentPair || undefined,
    ),
  cancelOrder: (orderId, pair, slot) =>
    cancelBinanceOrder(
      orderId,
      pair,
      slot.credentials,
      slot.country,
      slot.mode,
    ),
  placeOrder: (order, slot) => {
    const normalized = { ...order, pair: normalizePair(order.pair) }
    slot.currentPair = normalized.pair
    return placeBinanceOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchBinanceBalances(slot.credentials, slot.country, slot.mode === 'paper'),
}

export function createBinanceMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(binanceSpec, manifest)
}
