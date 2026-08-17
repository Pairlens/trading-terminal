// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Binance USD-M perpetual futures, backed by ccxt Pro's `binanceusdm`.
 *
 * Venue specifics the runtime has to encode:
 *
 * - **The only browser-capable venue of the three.** `fapi.binance.com` answers
 *   a cross-origin GET with `access-control-allow-origin: *` (measured
 *   2026-08-15), so the hosted terminal and the phone reach it directly. No
 *   `requiresDesktop`, no dev proxy.
 * - **Paper is a real second environment.** `urls.test` points the whole fapi
 *   tree at `testnet.binancefuture.com` and the socket at
 *   `fstream.binancefuture.com`, so a paper credential signs against a genuine
 *   matching engine rather than being simulated.
 * - **Not available to US persons.** `binance.us` lists no derivatives at all,
 *   so unlike the spot connector there is no regional host to route to — the
 *   honest answer is a typed refusal, which is also what raises the terminal's
 *   region dialog instead of a chart that never seeds.
 * - **Leverage is not in the market rows.** ccxt exposes Binance's tiers only
 *   through `fetchLeverageTiers`, a signed call per symbol, so the 125x ceiling
 *   is declared as venue metadata and the venue still owns the final refusal
 *   (the real cap is per symbol and per notional tier).
 * - **`rateLimit: 25` with the rolling window.** ccxt ships 50 ms/weight, which
 *   is the SPOT budget halved again; USD-M futures publishes 2400 weight per
 *   rolling minute, and 60000/25 is exactly 2400 — the same reasoning as the
 *   spot venue, at the futures number. `rollingWindow` matters as much as the
 *   value: ccxt's default leaky bucket banks one token of idle credit, so a
 *   subscribe burst serializes even on an idle instance.
 * - **`batchTickers`, for the same reason as spot Binance.** ccxt's `stream()`
 *   gives each subscription hash its own socket, so a 15-pair watchlist would
 *   dial 15 handshakes; one `watchTickers(symbols)` is a single socket carrying
 *   a single SUBSCRIBE frame, which cannot trip the ~5 inbound msg/s per
 *   connection limit no matter how long the list grows.
 * - **No `synthesizeMarket`.** Deliberate across all three futures venues — see
 *   `futures-markets.ts`. `BTCUSDT` happens to be derivable here, but a
 *   stand-in carries no `contractSize`, and a contract count sized against a
 *   missing contract size is a position of the wrong size.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { pageEndMs } from '@pairlens/market-engine/candle-paging'
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

const ICON_URL = 'https://bin.bnbstatic.com/static/images/common/favicon.ico'

/** Every interval in the app's union is a real fapi kline interval. */
export const BINANCE_FUTURES_TIMEFRAMES: Array<Timeframe> = [
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
]

/** Binance's own ceiling on a USD-M perp; the per-symbol tier cap is lower. */
export const BINANCE_FUTURES_MAX_LEVERAGE = 125

export const BINANCE_FUTURES_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'binance-futures',
  displayName: 'Binance Futures',
  assetClasses: ['crypto-perp'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
  ],
  supportedTimeframes: [...BINANCE_FUTURES_TIMEFRAMES],
  iconUrl: ICON_URL,
  triggerOrders: true,
  maxLeverage: BINANCE_FUTURES_MAX_LEVERAGE,
}

export const binanceFuturesMarketConnectorManifest: PluginManifest =
  createCexFuturesConnectorManifest({
    id: 'binance-futures-market-connector',
    name: 'Binance Futures Market Connector',
    displayName: 'Binance Futures',
    marketId: 'binance-futures',
    icon: ICON_URL,
    gradient: 'from-amber-400 to-orange-600',
    abbr: 'BNF',
    timeframes: [...BINANCE_FUTURES_TIMEFRAMES],
    maxLeverage: BINANCE_FUTURES_MAX_LEVERAGE,
    triggerOrders: true,
    // One Binance key covers spot and USD-M futures; without the alias the
    // user would be asked to enter the same credential twice.
    credentialAlias: 'binance',
    headerImage:
      'https://public.bnbstatic.com/image/cms/blog/20240531/6422bedf-f72e-44e8-be9e-bf77d329bdbd.png',
  })

export const binanceFuturesCcxtVenue: CcxtFuturesVenueConfig = {
  exchangeId: 'binanceusdm',
  marketId: 'binance-futures',
  displayName: 'Binance Futures',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  maxLeverage: BINANCE_FUTURES_MAX_LEVERAGE,
  loadExchangeClass: async () => {
    // Deep subpath, dynamically: the barrel would pull ~130 exchange classes
    // into the graph and a static import would put this one in the entry chunk.
    const module = await import('ccxt/js/src/pro/binanceusdm.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    // 60000/25 = 2400, the USD-M rolling-minute weight budget. See the header.
    rateLimit: 25,
    rateLimiterAlgorithm: 'rollingWindow',
    // No app-level ping and no pong handler, so ccxt's keepalive degrades to
    // the runtime's protocol PING — dead in a browser, and under bun it kills
    // a healthy socket. Liveness lives with the hub's silence watchdog.
    streaming: { keepAlive: 0 },
    options: {
      // The exchange host defaults every instance to spot; a futures venue has
      // to say otherwise or `loadMarkets` returns an empty table and every
      // symbol resolves to nothing.
      defaultType: 'swap',
      defaultSubType: 'linear',
      fetchMarkets: { types: ['linear'] },
    },
  },
  batchTickers: true,
  // ccxt caps the book it maintains at this depth and seeds it from a REST
  // snapshot of the same size. 500 reproduces the spot venue's chosen depth,
  // which is what the depth pane's Auto grouping and the liquidity heatmap
  // were tuned against.
  orderbookDepth: 500,
  // Diff-stream + REST snapshot: nothing renders until the socket dials, the
  // SUBSCRIBE is acked, the snapshot downloads and the buffered diffs replay.
  // The seed fires that same snapshot at subscribe time, in parallel.
  seedOrderBook: true,
  // The trade stream sends only NEW prints, so a quiet perp's tape opens empty
  // and stays empty. Safe here because candles come from watchOHLCV and are
  // never folded from the tape.
  seedTrades: true,
  // Conditional (STOP/TAKE_PROFIT) orders come back from the SAME
  // fetchOpenOrders call on USD-M, so the second probe would be a duplicate
  // signed request whose rows the id de-dup throws away.
  separateTriggerOrderBook: false,
  // fapi klines cap at 1500 per call.
  maxHistoryLimit: 1500,
  // `endTime` is INCLUSIVE — the boundary bar comes back unless nudged, and a
  // page that filters to nothing latches `exhausted` for the session.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 120_000,
  // USD-M settles every eight hours, and the premium-index rows ccxt parses
  // carry no period at all — so this is the value nearly every contract
  // annualises against. The exceptions (a handful settle every four hours) come
  // from `fetchFundingIntervals`, which this venue does publish; `funding.ts`
  // prefers that table wherever it has a row.
  fundingIntervalHours: 8,
  geoCheck: (country) => {
    // No US derivatives host exists to route to, unlike the spot connector.
    if (country.toUpperCase() === 'US') {
      throw new GeoRestrictedError('Binance Futures', country)
    }
  },
}

export function createBinanceFuturesMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtFuturesConnectorPlugin(binanceFuturesCcxtVenue, manifest)
}
