// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * OKX, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **Regional routing is not a `hostname` option.** ccxt's `urls.api.ws` is
 *   the hardcoded literal `wss://ws.okx.com:8443/ws/v5` with no `{hostname}`
 *   placeholder, so `hostname` moves REST only. ccxt ships `okxus`/`myokx`
 *   subclasses for the regional hosts, but taking them would mean three deep
 *   imports and three chunks for one venue — `getUrl()` re-reads
 *   `urls.api.ws` on every subscribe, so overriding both URLs on the base
 *   class after construction is equivalent and cheaper.
 * - **Public REST falls back to the global host under CORS — orders never do.**
 *   `eea.okx.com` and `us.okx.com` send no `Access-Control-Allow-Origin`, which
 *   in the hosted terminal left EU/US users on a chart stuck at one live
 *   candle. The three hosts are one matching engine behind separate legal
 *   entities and return byte-identical instruments and candles, so a
 *   CORS-constrained build reads public data from `www.okx.com`. Where ORDERS
 *   go stays regional — that is the boundary with legal meaning — so the
 *   fallback is gated on `ctx.authed`, which the exchange host sets per
 *   instance (the read path and each credential slot get their own).
 * - **`3d` is missing from ccxt's timeframe table** even though OKX serves
 *   `3D`. Without the override ccxt passes '3d' straight through and OKX
 *   rejects the request.
 * - **Deep history needs the other endpoint.** `/market/candles` serves only
 *   the most recent ~1440 bars and then returns an EMPTY page with `code: "0"`
 *   — a success the chart reads as "no more history", latching `exhausted`.
 *   ccxt only switches to `HistoryCandles` when `since` is given, and pan-left
 *   passes `until`, so the paged read asks for it explicitly.
 * - App-level ping every 18 s with a real `handlePong`, so pong frames reach
 *   the wrapped `handleMessage` and the silence watchdog has a guaranteed
 *   inbound heartbeat: 3 × 18 s, floored at the session's 45 s.
 */

import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { okxPaperWs, resolveOkxCcxtUrls } from './okx-regions'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
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
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
    { key: 'passphrase', label: 'Passphrase', type: 'secret', required: true },
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

export const okxCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'okx',
  marketId: 'okx',
  displayName: 'OKX',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    { key: 'passphrase', required: true },
  ],
  defaultMode: 'paper',
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/okx.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  timeframeOverrides: { '3d': '3D' },
  // `books` (400 levels, checksum-validated) is what the native subscribes to.
  // Deliberately NOT 50: `books50-l2-tbt` needs VIP4 and an authenticated
  // socket, and throws AuthenticationError on a public one.
  orderbookDepth: undefined,
  maxHistoryLimit: 300,
  historyPageParams: (endTs) => ({
    // OKX's `after` is already strictly-older, so the cursor is passed raw;
    // `olderThan` still filters the page.
    until: endTs,
    type: 'HistoryCandles',
  }),
  livenessTimeoutMs: 60_000,
  // Every Pairlens OKX order is plain spot. ccxt defaults algo (trigger)
  // orders to `tdMode: "cross"` — margin — which a Simple-mode account
  // rejects with 51010 (found by the demo E2E). The native always sent
  // `cash`; forcing it here covers plain and algo orders alike.
  orderParams: { tdMode: 'cash' },
  // ccxt's algo listing defaults to `ordType: "trigger"`, but every Pairlens
  // TP/SL lands as `conditional` — without this the resting order places and
  // cancels fine yet never shows in the open list (found by the demo E2E).
  triggerQueryParams: { trigger: true, ordType: 'conditional' },
  applyUrls: (exchange, country, ctx) => {
    const urls = resolveOkxCcxtUrls(country, { authed: ctx.authed })
    const api = exchange.urls['api'] as Record<string, unknown>
    api['rest'] = urls.rest
    api['ws'] = urls.ws
    exchange.hostname = urls.hostname
  },
  // Runs after `setSandboxMode`, which replaces the whole `urls.api` subtree
  // with `urls.test` — and OKX's is `{ rest: 'https://{hostname}', ws:
  // 'wss://wspap.okx.com:8443/ws/v5' }`. So BOTH halves of `applyUrls` are
  // gone by this point:
  //
  //  - the socket is the GLOBAL demo host, but demo keys are regional — an
  //    EEA key does not exist on `wspap` (60032, found by the demo E2E);
  //  - the REST base is back to the raw `{hostname}` template, which drops the
  //    dev-proxy prefix in browser dev and sends the request straight at the
  //    regional origin, where the webview's CORS check kills it.
  //
  // Both are restored from the same resolver the live path uses, so a paper
  // instance routes exactly where its live twin would.
  applyPaperUrls: (exchange, country, ctx) => {
    const urls = resolveOkxCcxtUrls(country, { authed: ctx.authed })
    const api = exchange.urls['api'] as Record<string, unknown>
    api['rest'] = urls.rest
    api['ws'] = okxPaperWs(country)
    exchange.hostname = urls.hostname
  },
  synthesizeMarket: (pair) => {
    const [base, quote] = pair.split('-')
    if (!base || !quote) return null
    return {
      id: `${base}-${quote}`,
      lowercaseId: `${base}-${quote}`.toLowerCase(),
      symbol: `${base}/${quote}`,
      base,
      quote,
      baseId: base,
      quoteId: quote,
      type: 'spot',
      spot: true,
      active: true,
      info: {},
    }
  },
}

export function createOkxMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(okxCcxtVenue, manifest)
}
