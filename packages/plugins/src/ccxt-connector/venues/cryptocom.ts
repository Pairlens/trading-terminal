// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto.com, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * Venue specifics the bridge has to encode:
 *
 * - **The heartbeat responder is ccxt's, not ours.** Crypto.com sends
 *   `public/heartbeat` every 30 s and closes the socket if
 *   `public/respond-heartbeat` does not come back within a few seconds — the
 *   one venue in the fleet where a missed reply is fatal rather than merely
 *   undetected. ccxt wires it in the message router
 *   (`pro/cryptocom.js:1393 → handlePing → pong`), so the native's hand-rolled
 *   responder is retired rather than ported. That inbound heartbeat is also
 *   what makes the silence watchdog meaningful here: a subscribed socket is
 *   guaranteed traffic every 30 s even on a pair that never prints.
 * - **`fetchOHLCV` always sends `end_ts`.** ccxt defaults the cursor to
 *   `this.microseconds()` when no `until` is given — a value ~1000× larger
 *   than the milliseconds the endpoint documents. Crypto.com clamps it to now
 *   and returns the head of the series (verified live), so the default read
 *   works, but the paged read passes an explicit millisecond `until` and never
 *   relies on that.
 * - **History always reads production.** The native hardcodes `paper = false`
 *   in its candle fetch, so a paper-mode chart still shows the real market
 *   rather than the UAT sandbox's thin synthetic one. Here that falls out of
 *   the design: the read path has no mode and `applyUrls` only ever points at
 *   production. The sandbox is reachable through `applyCryptocomPaperUrls`
 *   when the trading phase needs it.
 * - **Trigger orders go through params, not typed helpers.** ccxt declares
 *   `createTriggerOrder` and `createStopOrder` but NOT `createStopLimitOrder`
 *   or `createStopMarketOrder` for this venue, so TP/SL has to ride
 *   `params.triggerPrice` (+ `params.stopLossPrice`/`takeProfitPrice`) on a
 *   plain `createOrder`. Noted here because the manifest promises
 *   `triggerOrders: true` and the trading phase has to keep that promise.
 * - **Orderbook depth 50**, ccxt's default and the deeper of the two channels
 *   Crypto.com publishes; the native subscribes to `book.<pair>.10`.
 *
 * Two upstream ccxt defects are repaired by a thin subclass (`patchCryptocom`)
 * rather than in the shared parsers, because both are this venue's alone and
 * the shared path is correct for the other thirteen. See that function.
 */

import { isDevProxyAvailable } from '@pairlens/market-engine/platform'
import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/1149.png'

export const CRYPTOCOM_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'cryptocom',
  displayName: 'Crypto.com',
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
  supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1M'],
  iconUrl: ICON_URL,
  triggerOrders: true,
}

export const cryptocomMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'cryptocom-market-connector',
    name: 'Crypto.com Market Connector',
    displayName: 'Crypto.com',
    marketId: 'cryptocom',
    icon: ICON_URL,
    gradient: 'from-blue-700 to-indigo-900',
    abbr: 'CDC',
    tickerSnapshot: true,
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
    trades: true,
  })

/** ccxt's default and the deeper of Crypto.com's two book channels. */
export const CRYPTOCOM_BOOK_DEPTH = 50

/**
 * The slice of a ccxt exchange the Crypto.com patch overrides.
 *
 * Ambient CLASS rather than a type literal on purpose: TypeScript only lets a
 * subclass override a base member that is declared as a method, and the repo's
 * lint rule forbids method shorthand inside a type. A `declare class` is both —
 * a method-bearing shape, and type-position-only, so nothing is emitted.
 */
declare class CryptocomPatchable {
  markets?: Record<string, unknown> | undefined
  parseTicker(ticker: unknown, market?: unknown): Record<string, unknown>
  /** The WS ticker channel has its OWN parser — patching one is half a fix. */
  parseWsTicker(ticker: unknown, market?: unknown): Record<string, unknown>
  fetchTickers(
    symbols?: Array<string>,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>
}

type CryptocomPatchableCtor = new (
  config: Record<string, unknown>,
) => CryptocomPatchable

/**
 * Scale Crypto.com's 24 h change from a fraction to a percent.
 *
 * The `c` field on `public/get-tickers` and the `ticker` channel is a rate
 * (`-0.0161`), and ccxt hands it to `safeTicker` as `percentage` untouched
 * (`cryptocom.js:2361`) — so unified tickers come out 100× too small. Measured
 * live 2026-08-11: BTC/USDT read `-0.0156` against `-1.58` on ByBit and
 * `-1.575` on Bitget for the same minute. The native connector multiplies by
 * 100 (`cryptocom-market-connector/parser.ts:139`); this restores that.
 *
 * The scaling happens on the RAW field, before `safeTicker` sees it, because
 * `safeTicker` derives `open` from `last` and `percentage`: patching the parsed
 * output would fix the percentage and leave a silently wrong open price behind
 * it.
 *
 * `toPrecision(12)` is not cosmetic — `-0.0161 * 100` is
 * `-1.6099999999999999` in binary floating point, and that value would ship
 * into a golden-conformance assertion and a UI label.
 *
 * Scaling is idempotent per payload. Today ccxt's REST and WS ticker parsers
 * are independent, but they are near-duplicates of each other and one upstream
 * de-duplication — `parseWsTicker` delegating to `this.parseTicker` — would put
 * the same object through both overrides and report a 24 h change 100× too
 * LARGE. That failure is as silent as the one being fixed, so the already-
 * scaled payloads are remembered rather than trusted not to come back.
 */
const alreadyScaled = new WeakSet<object>()

export function scaleCryptocomChangeToPercent(ticker: unknown): unknown {
  if (!ticker || typeof ticker !== 'object') return ticker
  if (alreadyScaled.has(ticker)) return ticker
  const raw = ticker as Record<string, unknown>
  const change = raw['c']
  if (change === undefined || change === null || change === '') return ticker
  const asNumber = Number(change)
  if (!Number.isFinite(asNumber)) return ticker
  const percent = Number.parseFloat((asNumber * 100).toPrecision(12))
  const scaled = { ...raw, c: String(percent) }
  alreadyScaled.add(scaled)
  return scaled
}

/**
 * A Crypto.com Pro class with the two venue defects repaired.
 *
 * 1. `parseTicker` under-reports the 24 h change by 100× (above).
 * 2. `fetchTickers` returns all 925 instruments — 343 of them perpetuals. The
 *    bulk snapshot is the app's live LISTING signal, and a perpetual's unified
 *    symbol (`WAL/USD:USD`) loses its settlement suffix on the way to a
 *    Pairlens pair, so it arrives as a plausible-looking `WAL-USD` spot row
 *    and collides with the real one. The native never had the problem because
 *    it filtered on Crypto.com's own `_` spot-id convention. Filtering on the
 *    loaded market's `spot` flag is the same test, done against the market
 *    table instead of a string shape — and it holds on both the cache-hit path
 *    (spot-only table, perps fall through `safeMarket` to a raw id that
 *    resolves to nothing) and the cold path (full 925-row table).
 */
export function patchCryptocom(
  Base: CryptocomPatchableCtor,
): CryptocomPatchableCtor {
  return class PatchedCryptocom extends Base {
    override parseTicker(
      ticker: unknown,
      market?: unknown,
    ): Record<string, unknown> {
      return super.parseTicker(scaleCryptocomChangeToPercent(ticker), market)
    }

    // REST and WS tickers do not share a parser on this venue: `handleTicker`
    // calls `parseWsTicker` (pro/cryptocom.js:594), which repeats the same
    // `percentage: safeString(ticker, 'c')`. Patching only `parseTicker` fixes
    // the bulk snapshot and leaves the live chart header 100× low.
    override parseWsTicker(
      ticker: unknown,
      market?: unknown,
    ): Record<string, unknown> {
      return super.parseWsTicker(scaleCryptocomChangeToPercent(ticker), market)
    }

    override async fetchTickers(
      symbols?: Array<string>,
      params?: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const all = await super.fetchTickers(symbols, params)
      const markets = this.markets
      if (!markets) return all
      const spotOnly: Record<string, unknown> = {}
      for (const [symbol, ticker] of Object.entries(all)) {
        const market = markets[symbol] as Record<string, unknown> | undefined
        if (market?.['spot'] === true) spotOnly[symbol] = ticker
      }
      return spotOnly
    }
  }
}

/**
 * The REST origins ccxt concatenates its paths onto, keyed the way
 * `sign()` reads them (`urls.api[type] + '/' + path`).
 *
 * Resolved per instance build, never at module scope. `api.crypto.com` reflects
 * the request origin (measured 2026-08-11), so the hosted browser build goes
 * direct; dev rides the existing `/__cryptocom` proxy the native uses.
 */
export function resolveCryptocomCcxtRestBases(): Record<string, string> {
  const origin = isDevProxyAvailable()
    ? '/__cryptocom'
    : 'https://api.crypto.com'
  return {
    base: origin,
    v1: `${origin}/exchange/v1`,
    v2: `${origin}/v2`,
  }
}

/**
 * Point an instance at the UAT sandbox for paper trading.
 *
 * Deliberately not called from `applyUrls`: candle history must keep reading
 * production in paper mode (native parity — the sandbox's order book is
 * synthetic and a chart drawn from it is worse than no chart). The trading
 * phase applies this to the instance that carries credentials.
 */
export function applyCryptocomPaperUrls(exchange: {
  urls: Record<string, unknown>
}): void {
  const api = exchange.urls['api'] as Record<string, unknown> | undefined
  if (!api) return
  const origin = isDevProxyAvailable()
    ? '/__cryptocom-sandbox'
    : 'https://uat-api.3ona.co'
  api['base'] = origin
  api['v1'] = `${origin}/exchange/v1`
  api['v2'] = `${origin}/v2`
  api['ws'] = {
    public: 'wss://uat-stream.3ona.co/exchange/v1/market',
    private: 'wss://uat-stream.3ona.co/exchange/v1/user',
  }
}

export const cryptocomCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'cryptocom',
  marketId: 'cryptocom',
  displayName: 'Crypto.com',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'paper',
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/cryptocom.js')
    const Base = (module.default ?? module) as unknown as CryptocomPatchableCtor
    return patchCryptocom(Base) as unknown as CcxtExchangeCtor
  },
  // `2h` is absent from ccxt's table but valid on the wire, and both
  // `fetchOHLCV` and `watchOHLCV` fall back to the raw key — restated so the
  // channel name is a decision rather than a fallthrough. `3d` stays unmapped
  // on purpose: Crypto.com does not serve it, and the native leaves it out too.
  timeframeOverrides: { '2h': '2h' },
  orderbookDepth: CRYPTOCOM_BOOK_DEPTH,
  maxHistoryLimit: 300,
  // ccxt maps `until` onto `end_ts`, which is inclusive.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  // No client ping, but the server heartbeat every 30 s is guaranteed inbound
  // traffic and ccxt answers it: 3 × 30 s.
  livenessTimeoutMs: 90_000,
  applyUrls: (exchange) => {
    const bases = resolveCryptocomCcxtRestBases()
    const api = exchange.urls['api'] as Record<string, unknown>
    for (const [key, value] of Object.entries(bases)) api[key] = value
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

export function createCryptocomMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtConnectorPlugin(cryptocomCcxtVenue, manifest)
}
