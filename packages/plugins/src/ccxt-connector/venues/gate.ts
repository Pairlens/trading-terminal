// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Gate.io, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **Desktop-only, in both halves.** `api.gateio.ws` sends no
 *   `Access-Control-Allow-Origin` and there is no CORS-enabled sibling, so a
 *   hosted browser can stream but never backfill. Manifest says so, spec
 *   refuses.
 * - **`1M` is missing from ccxt's timeframe table.** Gate serves monthly bars as
 *   `30d`; ccxt maps `1w → 7d` but stops there, so without the override ccxt
 *   passes `1M` through untouched and Gate rejects the request. Verified live:
 *   with the override, `fetchOHLCV('BTC/USDT','1M')` returns calendar-month
 *   bars. `3d` genuinely does not exist on Gate and stays unmapped.
 * - **The spot orderbook is a WS snapshot, not a REST-seeded delta book.** ccxt
 *   routes spot through the `spot.obu` channel (`ob.<id>.<depth>`), whose frames
 *   carry `full: true` and reset the book wholesale; only `gateeu` and the
 *   contract markets take the `spot.order_book_update` path that spawns
 *   `loadOrderBook`. So no REST call rides the subscribe path here — which also
 *   means the `fetchImplementation` question is moot for the book, though every
 *   other REST read still goes through `restFetch`.
 * - **No app-level ping and no heartbeat responder.** Gate's protocol expects a
 *   `spot.ping` that ccxt never sends, and ccxt's own stall detector is a no-op
 *   in a browser, so the only inbound traffic is market data. The silence budget
 *   is therefore generous: a subscribed pair ticks far inside it, and a false
 *   positive costs one reconnect.
 * - **The bulk ticker snapshot reports the wrong WINDOW out of the box.** ccxt
 *   pins `timezone: 'utc0'` on `fetchTickers`, which makes Gate report change
 *   since UTC midnight instead of rolling 24 h — see `gate-exchange.ts`.
 * - **Testnet is a different host AND a different socket**
 *   (`api-testnet.gateapi.io` / `wss://ws-testnet.gate.com/v4/ws/spot`), both in
 *   `gate-regions.ts` behind the `paper` flag. The read path is always
 *   production; paper resolution belongs to the trading phase, per slot.
 */

import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { withGateQuirks } from './gate-exchange'
import { applyGateRestBase, resolveGateCcxtUrls } from './gate-regions'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/302.png'

export const GATE_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'gate',
  displayName: 'Gate.io',
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
  ],
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const gateMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'gate-market-connector',
    name: 'Gate.io Market Connector',
    displayName: 'Gate.io',
    marketId: 'gate',
    icon: ICON_URL,
    gradient: 'from-sky-500 to-blue-600',
    abbr: 'GT',
    requiresDesktop: true,
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=600&q=80',
    trades: true,
  })

export const gateCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'gate',
  marketId: 'gate',
  displayName: 'Gate.io',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  // ccxt gates a base-denominated market buy on a price here (`createMarket-
  // BuyOrderRequiresPrice`) so it can compute the cost to spend; the trading
  // runtime fetches a reference price and passes it through.
  marketBuyRequiresPrice: true,
  requiresDesktop: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/gate.js')
    const Base = (module.default ?? module) as unknown as CcxtExchangeCtor
    return withGateQuirks(Base)
  },
  options: {
    // ccxt's keepalive is worse than useless on Gate. There is no app-level
    // ping and no pong handler, so `onPingInterval` falls through to the
    // runtime's protocol PING — which exists under bun and node but not in a
    // browser. Under bun, `lastPong` therefore never advances and ccxt kills a
    // perfectly healthy socket every `2 × keepAlive` (observed: a
    // "ping-pong keepalive missing on time" disconnect inside a 100 s live
    // run). In a browser the same code path silently pretends a pong arrived,
    // so ccxt detects nothing at all. Turning it off makes every runtime agree
    // and leaves staleness where the bridge already owns it: the hub's
    // inbound-silence watchdog below.
    streaming: { keepAlive: 0 },
  },
  timeframeOverrides: { '1M': '30d' },
  // Spot default; `spot.obu` pushes a full book at this depth. 400 would switch
  // the push interval, which nothing asks for.
  orderbookDepth: 50,
  maxHistoryLimit: 1000,
  // Gate's `to` is INCLUSIVE (ccxt forwards `until` as `to`), so the boundary
  // bar comes back unless the cursor is nudged.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 120_000,
  applyUrls: (exchange) => {
    const urls = resolveGateCcxtUrls()
    const api = exchange.urls['api'] as Record<string, unknown>
    applyGateRestBase(api, urls.rest)
    api['spot'] = urls.ws
  },
  // `setSandboxMode` replaces the whole `urls.api` subtree with Gate's
  // `urls.test`, which carries REST `public`/`private` and WS
  // `swap`/`future`/`option` — but NO top-level `spot`, the key ccxt's
  // private spot stream resolves through `getUrlByMarketType('spot')`. Without
  // this hook a paper slot's order/balance socket resolved `undefined` and
  // retried forever behind backoff. Reinstall the testnet REST base (with its
  // dev-proxy prefix, which the swap also discards) and the spot socket.
  applyPaperUrls: (exchange) => {
    const urls = resolveGateCcxtUrls(true)
    const api = exchange.urls['api'] as Record<string, unknown>
    applyGateRestBase(api, urls.rest)
    api['spot'] = urls.ws
  },
  synthesizeMarket: (pair) => {
    const [base, quote] = pair.split('-')
    if (!base || !quote) return null
    const id = `${base}_${quote}`
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

export function createGateMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(gateCcxtVenue, manifest)
}
