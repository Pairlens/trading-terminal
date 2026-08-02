// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createCexConnectorManifest,
  createCexConnectorPlugin,
} from '../cex-connector'
import { BitvavoWsClient } from './ws-client'
import { BitvavoPrivateWsClient } from './private-ws'
import { fetchBitvavoCandles } from './rest-client'
import {
  cancelBitvavoOrder,
  fetchBitvavoBalances,
  fetchBitvavoOpenOrders,
  fetchBitvavoOrderHistory,
  placeBitvavoOrder,
} from './order-executor'
import { toMarket } from './parser'
import { assertBitvavoRegionAllowed } from './regions'
import type { CexConnectorSpec } from '../cex-connector'
import type { BitvavoCredentials } from './order-executor'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

// bitvavo.com serves a 403 to non-browser clients, so the apex favicon renders
// blank in the venue picker / store card. The account subdomain serves the same
// mark (256px) without the block.
const ICON_URL = 'https://account.bitvavo.com/favicon.ico'

export const BITVAVO_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bitvavo',
  displayName: 'Bitvavo',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
  ],
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '1d'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const bitvavoMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bitvavo-market-connector',
    name: 'Bitvavo Market Connector',
    displayName: 'Bitvavo',
    marketId: 'bitvavo',
    icon: ICON_URL,
    gradient: 'from-blue-500 to-indigo-600',
    abbr: 'BV',
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?w=600&q=80',
  })

const bitvavoSpec: CexConnectorSpec<BitvavoCredentials> = {
  id: 'bitvavo-market-connector',
  marketId: 'bitvavo',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  // Bitvavo has no testnet/dry-run — live only. placeOrder simulates paper.
  defaultMode: 'live',
  createWsClient: () => new BitvavoWsClient(),
  createPrivateWsClient: () => new BitvavoPrivateWsClient(),
  // Bitvavo does not serve the US — gate every capability with a typed error.
  geoCheck: (country) => assertBitvavoRegionAllowed(country),
  fetchCandles: (pair, timeframe, limit, country, endTs) =>
    fetchBitvavoCandles(pair, timeframe, limit, country, endTs),
  fetchOpenOrders: (slot) =>
    fetchBitvavoOpenOrders(slot.credentials, slot.currentPair || undefined),
  fetchOrderHistory: (slot) =>
    fetchBitvavoOrderHistory(slot.credentials, slot.currentPair || undefined),
  cancelOrder: (orderId, pair, slot) =>
    cancelBitvavoOrder(orderId, pair, slot.credentials),
  placeOrder: (order, slot) => {
    slot.currentPair = toMarket(order.pair)
    // Point the account channel at this market so live fills stream in.
    ;(slot.privateWsClient as BitvavoPrivateWsClient | null)?.setMarket(
      order.pair,
    )
    return placeBitvavoOrder(order, slot.credentials)
  },
  fetchBalances: (slot) => fetchBitvavoBalances(slot.credentials),
}

export function createBitvavoMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCexConnectorPlugin(bitvavoSpec, manifest)
}
