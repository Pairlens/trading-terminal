// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ByBit USDT-margined perpetuals, backed by ccxt Pro's `bybit` — the SAME
 * class the spot connector loads, pointed at the linear-swap universe.
 *
 * Venue specifics the runtime has to encode:
 *
 * - **Browser-capable.** `api.bybit.com`, `api-testnet.bybit.com` and
 *   `api.bybit.nl` all reflect the request `Origin` (measured 2026-08-18), so
 *   the hosted terminal and the phone reach the futures REST exactly as they
 *   reach spot. No `requiresDesktop`, no dev proxy.
 * - **One class, two universes, shared ids.** `BTCUSDT` is both a spot pair
 *   and a linear perpetual on ByBit, which is exactly why the spot venue
 *   restates `defaultType: 'spot'`. This venue is the other side of that coin:
 *   `defaultType: 'swap'` plus a linear-only markets download, or every
 *   ambiguous resolution lands on the wrong universe.
 * - **Regional routing is the spot venue's, verbatim.** Every URL is
 *   `{hostname}`-templated, so `applyBybitCcxtUrls` moves REST and the socket
 *   with one assignment: EU/EEA on `bybit.nl`, everyone else on `bybit.com`,
 *   and the US refused outright — ByBit serves no US customers on any product,
 *   derivatives included.
 * - **Paper is the spot venue's one global testnet.** `urls.test` is
 *   `{hostname}`-templated too, so the same helper pins `api-testnet.bybit.com`
 *   regardless of region; the testnet lists linear perps against a real
 *   matching engine. (ByBit's newer "demo trading" environment,
 *   `api-demo.bybit.com`, has separate keys and is deliberately not used —
 *   testnet is what the spot venue's paper slots were issued against.)
 * - **Delta tickers are already merged.** The v5 linear `tickers` channel
 *   sends a snapshot then partial delta frames; ccxt's `handleTicker` extends
 *   the stored raw payload in place before re-parsing, so no carry-forward
 *   patch of the KuCoin Futures kind is needed here.
 * - **Conditional orders ride the same open-orders call.** v5's `orderFilter`
 *   split (`Order` vs `StopOrder`) is a SPOT-only parameter; for linear one
 *   `/v5/order/realtime` read returns both, so the second trigger probe would
 *   be a duplicate signed request whose rows the id de-dup throws away.
 * - **`orderbookDepth: 200`.** ccxt validates linear depths against
 *   `[1, 50, 200, 1000]` and the venue's own linear channels are
 *   1/50/200/500 — 200 is in both sets and is the depth the spot venue's
 *   pane tuning was measured at.
 * - **Funding intervals ride the market rows.** ByBit stamps `fundingInterval`
 *   (in minutes) on every instrument and ccxt projects it onto each parsed
 *   funding rate, so the eight-hour figure below is only the fallback.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import {
  applyBybitCcxtUrls,
  resolveBybitRegion,
} from '../../ccxt-connector/venues/bybit-regions'
import { createCexFuturesConnectorManifest } from '../manifest'
import { createCcxtFuturesConnectorPlugin } from '../index'
import type { CcxtExchangeCtor } from '../../ccxt-connector/types'
import type { CcxtFuturesVenueConfig } from '../futures-types'
import type { Timeframe } from '@pairlens/shared/types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL = 'https://www.bybit.com/favicon.ico'

/**
 * The venue's kline intervals, intersected with the app's union. ByBit also
 * serves 3m/6h/12h (absent from the union) and nothing at 3d.
 */
export const BYBIT_FUTURES_TIMEFRAMES: Array<Timeframe> = [
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
]

/** BTCUSDT's `leverageFilter.maxLeverage` (measured 2026-08-18); tiers cap lower. */
export const BYBIT_FUTURES_MAX_LEVERAGE = 100

export const BYBIT_FUTURES_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bybit-futures',
  displayName: 'ByBit Futures',
  assetClasses: ['crypto-perp'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
  ],
  supportedTimeframes: [...BYBIT_FUTURES_TIMEFRAMES],
  iconUrl: ICON_URL,
  triggerOrders: true,
  maxLeverage: BYBIT_FUTURES_MAX_LEVERAGE,
}

export const bybitFuturesMarketConnectorManifest: PluginManifest =
  createCexFuturesConnectorManifest({
    id: 'bybit-futures-market-connector',
    name: 'ByBit Futures Market Connector',
    displayName: 'ByBit Futures',
    marketId: 'bybit-futures',
    icon: ICON_URL,
    gradient: 'from-orange-500 to-orange-700',
    abbr: 'BBF',
    timeframes: [...BYBIT_FUTURES_TIMEFRAMES],
    maxLeverage: BYBIT_FUTURES_MAX_LEVERAGE,
    triggerOrders: true,
    // One v5 key signs spot and derivatives alike; without the alias the user
    // would be asked to enter the same credential twice.
    credentialAlias: 'bybit',
    headerImage:
      'https://cdn.prod.website-files.com/67ed326db9d26b1dc1df7929/680180233aeb270c28777c41_67b3e61a44517e3aa323445d_bybit%2520supported%2520and%2520restricted%2520countries.webp',
  })

export const bybitFuturesCcxtVenue: CcxtFuturesVenueConfig = {
  exchangeId: 'bybit',
  marketId: 'bybit-futures',
  displayName: 'ByBit Futures',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  maxLeverage: BYBIT_FUTURES_MAX_LEVERAGE,
  loadExchangeClass: async () => {
    // Deep subpath, dynamically: the barrel would pull ~130 exchange classes
    // into the graph. Same chunk as the spot venue — the class is shared, the
    // instances are not.
    const module = await import('ccxt/js/src/pro/bybit.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    options: {
      // The exchange host defaults every instance to spot; a futures venue has
      // to say otherwise or every shared-id resolution lands on the spot pair.
      defaultType: 'swap',
      defaultSubType: 'linear',
      // deepExtend merges this into ccxt's own fetchMarkets dict, so only the
      // universe list changes: one linear instruments download instead of
      // spot + linear + inverse + option.
      fetchMarkets: { types: ['linear'] },
    },
  },
  // ccxt's linear enum is [1, 50, 200, 1000]; the venue's own channels are
  // 1/50/200/500. 200 is in both and matches the spot venue's tuning.
  orderbookDepth: 200,
  // Empty-opening trade stream; candles come from watchOHLCV — safe to fill.
  // The linear recent-trade endpoint caps at 1000, so the shell's default
  // limit needs no clamp of the spot venue's kind (spot caps at 60).
  seedTrades: true,
  // v5 returns conditional orders in the SAME realtime read on linear —
  // `orderFilter` is a spot-only parameter — so a second probe would be a
  // duplicate signed request.
  separateTriggerOrderBook: false,
  // v5 kline caps at 1000 per call.
  maxHistoryLimit: 1000,
  // ccxt maps `until` onto ByBit's `end`, which is INCLUSIVE — the boundary
  // bar comes back unless nudged, and a page that filters to nothing latches
  // `exhausted` for the session.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  // 18 s app-level ping answered with a real pong: 3 × 18 s, floored at the
  // session's 45 s. Same budget as the spot venue.
  livenessTimeoutMs: 60_000,
  // The fallback only: ByBit stamps `fundingInterval` on every instrument row
  // and ccxt carries it into each parsed rate, so per-contract clocks (a
  // handful settle every four hours or hourly) come from the payload.
  fundingIntervalHours: 8,
  applyUrls: (exchange, country) => {
    applyBybitCcxtUrls(exchange, country)
  },
  // `setSandboxMode` has already swapped in the testnet table, but every entry
  // is `{hostname}`-templated and still regional — the helper pins the ONE
  // global testnet, exactly as it does for spot.
  applyPaperUrls: (exchange, country) => {
    applyBybitCcxtUrls(exchange, country, true)
  },
  // ByBit blocks US users for all capabilities, derivatives included; any
  // region the router cannot serve is refused for market data. Both branches
  // raise the typed error the region dialog keys on — the spot venue's rules,
  // under this venue's own name.
  geoCheck: (country, capability) => {
    if (country.toUpperCase() === 'US') {
      throw new GeoRestrictedError('ByBit Futures', country)
    }
    if (capability.startsWith('market-data:') && !resolveBybitRegion(country)) {
      throw new GeoRestrictedError('ByBit Futures', country)
    }
  },
}

export function createBybitFuturesMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtFuturesConnectorPlugin(bybitFuturesCcxtVenue, manifest)
}
