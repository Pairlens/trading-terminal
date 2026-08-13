// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Binance, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple. What changes is only what is under the spec hooks.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **Port 443 on binance.com, 9443 on binance.us.** ccxt hardcodes
 *   `wss://stream.binance.com:9443/ws` for spot and margin. Binance serves the
 *   identical combined-stream endpoint on 443, and 9443 is a non-standard port
 *   that corporate firewalls, ISPs and VPNs routinely block outbound — which is
 *   exactly why Pairlens moved off it. `stream.binance.us` gives no such
 *   choice: 443 is not listening at all (immediate TCP refusal, not a geo
 *   block — measured 2026-08-11; `:9443` accepts the handshake and answers a
 *   SUBSCRIBE). The native carried the 443 rule across to `.us` unconditionally
 *   and so left US users with a socket that could never open, which is the one
 *   place this bridge does not reproduce it.
 *   `getWsUrl` reads `urls.api.ws[type]` unmodified for spot, so both are a
 *   post-construction assignment.
 * - **US routes to binance.us**, REST and WS, for the market-data instance and
 *   every credential slot alike — `applyUrls` runs on each instance the
 *   exchange host builds. Matches the native's region split. No dev proxy
 *   exists (and none is needed): both hosts send `Access-Control-Allow-Origin`,
 *   so the browser build goes direct.
 * - **Paper is region-free.** `setSandboxMode` replaces `urls.api` wholesale
 *   with the testnet table (`testnet.binance.vision`), which carries no
 *   `{hostname}` template and so cannot inherit the US split — matching the
 *   native's `resolveBinanceTradingUrls(country, paper)`, which ignores the
 *   country entirely when `paper`.
 * - **Synthetic markets must carry `info.orderTypes`.** Binance is the only
 *   venue of the fourteen whose `createOrder` reads `market.info`
 *   (`binance.js:5600`) and it throws `InvalidOrder` when the field is absent.
 *   The stand-in market below carries the spot default set so a cold profile is
 *   not one order away from an unexplained rejection once trading lands.
 * - **No app-level ping** (`streaming.keepAlive: 180 000`, no `handlePong`), so
 *   ccxt offers no liveness signal at all in a browser and the only inbound
 *   traffic is market data. The silence budget is therefore generous — a
 *   subscribed ticker/book/candle on any listed pair ticks far inside it, and a
 *   false positive costs one reconnect.
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

const ICON_URL = 'https://bin.bnbstatic.com/static/images/common/favicon.ico'

export const BINANCE_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'binance',
  displayName: 'Binance',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
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

/** Spot order types Binance advertises for a standard USDT pair. */
const SPOT_ORDER_TYPES = [
  'LIMIT',
  'LIMIT_MAKER',
  'MARKET',
  'STOP_LOSS',
  'STOP_LOSS_LIMIT',
  'TAKE_PROFIT',
  'TAKE_PROFIT_LIMIT',
]

export const binanceCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'binance',
  marketId: 'binance',
  displayName: 'Binance',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  loadExchangeClass: async () => {
    // Deep subpath, dynamically: the barrel would pull ~130 exchange classes
    // into the graph and a static import would put this one in the entry chunk.
    const module = await import('ccxt/js/src/pro/binance.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  // ccxt caps the book it maintains at exactly this depth (`pro/binance.js`
  // seeds `this.orderBook({}, limit)` from a REST snapshot of the same size),
  // and Binance quotes BTC/USDT to the cent. At the 20 this shipped with, the
  // whole book was a ~$2 band whose best level carried ~80% of the visible
  // size, so the pane's cumulative bars pinned near full width and the ladder
  // read as flat rather than the usual pyramid — measured live 2026-08-13,
  // together with the depth pane and the liquidity heatmap, which bin the same
  // levels and were seeing $4 of price. 500 reproduces OKX's 400-level `books`
  // (the reference the pane's Auto grouping was tuned against) across the
  // liquidity range: BTC 0.19% of price vs OKX's 0.36%, ETH/SOL/DOGE within
  // 0.01% of it. 1000 overshoots — SOL and DOGE past a 15% band. The cost is
  // one REST snapshot per subscribe (`/api/v3/depth` weight 25 at this limit,
  // against a 6000/min budget); the WS side is the same `@depth@100ms` diff
  // stream at any depth.
  orderbookDepth: 500,
  // Spot cap is 1000/call; ccxt clamps anyway, but the bridge should not ask
  // for a page the venue will silently truncate.
  maxHistoryLimit: 1000,
  // `endTime` is INCLUSIVE — the boundary bar comes back unless nudged, and a
  // page that filters to nothing latches `exhausted` for the session.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 120_000,
  applyUrls: (exchange, country) => {
    const us = country.toUpperCase() === 'US'
    const restHost = us ? 'https://api.binance.us' : 'https://api.binance.com'
    // 443 on `.com`, 9443 on `.us` — see the header. Not symmetric because the
    // hosts are not: `stream.binance.us` has nothing listening on 443.
    const wsHost = us
      ? 'wss://stream.binance.us:9443/ws'
      : 'wss://stream.binance.com/ws'
    const api = exchange.urls['api'] as Record<string, unknown>
    api['public'] = `${restHost}/api/v3`
    api['private'] = `${restHost}/api/v3`
    api['v1'] = `${restHost}/api/v1`
    api['sapi'] = `${restHost}/sapi/v1`
    const ws = api['ws'] as Record<string, unknown>
    ws['spot'] = wsHost
    ws['margin'] = wsHost
  },
  synthesizeMarket: (pair) => {
    const [base, quote] = pair.split('-')
    if (!base || !quote) return null
    const id = `${base}${quote}`
    return {
      id,
      lowercaseId: id.toLowerCase(),
      symbol: `${base}/${quote}`,
      base,
      quote,
      baseId: base,
      quoteId: quote,
      type: 'spot',
      spot: true,
      active: true,
      info: { orderTypes: SPOT_ORDER_TYPES },
    }
  },
}

export function createBinanceMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(binanceCcxtVenue, manifest)
}
