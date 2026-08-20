// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ByBit, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **`defaultType` must be `'spot'`.** ccxt ships ByBit with
 *   `options.defaultType = 'swap'`, and the two market universes share ids
 *   (`BTCUSDT` is both a spot pair and a linear perpetual). Any path that
 *   resolves a market without an unambiguous symbol — `fetchTickers`'
 *   `getBybitType`, `safeMarket` on an exchange-specific id — picks the
 *   perpetual under the default, and a chart quietly showing funding-bearing
 *   futures prices on a spot terminal is the worst kind of wrong: it looks
 *   right. The bridge's exchange host already forces spot for every venue;
 *   it is restated here so the requirement survives a change to that default.
 * - **Regional routing is one field.** Every ByBit URL is
 *   `{hostname}`-templated and imploded per call, so EU/EEA moves to
 *   `bybit.nl` — REST and socket — with a single assignment (see
 *   `bybit-regions.ts`).
 * - **The US is refused outright**, and any region the router cannot serve is
 *   refused for market data. Both branches raise the same typed
 *   `GeoRestrictedError` the native raises, so the terminal's region dialog
 *   keeps working unchanged.
 * - **Orderbook depth is an enum, not an integer.** Spot accepts exactly
 *   `1 | 50 | 200 | 1000` and ccxt throws `BadRequest` for anything else
 *   rather than snapping down the way OKX does. 50 is both ccxt's default and
 *   the native's `orderbook.50` channel.
 * - **History stays at 200 bars per call.** ccxt would allow 1000, but the
 *   native clamps every request to 200 (`rest-client.ts:39`) and the chart's
 *   paging was tuned against that page size. Widening it is a follow-up, not a
 *   parity change.
 * - App-level ping every 18 s with a real `handlePong`, so pong frames reach
 *   the wrapped `handleMessage` and the silence watchdog has a guaranteed
 *   inbound heartbeat even on a pair that never prints.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import {
  BYBIT_DEFAULT_BOOK_DEPTH,
  applyBybitCcxtUrls,
  clampBybitBookDepth,
  resolveBybitRegion,
} from './bybit-regions'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL = '/posters/bybit-market-connector.png'

export const BYBIT_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bybit',
  displayName: 'ByBit',
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
    '1w',
    '1M',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const bybitMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bybit-market-connector',
    name: 'ByBit Market Connector',
    displayName: 'ByBit',
    marketId: 'bybit',
    icon: ICON_URL,
    gradient: 'from-orange-500 to-orange-600',
    abbr: 'BB',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://cdn.prod.website-files.com/67ed326db9d26b1dc1df7929/680180233aeb270c28777c41_67b3e61a44517e3aa323445d_bybit%2520supported%2520and%2520restricted%2520countries.webp',
    trades: true,
  })

/** Through the clamp so the value is enum-checked, not just asserted to be. */
const BOOK_DEPTH = clampBybitBookDepth(BYBIT_DEFAULT_BOOK_DEPTH)

export const bybitCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'bybit',
  marketId: 'bybit',
  displayName: 'ByBit',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/bybit.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    options: {
      // Restating the host's default, not overriding it — see the header.
      defaultType: 'spot',
    },
  },
  orderbookDepth: BOOK_DEPTH,
  // Empty-opening trade stream; candles come from watchOHLCV — safe to
  // fill. 60, not the default 100: the spot recent-trades endpoint caps at
  // 60 and ccxt passes the limit through unclamped.
  seedTrades: 60,
  // Native parity: `fetchBybitCandles` clamps to 200 on every call, so the
  // 300-bar default the shell would otherwise pass still yields 200 bars.
  // ccxt's own cap is 1000; raising this is a paging change, not a port.
  maxHistoryLimit: 200,
  // ccxt maps `until` onto ByBit's `end`, which is INCLUSIVE — the boundary bar
  // comes back unless nudged, and a page that filters to nothing latches
  // `exhausted` for the session.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  // 18 s app-level ping answered with a real pong: 3 × 18 s, floored at the
  // session's 45 s.
  livenessTimeoutMs: 60_000,
  applyUrls: (exchange, country) => {
    applyBybitCcxtUrls(exchange, country)
  },
  // `setSandboxMode` has already swapped `urls.api` for the testnet table, but
  // every entry in it is `{hostname}`-templated and the hostname is still the
  // REGIONAL one — so an EU paper slot would come out on `api-testnet.bybit.nl`
  // instead of the single global testnet the native always used.
  applyPaperUrls: (exchange, country) => {
    applyBybitCcxtUrls(exchange, country, true)
  },
  // ByBit blocks US users for all capabilities; resolveBybitRegion only yields
  // null for unserved regions, so both checks surface the same typed error.
  geoCheck: (country, capability) => {
    if (country.toUpperCase() === 'US') {
      throw new GeoRestrictedError('ByBit', country)
    }
    if (capability.startsWith('market-data:') && !resolveBybitRegion(country)) {
      throw new GeoRestrictedError('ByBit', country)
    }
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

export function createBybitMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(bybitCcxtVenue, manifest)
}
