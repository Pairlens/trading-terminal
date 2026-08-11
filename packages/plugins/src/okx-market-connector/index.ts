// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { OkxWsClient } from './ws-client'
import { OkxPrivateWsClient } from './private-ws'
import { fetchOkxCandles, fetchOkxTickerSnapshot } from './rest-client'
import {
  cancelOkxOrder,
  fetchOkxBalances,
  fetchOkxOpenOrders,
  fetchOkxOrderHistory,
  placeOkxOrder,
} from './order-executor'
import { normalizePair } from './parser'
import type { CexConnectorSpec } from '../cex-connector'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://static.okx.com/cdn/oksupport/asset/currency/icon/okb.png'

export const OKX_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'okx',
  displayName: 'OKX',
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
    '3d',
    '1w',
    '1M',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const okxMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'okx-market-connector',
    name: 'OKX Market Connector',
    displayName: 'OKX',
    marketId: 'okx',
    icon: ICON_URL,
    gradient: 'from-zinc-800 to-zinc-900 dark:from-zinc-200 dark:to-zinc-300',
    abbr: 'OKX',
    triggerOrders: true,
    tickerSnapshot: true,
    trades: true,
    headerImage:
      'https://s.yimg.com/ny/api/res/1.2/YcL1Jo0JCQlMJdZnj6SkYg--/YXBwaWQ9aGlnaGxhbmRlcjt3PTk2MDtoPTY0MTtjZj13ZWJw/https://media.zenfs.com/en/reuters-finance.com/852f3f6259d5f775f388a1786a9f4a17',
  })

type OkxCredentials = {
  apiKey: string
  apiSecret: string
  passphrase: string
  /** Account's home entity override ('global' | 'eea' | 'us'); '' = by country. */
  entity?: string
}

const okxSpec: CexConnectorSpec<OkxCredentials> = {
  id: 'okx-market-connector',
  marketId: 'okx',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    { key: 'passphrase', required: true },
    // Account's home regional entity ('global' | 'eea' | 'us', '' = route by
    // country). An OKX key exists on exactly one entity; see OkxEntity.
    { key: 'entity', required: false },
  ],
  defaultMode: 'paper',
  createWsClient: () => new OkxWsClient(),
  createPrivateWsClient: () => new OkxPrivateWsClient(),
  fetchCandles: (pair, timeframe, limit, country, endTs) =>
    fetchOkxCandles(pair, timeframe, limit, country, endTs),
  fetchTickerSnapshot: (country) => fetchOkxTickerSnapshot(country),
  fetchOpenOrders: (slot) =>
    fetchOkxOpenOrders(slot.credentials, slot.country, slot.mode === 'paper'),
  fetchOrderHistory: (slot) =>
    fetchOkxOrderHistory(slot.credentials, slot.country, slot.mode === 'paper'),
  cancelOrder: (orderId, pair, slot, opts) =>
    cancelOkxOrder(
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
    return placeOkxOrder(normalized, slot.credentials, slot.country)
  },
  fetchBalances: (slot) =>
    fetchOkxBalances(slot.credentials, slot.country, slot.mode === 'paper'),
}

export function createOkxMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(okxSpec, manifest)
}
