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
 * - **The ticker rides `market.<id>.ticker`, not ccxt's default
 *   `market.<id>.detail`.** `detail` carries open/high/low/close/volume and
 *   NO top of book, so every consumer that ranks on bid/ask (the Venue
 *   Ladder, the cross-venue arb edge) silently skipped HTX. `ticker` is the
 *   same 100 ms aggregate plus `bid`/`bidSize`/`ask`/`askSize`, and ccxt maps
 *   both channels through the same `handleTicker`/`parseTicker` pair, so this
 *   is strictly more data on the same one subscription — verified frame for
 *   frame against `detail` (identical last, high, volume and percentage).
 *   Spot only, which is all this bridge trades; ccxt throws `BadRequest` if a
 *   contract market ever asks for it.
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
import { withDerivedCandles } from '../derived-candle-plugin'
import type { LiveCandleSource } from '../derived-candle-plugin'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { Timeframe } from '@pairlens/shared/types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL = '/posters/htx-market-connector.png'

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
  // ccxt gates a base-denominated market buy on a price here (`createMarket-
  // BuyOrderRequiresPrice`) so it can compute the cost to spend; the trading
  // runtime fetches a reference price and passes it through.
  marketBuyRequiresPrice: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/htx.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    // No app-level ping and no pong handler (HTX's own ping/pong rides inside
    // gzipped frames ccxt answers in handleMessage, which never touches
    // `lastPong`), so ccxt's keepalive degrades to the runtime's protocol
    // PING: under bun it kills a healthy socket every keepAlive ×
    // maxPingPongMisses; in a browser it cannot fire at all. Off, as on Gate
    // and Bitfinex — liveness lives with the hub's inbound-silence watchdog.
    streaming: { keepAlive: 0 },
    options: {
      // Object form, not the array the other venues take — see the header.
      fetchMarkets: { types: { spot: true, linear: false, inverse: false } },
      // Top of book on the ticker channel — see the header. `unWatchTicker`
      // reads the same option, so the unsubscribe still names the topic that
      // was subscribed.
      watchTicker: { name: 'market.{marketId}.ticker' },
    },
  },
  // 5 | 20 | 150 | 400 — anything else throws ExchangeError.
  orderbookDepth: 150,
  // The depth channel pushes a full snapshot only on its ~1 s cadence, so a
  // switch waits ~1.5 s for the first book (measured 2026-08-14). ccxt's
  // REST fetchOrderBook accepts limit 5|10|20|150 and treats 150 (step0's
  // implicit default) by omitting the depth param — so `true`, riding
  // `orderbookDepth` 150 through, is exactly the valid full-depth call.
  seedOrderBook: true,
  // Empty-opening trade stream; candles come from watchOHLCV (the 2h fold
  // derives from 1h CANDLES, not the tape) — safe to fill.
  seedTrades: true,
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

/**
 * The venue serves no 2h interval anywhere — REST or WS — while the chart
 * toolbar offers 2h on every venue. Folded from 1h instead, the same
 * machinery Upbit and Coinbase already ship: history pages read 1h and fold,
 * live bars fold off the venue's own 1h candle stream. The native connector
 * did not have 2h either (its supportedTimeframes omitted it); this closes
 * the toolbar gap rather than reproducing it.
 */
const HTX_HISTORY_FOLD: Partial<Record<string, Timeframe>> = {
  '2h': '1h',
}

function htxLiveSource(timeframe: string): LiveCandleSource {
  return timeframe === '2h'
    ? { kind: 'fold', source: '1h' }
    : { kind: 'passthrough' }
}

export function createHtxMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const base = createCcxtConnectorPlugin(htxCcxtVenue, manifest)
  return withDerivedCandles(base, {
    historyFold: HTX_HISTORY_FOLD,
    liveSource: htxLiveSource,
  })
}
