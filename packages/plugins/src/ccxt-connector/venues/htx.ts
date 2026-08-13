// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * HTX (formerly Huobi), backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **Every public WS frame is GZIP.** `options.ws.gunzip` is set by ccxt's
 *   own describe(), and `base/ws/Client.js:14-21` resolves the inflater once at
 *   module load: `node:zlib` under Node/Bun, the `fflate` package everywhere
 *   else. `fflate` is a real dependency of ccxt (and is pinned through the
 *   repo's ccxt patch), so the browser and the Tauri webview are covered — the
 *   failure mode if it were not is not a thrown error but a socket that
 *   connects and then never delivers a readable frame, which is why this is
 *   proven live rather than assumed.
 * - **`fetchMarkets.types` takes an OBJECT here, not the array every other
 *   venue accepts.** `htx.fetchMarkets` iterates `Object.keys(types)` and reads
 *   `safeBool(types, key)`, so the bridge's default `['spot']` degenerates to
 *   the key `'0'` holding a string, no branch matches, and `loadMarkets`
 *   returns ZERO markets. The override below is load-bearing, not tidiness.
 * - **`size` and `from`/`to` are mutually exclusive on the old kline
 *   endpoint.** ccxt 4.5.71 defaults spot `fetchOHLCV` to
 *   `useHistoricalEndpointForSpot: true`, i.e. `/market/history/candles`,
 *   which is the one endpoint that honours `from`/`to` alongside `size`
 *   (capped at 1000, versus 2000 on the endpoint that ignores the window). So
 *   paging passes `until` and stays on the historical endpoint; the cap below
 *   is 1000 to match it, and nothing must flip that option off.
 * - **`until` is inclusive** (it lands on `to`, in whole seconds), so the
 *   cursor is nudged with `pageEndMs` and the page is filtered by `olderThan`
 *   as well — one duplicated boundary bar latches the chart's `exhausted` flag
 *   for the session.
 * - **Orderbook depth is an enum**: 5, 20, 150 or 400, anything else throws
 *   `ExchangeError`. 150 is ccxt's default and the deepest tick-by-tick tier
 *   below 400; the snapshot arrives over the SAME socket as a `req` reply
 *   (`handleOrderBookSnapshot`), so unlike Binance or KuCoin this costs no
 *   extra CORS-exposed REST call.
 * - **No `watchTickers`.** Irrelevant to the bridge, which subscribes per
 *   symbol; the bulk snapshot is REST `fetchTickers` behind
 *   `market-data:ticker-snapshot`, which is an `execute`, not a stream.
 * - **No client ping, but a responder for three server-ping shapes**, so
 *   inbound traffic is guaranteed and the silence watchdog has something to
 *   measure.
 * - Country-agnostic, and `api.huobi.pro` sends `Access-Control-Allow-Origin`
 *   on the market endpoints — the browser build goes direct, no dev proxy
 *   needed. `fetchStatus()` must stay uncalled: it is the one HTX route on
 *   `status.huobigroup.com`, which is in neither the CSP baseline nor the
 *   Tauri HTTP scope.
 */

import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/102.png'

export const HTX_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'htx',
  displayName: 'HTX',
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

export const htxMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'htx-market-connector',
    name: 'HTX Market Connector',
    displayName: 'HTX (formerly Huobi)',
    marketId: 'htx',
    icon: ICON_URL,
    gradient: 'from-blue-600 to-blue-800',
    abbr: 'HTX',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1642790551116-18e150f248e5?w=600&q=80',
    trades: true,
  })

export const htxCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'htx',
  marketId: 'htx',
  displayName: 'HTX',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  // No sandbox; CREDENTIAL_SCHEMAS lists HTX as live-only.
  defaultMode: 'live',
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/htx.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    options: {
      // Object form, not the array the other venues take — see the header.
      fetchMarkets: { types: { spot: true, linear: false, inverse: false } },
    },
  },
  // 5 | 20 | 150 | 400 — anything else throws ExchangeError.
  orderbookDepth: 150,
  // The historical spot endpoint (the one that honours from/to) caps at 1000.
  maxHistoryLimit: 1000,
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 60_000,
  synthesizeMarket: (pair) => {
    const [base, quote] = pair.split('-')
    if (!base || !quote) return null
    // HTX ids are the lowercase concatenation, and `lowercaseId` is one of the
    // two fields ccxt reads off a market for HTX's own request building.
    const id = `${base}${quote}`.toLowerCase()
    return {
      id,
      lowercaseId: id,
      symbol: `${base}/${quote}`,
      base,
      quote,
      baseId: base.toLowerCase(),
      quoteId: quote.toLowerCase(),
      type: 'spot',
      spot: true,
      active: true,
      info: {},
    }
  },
}

export function createHtxMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(htxCcxtVenue, manifest)
}
