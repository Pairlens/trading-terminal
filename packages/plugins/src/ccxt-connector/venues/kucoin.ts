// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * KuCoin, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **Desktop-only, in both halves.** `api.kucoin.com` sends no
 *   `Access-Control-Allow-Origin`, and unlike OKX there is no CORS-enabled
 *   sibling host to read from — KuCoin cannot even open a socket in a hosted
 *   browser, because the WS URL is issued by a CORS-blocked REST POST. So the
 *   manifest says desktop-only and the spec refuses.
 * - **Depth 50, deliberately.** `watchOrderBook` accepts only
 *   `undefined | 5 | 20 | 50 | 100` and throws otherwise, and the value picks
 *   the CHANNEL: 5 and 50 route to `/spotMarket/level2Depth{5,50}`, which push
 *   the whole book every frame, while everything else routes to the incremental
 *   `/market/level2` and pulls a REST snapshot to seed it. 50 is what the native
 *   subscribes to, and it keeps the CORS-sensitive `fetchOrderBook` off the
 *   subscribe path entirely.
 * - **The bullet token, the margin symbols and pan-left paging** are all fixed
 *   in `kucoin-exchange.ts`; see that file for why each one is load-bearing.
 * - App-level ping on the server-supplied interval (18 s in practice) with a
 *   real `handlePong`, so the pong is guaranteed inbound traffic and the silence
 *   budget can be tight: 3 × 18 s, floored at the session's 45 s.
 * - **`3d` is not a KuCoin timeframe** — neither ccxt nor the venue has it, and
 *   the native's `supportedTimeframes` omits it too. Left unmapped on purpose.
 */

import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { withKucoinQuirks } from './kucoin-exchange'
import { requireKucoinCcxtUrls } from './kucoin-regions'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png'

export const KUCOIN_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'kucoin',
  displayName: 'KuCoin',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  requiresDesktop: true,
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
    '1w',
    '1M',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const kucoinMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'kucoin-market-connector',
    name: 'KuCoin Market Connector',
    displayName: 'KuCoin',
    marketId: 'kucoin',
    icon: ICON_URL,
    gradient: 'from-emerald-500 to-teal-600',
    abbr: 'KC',
    requiresDesktop: true,
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://assets.staticimg.com/cms/media/7feiEEHmJE61RECXMyp8rTcA5Qcsl0zSv6rz9NVjg.png',
    trades: true,
  })

export const kucoinCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'kucoin',
  marketId: 'kucoin',
  displayName: 'KuCoin',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    { key: 'passphrase', required: true },
  ],
  defaultMode: 'paper',
  // ccxt has no KuCoin sandbox (`urls.test` is declared-but-undefined, so
  // `setSandboxMode` cannot take), which used to make every paper order a
  // hard refusal. `test: true` is ccxt's documented dry run instead: the spot
  // order routes to `/api/v1/orders/test`, which validates size, precision
  // and balance against the REAL account and never reaches the matching
  // engine.
  paperOrderParams: { test: true },
  requiresDesktop: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/kucoin.js')
    const Base = (module.default ?? module) as unknown as CcxtExchangeCtor
    return withKucoinQuirks(Base)
  },
  options: {
    options: {
      // `fetchTickersFees` is the only one of the two that `options` can reach;
      // `marginables` is params-only and lives in the subclass. Dropping it
      // skips `publicGetMarketAllTickers` on every cold market load — a second
      // full-venue payload we would only throw away.
      fetchMarkets: { types: ['spot'], fetchTickersFees: false },
    },
  },
  // 5 | 20 | 50 | 100 or ccxt throws; 50 is the native's channel and needs no
  // REST snapshot to seed.
  orderbookDepth: 50,
  maxHistoryLimit: 1500,
  // Nudged to strictly-older here and translated into ccxt's `since` argument
  // by the subclass — KuCoin's own request has no `until`.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 60_000,
  applyUrls: (exchange, country) => {
    // Paper is a different host (openapi-sandbox), but the read path never runs
    // in paper — `initialize` carries the mode and the trading phase resolves
    // `tradingRest` per slot.
    const urls = requireKucoinCcxtUrls(country)
    const api = exchange.urls['api'] as Record<string, unknown>
    api['public'] = urls.rest
    api['uta'] = urls.rest
    api['private'] = urls.tradingRest
    api['utaPrivate'] = urls.tradingRest
    api['earn'] = urls.tradingRest
  },
  synthesizeMarket: (pair) => {
    const [base, quote] = pair.split('-')
    if (!base || !quote) return null
    const id = `${base}-${quote}`
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
      info: {},
    }
  },
}

export function createKucoinMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(kucoinCcxtVenue, manifest)
}
