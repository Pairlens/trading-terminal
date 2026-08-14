// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitget, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **ccxt's WS timeframe table is missing `3d` and `1M`.** `watchOHLCV`
 *   builds its channel as `'candle' + safeString(options.timeframes, tf)` with
 *   NO fallback, so an unmapped timeframe subscribes to the literal channel
 *   `candleundefined`. Measured 2026-08-11: `BadRequest … "channel":
 *   "candleundefined" … "code":30016,"msg":"Param error"` — a subscribe that
 *   fails on the wire rather than in code. The native streams `candle3D` and
 *   `candle1M`, so both are added back.
 * - **`timeframes['1M']` is `'1m'` in ccxt's REST describe** — month mapped to
 *   minute. Nothing on the spot path reads that table today (REST candles go
 *   through `options.fetchOHLCV.timeframes.spot`, which is correct), but a
 *   table that silently turns a monthly chart into a minute chart is not
 *   something to leave armed.
 * - **Orderbook depth is a small enum.** `1 | 5 | 15 | 50` map to `books<N>`;
 *   anything else falls back to the full `books` channel. 15 is the native's
 *   `books15`, a 150 ms snapshot cadence that is the right trade for a spot
 *   depth ladder.
 * - **Per-timeframe history caps.** Bitget serves 1000 bars from the recent
 *   endpoint but only 300 for `1d` and 100 for `3d`/`1w`/`1M`, and it exposes a
 *   separate 200-bar history endpoint for older windows. ccxt owns all of that
 *   (`bitget.js:4352-4411`), picking the endpoint by the age of the computed
 *   window — which is strictly better than the native, whose paged reads only
 *   ever hit the recent endpoint.
 * - **Paper trading needs no URL hook at all.** Bitget's `setSandboxMode`
 *   override just sets `options.sandboxMode`, and ccxt's pro class routes
 *   sockets at `urls.api.demo` (`wspap.bitget.com`) on its own whenever that
 *   flag is set — REST paper is a `paptrading: 1` header on the same
 *   `api.bitget.com`, carried on the signed request. So no `applyPaperUrls`
 *   here, deliberately: the venues that DO need one (OKX, ByBit, Gate,
 *   Crypto.com) are repairing a `urls.api` swap Bitget never performs.
 * - App-level ping with ccxt's default 30 s keep-alive and a real `handlePong`,
 *   so the silence budget is 3 × 30 s.
 */

import { isDevProxyAvailable } from '@pairlens/market-engine/platform'
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

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png'

export const BITGET_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bitget',
  displayName: 'Bitget',
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
    '6h',
    '1d',
    '3d',
    '1w',
    '1M',
  ],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const bitgetMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bitget-market-connector',
    name: 'Bitget Market Connector',
    displayName: 'Bitget',
    marketId: 'bitget',
    icon: ICON_URL,
    gradient: 'from-cyan-400 to-teal-500',
    abbr: 'BG',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639322537228-f710d846310a?w=600&q=80',
    trades: true,
  })

/** WS channels ccxt would otherwise build as `candleundefined`. */
const WS_TIMEFRAME_GAPS = { '3d': '3D', '1M': '1M' }

/** Bitget WS orderbook channels — anything else degrades to full `books`. */
export const BITGET_BOOK_DEPTHS = [1, 5, 15, 50] as const

/**
 * `books50` — the deepest snapshot channel Bitget serves.
 *
 * The native's channel was `books15`, and 15 levels is the same starvation
 * Binance shipped with: measured live 2026-08-13 on BTC/USDT, the top bid held
 * 82% of the depth the pane could show, so its cumulative bars sat pinned near
 * full width instead of stepping down a ladder. `books50` brings it back in
 * line with the rest of the fleet. Anything above 50 falls off ccxt's channel
 * table onto the incremental `books` feed, which is a different (and unasked
 * for) sequencing contract.
 */
export const BITGET_DEFAULT_BOOK_DEPTH = 50

/** Snap a requested depth up to the smallest `books<N>` channel covering it. */
export function clampBitgetBookDepth(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return BITGET_DEFAULT_BOOK_DEPTH
  }
  for (const depth of BITGET_BOOK_DEPTHS) {
    if (requested <= depth) return depth
  }
  return BITGET_BOOK_DEPTHS[BITGET_BOOK_DEPTHS.length - 1] as number
}

/**
 * The REST origin ccxt concatenates its `/api/...` paths onto.
 *
 * Resolved per instance build, never at module scope — a module-level const
 * captures the SSR value. `api.bitget.com` sends `Access-Control-Allow-Origin: *`
 * (measured 2026-08-11), so the hosted browser build goes direct; dev still
 * rides the existing `/__bitget` proxy the native uses, which keeps dev-time
 * network behavior identical between the two connectors.
 */
export function resolveBitgetCcxtRestBase(): string {
  return isDevProxyAvailable() ? '/__bitget' : 'https://api.bitget.com'
}

export const bitgetCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'bitget',
  marketId: 'bitget',
  displayName: 'Bitget',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    // Required, unlike the native spec's `false`. Bitget signs every private
    // request with ACCESS-PASSPHRASE and rejects the request without it, so a
    // slot built from two of the three keys can only ever produce auth
    // failures — and `BITGET_ADAPTER_INFO` already tells the user it is
    // mandatory. The native's disagreement between the two lists is a bug, and
    // this is the side that matches the exchange.
    { key: 'passphrase', required: true },
  ],
  defaultMode: 'paper',
  // ccxt gates a base-denominated market buy on a price here (`createMarket-
  // BuyOrderRequiresPrice`) so it can compute the cost to spend; the trading
  // runtime fetches a reference price and passes it through.
  marketBuyRequiresPrice: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/bitget.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    options: {
      // Merged into the pro describe's table by ccxt's deepExtend, not
      // replacing it — only the two missing keys are added.
      timeframes: WS_TIMEFRAME_GAPS,
      // ccxt's REST spot granularity table asks for the UTC-aligned variants
      // (`1Dutc`) for timeframes >= 6h, while the WS candle channels — the
      // pro table above included — are Hong-Kong aligned (`candle1D`): two
      // bar conventions 8 h apart, so the live daily bar could never land on
      // a REST bar. Restore the non-UTC granularities the native used
      // (`TF_TO_REST`), so both transports speak UTC+8. deepExtend merges
      // per key; the sub-6h entries keep ccxt's defaults.
      fetchOHLCV: {
        timeframes: {
          spot: {
            '6h': '6h',
            '12h': '12h',
            '1d': '1day',
            '3d': '3day',
            '1w': '1week',
            '1M': '1M',
          },
        },
      },
    },
  },
  // Repairs `1M → 1m` in the REST describe's top-level table (see header).
  timeframeOverrides: { '1M': '1M' },
  orderbookDepth: BITGET_DEFAULT_BOOK_DEPTH,
  // The books channel's subscribe snapshot is erratic — 0.5 to 1.9 s across
  // otherwise identical switches (measured 2026-08-14). The REST seed caps
  // the first paint at REST latency.
  seedOrderBook: true,
  // Empty-opening trade stream; candles come from watchOHLCV (the 2h fold
  // derives from 1h CANDLES, not the tape) — safe to fill.
  seedTrades: true,
  // The ticker channel's snapshot trails the other channels on quiet pairs
  // (measured 1.5 s worst-case on a switch).
  seedTicker: true,
  // The recent endpoint's ceiling. ccxt clamps further per timeframe and
  // switches to the 200-bar history endpoint for older windows on its own.
  maxHistoryLimit: 1000,
  // ccxt maps `until` onto Bitget's `endTime`, which is inclusive (measured by
  // the native, which subtracts the same millisecond).
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  // App-level ping on ccxt's default 30 s keep-alive, answered by the venue.
  livenessTimeoutMs: 90_000,
  applyUrls: (exchange) => {
    const base = resolveBitgetCcxtRestBase()
    const api = exchange.urls['api'] as Record<string, unknown>
    // Every section is the same origin on Bitget; ccxt appends '/api/...' to
    // whichever one the endpoint belongs to, so they all have to move together.
    for (const key of Object.keys(api)) {
      if (typeof api[key] === 'string') api[key] = base
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

/**
 * The venue serves no 2h interval anywhere — REST or WS — while the chart
 * toolbar offers 2h on every venue. Folded from 1h instead, the same
 * machinery Upbit and Coinbase already ship: history pages read 1h and fold,
 * live bars fold off the venue's own 1h candle stream. The native connector
 * did not have 2h either (its supportedTimeframes omitted it); this closes
 * the toolbar gap rather than reproducing it.
 */
const BITGET_HISTORY_FOLD: Partial<Record<string, Timeframe>> = {
  '2h': '1h',
}

function bitgetLiveSource(timeframe: string): LiveCandleSource {
  return timeframe === '2h'
    ? { kind: 'fold', source: '1h' }
    : { kind: 'passthrough' }
}

export function createBitgetMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const base = createCcxtConnectorPlugin(bitgetCcxtVenue, manifest)
  return withDerivedCandles(base, {
    historyFold: BITGET_HISTORY_FOLD,
    liveSource: bitgetLiveSource,
  })
}
