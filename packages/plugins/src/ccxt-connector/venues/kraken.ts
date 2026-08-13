// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **Three OHLCV defects, all patched at the class** (see `../kraken-ohlcv.ts`
 *   for the full reasoning). `watchOHLCV`'s message hash omits the timeframe,
 *   so two timeframes on one symbol collide and the second silently receives
 *   the first's candles; the WS candle cache is stored NEWEST-FIRST while the
 *   return value is its tail, so a live subscription hands back the oldest bar
 *   it holds and the forming bar never moves; and `fetchOHLCV`'s `limit` is
 *   applied client-side from the FRONT of Kraken's fixed 720-bar response, so
 *   asking for 300 returns the oldest 300 — a snapshot ending hundreds of bars
 *   in the past. `withKrakenOhlcvGuard` wraps the constructor so no instance
 *   can exist without the fixes.
 * - **REST paging runs forwards only.** `/0/public/OHLC` has no `end`; the one
 *   cursor is `since`. The guard turns the bridge's `until` into
 *   `until - limit × barWidth`, which is what lets pan-left work at all — the
 *   native connector cannot page and reports exhaustion after its first
 *   window.
 * - **Values arrive as strings over WS and numbers over REST**
 *   (`pro/kraken.js:637-644` builds the candle with `safeString`). The shared
 *   parser coerces with `Number()` rather than trusting `typeof`, so this
 *   needs nothing here — it is asserted in the parser suite instead of being
 *   re-fixed per venue.
 * - **Orderbook depth is an enum**: 10, 25, 100, 500 or 1000, and anything
 *   else throws `NotSupported`. 100 matches the native's `BOOK_DEPTH`. The
 *   checksum stays at ccxt's Kraken default of `false` — upstream disabled it
 *   because the exchange's own checksum was unreliable, and re-enabling it
 *   would rebuild the book on the exchange's bug rather than ours.
 * - **App-level ping every 6 s with a real `handlePong`**, the most aggressive
 *   in the fleet, so pong frames reach the wrapped `handleMessage` and the
 *   silence watchdog has a guaranteed inbound heartbeat. 3 × 6 s floors at the
 *   session's 45 s.
 * - **`rateLimit: 1000 ms`** — one REST request per second, the slowest of the
 *   fleet. Left at ccxt's value: overriding it trades a slow first paint for a
 *   429, and the markets table is cached after the first load anyway.
 * - **No `synthesizeMarket`.** Kraken's market id is an altname
 *   (`BTC/USDT` → `XBTUSDT`, `BTC/USD` → `XXBTZUSD`) that BASE/QUOTE does not
 *   determine, so a stand-in would resolve to a pair that does not exist. A
 *   cold profile waits for the real table; a warm one reads the cache.
 * - Country-agnostic, and `api.kraken.com` sends `Access-Control-Allow-Origin`
 *   — so the browser build goes direct and needs no dev proxy, unlike the
 *   native, which routes dev through `/__kraken` out of habit rather than
 *   need.
 */

import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { withDerivedCandles } from '../derived-candle-plugin'
import { withKrakenOhlcvGuard } from '../kraken-ohlcv'
import type { LiveCandleSource } from '../derived-candle-plugin'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { Timeframe } from '@pairlens/shared/types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/24.png'

export const KRAKEN_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'kraken',
  displayName: 'Kraken',
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
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const krakenMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'kraken-market-connector',
    name: 'Kraken Market Connector',
    displayName: 'Kraken',
    marketId: 'kraken',
    icon: ICON_URL,
    gradient: 'from-purple-500 to-violet-600',
    abbr: 'KR',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
    trades: true,
  })

export const krakenCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'kraken',
  marketId: 'kraken',
  displayName: 'Kraken',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  // No public testnet — paper orders are `validate: true` on AddOrder (see
  // `paperOrderParams`); CREDENTIAL_SCHEMAS gates which modes the wizard
  // offers.
  defaultMode: 'live',
  // AddOrder's documented dry run: the order is validated (pair, size,
  // precision, funds) and never reaches the matching engine. What makes a
  // paper slot on a sandbox-less venue safe to allow.
  paperOrderParams: { validate: true },
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/kraken.js')
    const Base = (module.default ?? module) as unknown as CcxtExchangeCtor
    return withKrakenOhlcvGuard(Base)
  },
  // Kraken's `parseMarkets` reads `options.cachedCurrencies` (populated by
  // `fetchCurrencies`) to WIDEN amount precision where the currency is
  // coarser than the market — without it the table carries a finer precision
  // than Kraken accepts, and the authed instance inherits the public table.
  // The one venue that keeps the public currencies call.
  needsPublicCurrencies: true,
  // Kraken keeps no separate trigger-order id space: `fetchOpenOrders`
  // ignores the trigger/stop params entirely and answers with the same book,
  // so the second probe would be a byte-for-byte duplicate signed request.
  separateTriggerOrderBook: false,
  // 10 | 25 | 100 | 500 | 1000 — anything else throws NotSupported.
  orderbookDepth: 100,
  maxHistoryLimit: 720,
  // Consumed by the guard's patched `fetchOHLCV`, which converts it into the
  // `since` window Kraken actually understands and strips it before the call.
  historyPageParams: (endTs) => ({ until: endTs }),
  livenessTimeoutMs: 45_000,
}

/**
 * The venue serves no 2h interval anywhere — REST or WS — while the chart
 * toolbar offers 2h on every venue. Folded from 1h instead, the same
 * machinery Upbit and Coinbase already ship: history pages read 1h and fold,
 * live bars fold off the venue's own 1h candle stream. The native connector
 * did not have 2h either (its supportedTimeframes omitted it); this closes
 * the toolbar gap rather than reproducing it.
 *
 * The 1h source stream rides Kraken's single-tenant OHLCV guard like any
 * other timeframe: a second pane on the SAME pair at a different timeframe
 * still parks one of the two (see kraken-ohlcv.ts) — the fold neither
 * worsens nor fixes that venue constraint.
 */
const KRAKEN_HISTORY_FOLD: Partial<Record<string, Timeframe>> = {
  '2h': '1h',
}

function krakenLiveSource(timeframe: string): LiveCandleSource {
  return timeframe === '2h'
    ? { kind: 'fold', source: '1h' }
    : { kind: 'passthrough' }
}

export function createKrakenMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const base = createCcxtConnectorPlugin(krakenCcxtVenue, manifest)
  return withDerivedCandles(base, {
    historyFold: KRAKEN_HISTORY_FOLD,
    liveSource: krakenLiveSource,
  })
}
