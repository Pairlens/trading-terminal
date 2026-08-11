// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * MEXC, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **Desktop-only, in both halves.** `api.mexc.com` sends no
 *   `Access-Control-Allow-Origin` and there is no sibling host that does.
 * - **Region-blocked in seven jurisdictions.** `geoCheck` refuses every
 *   `market-data:*` capability, exactly as the native does, and the URL resolver
 *   refuses too — so the trading path is covered the moment it is wired, without
 *   depending on a `tradeGeoCheck` hook the bridge config does not have yet.
 * - **No `market-data:trades`.** The native does not declare it and neither does
 *   this: the aggressor-side semantics of MEXC's protobuf deals frames have
 *   never been measured against live top-of-book, and a tape with the side
 *   inverted is worse than no tape. ccxt *has* `watchTrades` here; declaring it
 *   is a separate decision with a measurement attached.
 * - **The protobuf decoder and the swap market fan-out** are handled in
 *   `mexc-exchange.ts`; that file is where the interesting failure modes are.
 * - **`watchOrderBook` ignores `limit`.** It is fixed to
 *   `spot@public.aggre.depth.v3.api.pb@100ms`, an incremental channel seeded
 *   from a REST `fetchOrderBook` after 25 buffered deltas. That is a deviation
 *   from the native, which subscribes to the snapshot-only
 *   `limit.depth…@20` channel and never calls REST — but the REST seed rides
 *   `fetchImplementation = restFetch`, and MEXC is desktop-only anyway, so it
 *   resolves through the Rust HTTP client. Passing a depth would be noise.
 * - App-level ping every 8 s with a real `handlePong`, so the pong is guaranteed
 *   inbound traffic. 3 × 8 s is under the session's 45 s floor, so 45 s it is.
 * - **`2h` and `3d` are not MEXC timeframes** — the venue has none, ccxt has
 *   none, and the native's `supportedTimeframes` omits both.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { withMexcQuirks } from './mexc-exchange'
import { isMexcBlocked, resolveMexcCcxtUrls } from './mexc-regions'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
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

export const mexcCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'mexc',
  marketId: 'mexc',
  displayName: 'MEXC',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  requiresDesktop: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/mexc.js')
    const Base = (module.default ?? module) as unknown as CcxtExchangeCtor
    return withMexcQuirks(Base)
  },
  // Market data is gated here; trading is gated by the URL resolver until the
  // bridge config grows a post-slot `tradeGeoCheck` hook.
  geoCheck: (country, capability) => {
    if (!capability.startsWith('market-data:')) return
    if (isMexcBlocked(country)) throw new GeoRestrictedError('MEXC', country)
  },
  maxHistoryLimit: 500,
  // ccxt reads `until` and sends `endTime = until + 1`; MEXC's `endTime` is
  // exclusive, so the nudged cursor lands exactly on "strictly older".
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 45_000,
  applyUrls: (exchange, country) => {
    const urls = resolveMexcCcxtUrls(country)
    if (!urls) throw new GeoRestrictedError('MEXC', country)
    const api = exchange.urls['api'] as Record<string, unknown>
    const spot = api['spot'] as Record<string, unknown>
    spot['public'] = urls.rest
    spot['private'] = urls.rest
    const ws = api['ws'] as Record<string, unknown>
    ws['spot'] = urls.ws
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
      info: {},
    }
  },
}

export function createMexcMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(mexcCcxtVenue, manifest)
}
