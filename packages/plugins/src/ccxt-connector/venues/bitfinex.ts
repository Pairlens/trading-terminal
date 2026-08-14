// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex, backed by ccxt Pro.
 *
 * Same plugin id, same exported triple, and the same manifest as the native
 * one — with exactly one deliberate difference, called out below.
 *
 * ── DEVIATION FROM THE NATIVE MANIFEST: `requiresDesktop: true` ───────────
 *
 * Measured 2026-08-11 with `Origin: https://terminal.pairlens.finance`:
 * `api-pub.bitfinex.com` returns 200 and NO `Access-Control-Allow-Origin` on
 * `/v2/candles/...` and `/v2/conf/...`, and `api.bitfinex.com` does the same on
 * `/v2/platform/status`. The native connector survives that by degrading: REST
 * backfill fails in a production browser while the CORS-exempt WebSocket keeps
 * streaming, and history is seeded from a 240-bar WS snapshot instead.
 *
 * ccxt cannot degrade the same way. Every method — `watchOHLCV` included —
 * funnels through `loadMarkets()`, which is REST, so a CORS rejection there
 * means no market table, no symbol resolution and no socket at all. Silent
 * total failure on the hosted terminal.
 *
 * So under ccxt Bitfinex joins the `requiresDesktop` set, in BOTH places the
 * contract requires: the manifest metadata (so the venue picker says so up
 * front) and the spec (so `platformCheck` throws `PlatformRestrictedError`
 * instead of presenting a dead chart). The honest framing is that this makes
 * an already-broken browser experience explicit rather than removing a working
 * one. Restoring browser Bitfinex would mean shipping a pre-seeded market
 * table so `loadMarkets` never runs — the markets pipeline could carry it, and
 * that is the follow-up, not a blocker for the read path.
 *
 * Note `requiresDesktop` only refuses where `isCorsConstrained()` is true — a
 * production browser. Vite dev and the Tauri webview both keep working, which
 * is why the dev-proxy prefixes below still matter.
 *
 * ── Other venue specifics ─────────────────────────────────────────────────
 *
 * - **`precisionMode = SIGNIFICANT_DIGITS`**, the only venue in the fleet that
 *   is not `TICK_SIZE`. A live BTC/USDT market reports
 *   `precision: { amount: 8, price: 5 }`, meaning five significant digits, not
 *   a five-unit tick. Nothing in the bridge interprets it: `trimMarket` stores
 *   `precision` verbatim for `setMarkets` to hand back to ccxt, and no parser
 *   or mapper reads it. Order sizing must go through
 *   `amountToPrecision`/`priceToPrecision` (which branch on
 *   `exchange.precisionMode` internally) rather than any arithmetic of ours —
 *   a note for the trading phase, asserted here by a test that the cached
 *   market shape is pass-through.
 * - **Orderbook depth is 25 or 100 only**, anything else throws
 *   `ExchangeError`. 25 matches the native's `len: '25'`; `prec: 'P0'`,
 *   `freq: 'F0'` and the checksum stay at ccxt's defaults.
 * - **`fetchOHLCV` walks history from the wrong end.** ccxt pins `sort: 1`,
 *   which with no cursor starts at pair inception: a 300-bar 1h request
 *   returned March 2019 at a close of 4962, and the chart drew it as the
 *   present. `withBitfinexHistoryOrder` restores the native's `sort=-1`; see
 *   `../bitfinex-history.ts`. The cap is 10 000 — the deepest single-call
 *   history in the fleet — and `until` maps to Bitfinex's `end`, which is
 *   INCLUSIVE, so the cursor is nudged with `pageEndMs` and the page filtered
 *   by `olderThan`.
 * - **No client ping**, and ccxt explicitly skips the per-channel `hb` frames
 *   (`pro/bitfinex.js:1281`) rather than treating them as liveness. They still
 *   reach the host's wrapped `handleMessage`, which sits at the socket's entry
 *   point and counts every frame before ccxt decides to ignore it — so the
 *   silence watchdog does have a heartbeat here, roughly every 15 s.
 * - **No `watchTickers`** — irrelevant, the bridge subscribes per symbol and
 *   the bulk snapshot is a REST `execute`.
 * - **No `synthesizeMarket`.** Ids are `tBTCUST`-shaped: a `t` prefix, and
 *   `UST` rather than `USDT`. BASE/QUOTE does not determine that, so a
 *   stand-in would name a pair that does not exist.
 */

import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { isDevProxyAvailable } from '@pairlens/market-engine/platform'
import { createCexConnectorManifest } from '../../cex-connector'
import { withBitfinexHistoryOrder } from '../bitfinex-history'
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

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/37.png'

export const BITFINEX_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bitfinex',
  displayName: 'Bitfinex',
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
  requiresDesktop: true,
}

export const bitfinexMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bitfinex-market-connector',
    name: 'Bitfinex Market Connector',
    displayName: 'Bitfinex',
    marketId: 'bitfinex',
    icon: ICON_URL,
    gradient: 'from-green-600 to-emerald-800',
    abbr: 'BFX',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
    trades: true,
    // The deviation. See the header.
    requiresDesktop: true,
  })

export const bitfinexCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'bitfinex',
  marketId: 'bitfinex',
  displayName: 'Bitfinex',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  // No sandbox; CREDENTIAL_SCHEMAS lists Bitfinex as live-only.
  defaultMode: 'live',
  requiresDesktop: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/bitfinex.js')
    const Base = (module.default ?? module) as unknown as CcxtExchangeCtor
    return withBitfinexHistoryOrder(Base)
  },
  options: {
    // ccxt has no app-level ping for Bitfinex, so its keepalive timer falls
    // through to a PROTOCOL ping — which only exists off-browser, and which
    // Bitfinex never pongs. Measured under bun: every socket died at
    // `keepAlive × maxPingPongMisses` with "timed out due to a ping-pong
    // keepalive missing on time", roughly every 90 s, on a feed that was
    // delivering the whole time. In a browser the same branch is a no-op that
    // just refreshes `lastPong`, so this costs nothing there and stops the CLI
    // reconnecting on a phantom stall. Liveness stays where the bridge already
    // owns it: the inbound-silence watchdog, fed by Bitfinex's own `hb`.
    streaming: { keepAlive: 0 },
  },
  // 25 or 100 only — anything else throws ExchangeError.
  orderbookDepth: 25,
  // The book channel's subscribe snapshot trails 1.7-2.3 s behind the other
  // channels on every switch (measured 2026-08-14). REST book/P0 accepts
  // len 25, so `true` rides `orderbookDepth` through. Desktop-only venue —
  // in a browser the connector refuses before any seed could run.
  seedOrderBook: true,
  maxHistoryLimit: 10_000,
  // `end` is inclusive; `olderThan` still filters the page.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 60_000,
  applyUrls: (exchange) => {
    // Relative prefixes on purpose: `restFetch` leaves relative URLs on
    // `globalThis.fetch`, which resolves them against the dev server, where
    // the proxy lives. An absolute localhost URL would be routed through the
    // Tauri Rust client under `tauri dev`, whose scope does not list it.
    // Resolved per instance rather than at module scope — a module-level const
    // captures the SSR value.
    if (!isDevProxyAvailable()) return
    const api = exchange.urls['api'] as Record<string, unknown>
    api['public'] = '/__bitfinex'
    api['private'] = '/__bitfinex-auth'
    api['v1'] = '/__bitfinex-auth'
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
const BITFINEX_HISTORY_FOLD: Partial<Record<string, Timeframe>> = {
  '2h': '1h',
}

function bitfinexLiveSource(timeframe: string): LiveCandleSource {
  return timeframe === '2h'
    ? { kind: 'fold', source: '1h' }
    : { kind: 'passthrough' }
}

export function createBitfinexMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const base = createCcxtConnectorPlugin(bitfinexCcxtVenue, manifest)
  return withDerivedCandles(base, {
    historyFold: BITFINEX_HISTORY_FOLD,
    liveSource: bitfinexLiveSource,
  })
}
