// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase Advanced Trade, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple. Coinbase is the awkward one of the fleet, and every quirk
 * below is load-bearing.
 *
 * - **There is no candle channel.** Not "ccxt does not enable it" — there is no
 *   `handleOHLCV` in `pro/coinbase.js` and no `candles` entry in its handler
 *   table at all. Candles are therefore built from `market_trades` by the
 *   shared aggregator, seeded and repaired from REST. See
 *   `../trade-candle-aggregator.ts`.
 * - **No 4h and no 1w granularity either**, REST or WS: the enum stops at
 *   `ONE_MINUTE … TWO_HOUR, SIX_HOUR, ONE_DAY`. Both are folded from the
 *   timeframe below (4h from 1h, 1w from 1d) for history; live bars come off
 *   the tape like every other timeframe, so nothing special is needed there.
 * - **The candles endpoint cannot express "the N bars before T".** It demands
 *   both `start` and `end`, 400s an inverted pair, and 400s a window wider than
 *   ~350 bars (measured). ccxt's default fills `start` with
 *   `now - limit·duration`, which inverts the moment you page past the first
 *   screen — so the window is sized here, from the timeframe and the limit.
 * - **`side` on the tape is the MAKER's.** The native connector inverts it
 *   (`coinbase-market-connector/parser.ts:133-158`, measured at 11% agreement
 *   over 282 prints), ccxt passes the venue's field through unchanged, and the
 *   measurement was repeated against ccxt's unified trades before this file
 *   turned the inversion back on — see `../coinbase-trade-side.ts`.
 * - **requiresDesktop**, as before: `api.coinbase.com` sends no
 *   `Access-Control-Allow-Origin` and there is no WS history to fall back on,
 *   so a production browser build refuses rather than drawing a dead chart. In
 *   Vite dev the `/__coinbase` proxy stands in and the venue works normally.
 * - No app-level ping, and ccxt never subscribes the `heartbeats` channel, so
 *   there is no guaranteed inbound frame; the silence budget is generous
 *   because the only traffic on a quiet pair is the market itself.
 */

import { timeframeToMs } from '@pairlens/shared'
import { isDevProxyAvailable } from '@pairlens/market-engine/platform'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { withDerivedCandles } from '../derived-candle-plugin'
import { withAggressorTradeSides } from '../coinbase-trade-side'
import type { LiveCandleSource } from '../derived-candle-plugin'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type { Timeframe } from '@pairlens/shared/types'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL = '/posters/coinbase-market-connector.png'

export const COINBASE_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'coinbase',
  displayName: 'Coinbase',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  requiresDesktop: true,
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    {
      key: 'apiSecret',
      label: 'API Secret (PEM)',
      type: 'secret',
      required: true,
    },
  ],
  // 4h and 1w are new: the venue serves neither, and both are folded here.
  supportedTimeframes: [
    '1m',
    '5m',
    '15m',
    '30m',
    '1h',
    '2h',
    '4h',
    '6h',
    '1d',
    '1w',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const coinbaseMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'coinbase-market-connector',
    name: 'Coinbase Market Connector',
    displayName: 'Coinbase',
    description:
      'Direct market data and trading via Coinbase Advanced Trade APIs',
    marketId: 'coinbase',
    icon: ICON_URL,
    gradient: 'from-blue-500 to-indigo-600',
    abbr: 'CB',
    requiresDesktop: true,
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=600&q=80',
    trades: true,
  })

/** Target timeframe → the venue timeframe its history is folded from. */
export const COINBASE_HISTORY_FOLD: Partial<Record<string, Timeframe>> = {
  '4h': '1h',
  '1w': '1d',
}

/** Every timeframe comes off the trade tape — there is no candle channel. */
export function coinbaseLiveSource(): LiveCandleSource {
  return { kind: 'trades' }
}

export const coinbaseCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'coinbase',
  marketId: 'coinbase',
  displayName: 'Coinbase',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  // ccxt has no Coinbase sandbox (`urls.test` is declared-but-undefined), so
  // paper used to be a hard refusal. `preview: true` is ccxt's dry run: the
  // order routes to the Advanced Trade order-preview endpoint
  // (`/brokerage/orders/preview`), which prices and validates it against the
  // real account without executing.
  paperOrderParams: { preview: true },
  // ccxt gates a base-denominated market buy on a price here (`createMarket-
  // BuyOrderRequiresPrice`) so it can compute the cost to spend; the trading
  // runtime fetches a reference price and passes it through.
  marketBuyRequiresPrice: true,
  requiresDesktop: true,
  // `/__coinbase` and `/__coinbase-sandbox` exist in
  // apps/terminal/vite.config.ts, so browser dev reaches this venue and must
  // not be refused.
  devProxy: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/coinbase.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    // No app-level ping and no pong handler, so ccxt's keepalive degrades to
    // the runtime's protocol PING: under bun it kills a healthy socket every
    // keepAlive × maxPingPongMisses; in a browser it cannot fire at all. Off,
    // as on Gate and Bitfinex — liveness lives with the hub's inbound-silence
    // watchdog.
    streaming: { keepAlive: 0 },
  },
  // ccxt's coinbase unsubscribe poisons the instance: `unSubscriptionPending`
  // wedges true after the first unwatch (its ack only matches an EMPTY
  // subscription list) and the unsubscribed channel keeps its local
  // subscription entry, so revisiting a pair parks a watch on a channel the
  // server no longer sends — a permanently dead price header, verified live
  // on BTC-USD (2026-08-14). Orphan-counting instead lets the threshold
  // rebuild shed channels wholesale.
  suppressUnwatch: true,
  // The ticker channel emits per trade. With unwatch suppressed a revisited
  // pair re-attaches to the live channel and waits for the next print — the
  // REST seed paints the header immediately either way.
  seedTicker: true,
  // `l2_data` carries the whole book; ccxt ignores the depth argument here.
  orderbookDepth: undefined,
  maxHistoryLimit: 300,
  historyParams: ({ timeframe, limit, endTs }) =>
    coinbaseCandleWindow(timeframe, limit, endTs),
  livenessTimeoutMs: 180_000,
  applyUrls: (exchange) => {
    const api = exchange.urls['api'] as Record<string, unknown>
    // No CORS headers on the real host. Dev goes through the Vite proxy;
    // production browser builds never get here (requiresDesktop refuses
    // first), and desktop rides the Rust HTTP client on the absolute URL.
    api['rest'] = isDevProxyAvailable()
      ? '/__coinbase'
      : 'https://api.coinbase.com'
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

/**
 * The `start`/`end` pair Coinbase's candles endpoint requires, in seconds.
 *
 * `end` is exclusive by one second because the venue returns the bar sitting
 * exactly on the cursor, and one duplicated boundary bar makes a page filter
 * to empty, which the chart latches as "no more history".
 */
export function coinbaseCandleWindow(
  timeframe: string,
  limit: number,
  endTs?: number,
): Record<string, string> {
  const widthSec = Math.max(
    60,
    Math.round(timeframeToMs(timeframe as Timeframe) / 1000),
  )
  const end =
    endTs !== undefined
      ? Math.floor(endTs / 1000) - 1
      : Math.floor(Date.now() / 1000)
  // One bar of slack: the boundary nudge above must not cost a bar off the
  // old end of the page.
  const start = end - widthSec * (Math.max(1, limit) + 1)
  return { start: String(start), end: String(end) }
}

export function createCoinbaseMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const base = createCcxtConnectorPlugin(coinbaseCcxtVenue, manifest)
  return withDerivedCandles(withAggressorTradeSides(base), {
    historyFold: COINBASE_HISTORY_FOLD,
    liveSource: coinbaseLiveSource,
  })
}
