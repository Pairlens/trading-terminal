// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken Futures, backed by ccxt Pro's `krakenfutures`.
 *
 * A standalone exchange class, not a subclass of spot Kraken: different host,
 * different signing, different API keys. Venue specifics the runtime encodes:
 *
 * - **Desktop only.** `futures.kraken.com` answers the CORS preflight with a
 *   204 carrying allow-credentials/headers/methods but NO
 *   `access-control-allow-origin`, on the preflight and on the GET alike
 *   (measured 2026-08-15), so a browser blocks the response. Note this differs
 *   from spot Kraken, which IS browser-capable — the futures host is a separate
 *   deployment, and the spot `/__kraken` dev proxy does not cover it, so no
 *   `devProxy` is declared and browser dev is refused too.
 * - **Its own credentials.** Futures keys are minted on futures.kraken.com and
 *   the spot account's keys do not sign here, so the manifest carries NO
 *   `credentialAlias` and the connect wizard shows a separate card.
 * - **Paper is a real environment.** `urls.test` points every REST section AND
 *   the socket at `demo-futures.kraken.com`, so `setSandboxMode` alone is
 *   enough — no `applyPaperUrls` fix-up of the kind Crypto.com needs, whose
 *   test table has no `ws` key at all.
 * - **No `watchOHLCV`.** `has.watchOHLCV` is false: the venue streams no candle
 *   channel. Live bars are aggregated from the trade tape through the shared
 *   `withDerivedCandles` decorator, exactly as Coinbase and Upbit do, with REST
 *   history from the charts endpoint underneath. That is also why `seedTrades`
 *   is NOT enabled here: a REST page of historical prints would be re-counted
 *   into the forming bar's volume.
 * - **Two WS ticker defects, both silent, both repaired below.** See
 *   `repairKrakenFuturesWsTicker`.
 * - **REST paging needs an explicit window.** `fetchOHLCV` has no `until`; it
 *   derives `from`/`to` in SECONDS from `since` and `limit`, and its default
 *   (`to = now`) is only right for the unpaged first read. `historyParams`
 *   supplies the window directly, which wins the `extend` on the way to the
 *   request.
 * - **Index rows are not markets.** The venue publishes `IN_XBTUSD`-style
 *   reference series with `index: true`, no book and no order path, and their
 *   `symbol` is the raw id — a pair key built from one would be nonsense. The
 *   shared futures trim drops them (and every inverse `PI_` contract with them,
 *   since v1 is linear-only).
 */

import { timeframeToMs } from '@pairlens/shared'
import { createCexFuturesConnectorManifest } from '../manifest'
import { createCcxtFuturesConnectorPlugin } from '../index'
import { withDerivedCandles } from '../../ccxt-connector/derived-candle-plugin'
import type { LiveCandleSource } from '../../ccxt-connector/derived-candle-plugin'
import type { CcxtExchangeCtor } from '../../ccxt-connector/types'
import type {
  CcxtFuturesExchangeLike,
  CcxtFuturesVenueConfig,
} from '../futures-types'
import type { Timeframe } from '@pairlens/shared/types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL = '/posters/kraken-market-connector.png'

/**
 * The venue's charts intervals, intersected with the app's union. `12h` is
 * served but is not in the union; `2h`, `3d` and `1M` are in the union but the
 * venue does not serve them, and folding them would mean a second machinery
 * layer on top of the trade aggregation this venue already needs.
 */
export const KRAKEN_FUTURES_TIMEFRAMES: Array<Timeframe> = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
]

/** Kraken Futures' own ceiling; the per-contract cap is often lower. */
export const KRAKEN_FUTURES_MAX_LEVERAGE = 50

/** Bars per `fetchOHLCV` call — ccxt clamps its own paging to this. */
const KRAKEN_FUTURES_MAX_HISTORY = 2000

/**
 * Repair the two defects in ccxt's `parseWsTicker` for this venue. Pure, so
 * both are pinned by a unit test rather than by a live socket.
 *
 * 1. **The timestamp never parses.** The parser reads
 *    `parse8601(safeString(ticker, 'lastTime'))`, but the `ticker` feed's field
 *    is `time`, an integer in milliseconds — there is no `lastTime` on the WS
 *    payload at all (that is the REST shape). `parse8601` of undefined is
 *    undefined, so every live ticker arrives stamped `undefined` and the shared
 *    normalizer falls back to `Date.now()`. Not fatal, but it hides genuine
 *    staleness, which is the one thing a timestamp is for.
 * 2. **The 24 h change is a PERCENT in the absolute-change slot.** The feed's
 *    `change` is `-0.771` meaning -0.771%, and the parser assigns it to
 *    `change` with `percentage: undefined`. `safeTicker` then back-derives
 *    `open = close - change`, which for a $28 000 contract is $28 059.27, and
 *    from that a percentage of -0.0027% — three orders of magnitude off, and
 *    silently so, with a wrong open price behind it. Same class of bug as
 *    Crypto.com's fraction-vs-percent (`scaleCryptocomChangeToPercent`),
 *    repaired the same way: at this venue, not in the shared parser, which is
 *    correct for everyone else.
 *
 * The repair runs on ccxt's OUTPUT rather than on the raw payload because
 * `safeTicker` has already consumed the bad field by then; recomputing `change`
 * and `open` from `last` and the true percentage puts all three back in
 * agreement.
 */
export function repairKrakenFuturesWsTicker(
  raw: unknown,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return parsed
  const payload = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...parsed }

  const time = numberOf(payload['time'])
  if (time !== null && time > 0) {
    out['timestamp'] = time
    out['datetime'] = new Date(time).toISOString()
  }

  const percent = numberOf(payload['change'])
  const last = numberOf(parsed['last']) ?? numberOf(parsed['close'])
  if (percent !== null) {
    out['percentage'] = percent
    if (last !== null && last > 0) {
      // toPrecision guards the binary-float artifact a UI label would show.
      const absolute = Number(((last * percent) / 100).toPrecision(12))
      out['change'] = absolute
      out['open'] = Number((last - absolute).toPrecision(12))
    } else {
      // No price to anchor the absolute change to: drop it rather than leave
      // ccxt's percent sitting in the absolute slot.
      out['change'] = undefined
      out['open'] = undefined
    }
  }
  return out
}

/**
 * The slice of the ccxt class the patch overrides.
 *
 * Ambient CLASS rather than a type literal: TypeScript only lets a subclass
 * override a base member declared as a method, and the repo's lint rule forbids
 * method shorthand inside a type. A `declare class` is both, and emits nothing.
 */
declare class KrakenFuturesPatchable {
  parseWsTicker(ticker: unknown, market?: unknown): Record<string, unknown>
}

type KrakenFuturesPatchableCtor = new (
  config: Record<string, unknown>,
) => KrakenFuturesPatchable

/** A Kraken Futures Pro class whose WS tickers carry a time and a percent. */
export function patchKrakenFutures(
  Base: KrakenFuturesPatchableCtor,
): KrakenFuturesPatchableCtor {
  return class PatchedKrakenFutures extends Base {
    override parseWsTicker(
      ticker: unknown,
      market?: unknown,
    ): Record<string, unknown> {
      return repairKrakenFuturesWsTicker(
        ticker,
        super.parseWsTicker(ticker, market),
      )
    }
  }
}

/**
 * The `from`/`to` window Kraken Futures' charts endpoint needs, in SECONDS.
 *
 * `to` is nudged one second earlier because the endpoint returns the bar
 * sitting exactly on the cursor, and one duplicated boundary bar makes a page
 * filter to empty — which the chart latches as "no more history" for the rest
 * of the session. The window is exactly `limit` bars wide: ccxt slices the
 * response to `limit` from the FRONT, so a wider window would drop the newest
 * bars, which are the ones the caller asked for.
 *
 * With no cursor the answer is `{}` — ccxt's own default (`to = now`,
 * `from = to - limit x duration`) is exactly right for an unpaged read.
 */
export function krakenFuturesCandleWindow(
  timeframe: string,
  limit: number,
  endTs?: number,
): Record<string, number> {
  if (endTs === undefined) return {}
  const widthSec = Math.max(
    60,
    Math.round(timeframeToMs(timeframe as Timeframe) / 1000),
  )
  const to = Math.floor(endTs / 1000) - 1
  return { from: to - widthSec * Math.max(1, limit), to }
}

export const KRAKEN_FUTURES_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'kraken-futures',
  displayName: 'Kraken Futures',
  assetClasses: ['crypto-perp'],
  capabilities: ['read', 'trade'],
  requiresDesktop: true,
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
  ],
  supportedTimeframes: [...KRAKEN_FUTURES_TIMEFRAMES],
  iconUrl: ICON_URL,
  triggerOrders: true,
  maxLeverage: KRAKEN_FUTURES_MAX_LEVERAGE,
}

export const krakenFuturesMarketConnectorManifest: PluginManifest =
  createCexFuturesConnectorManifest({
    id: 'kraken-futures-market-connector',
    name: 'Kraken Futures Market Connector',
    displayName: 'Kraken Futures',
    marketId: 'kraken-futures',
    icon: ICON_URL,
    gradient: 'from-purple-500 to-indigo-700',
    abbr: 'KRF',
    timeframes: [...KRAKEN_FUTURES_TIMEFRAMES],
    maxLeverage: KRAKEN_FUTURES_MAX_LEVERAGE,
    requiresDesktop: true,
    triggerOrders: true,
    // No credentialAlias on purpose: futures keys are separate from spot.
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
  })

export const krakenFuturesCcxtVenue: CcxtFuturesVenueConfig = {
  exchangeId: 'krakenfutures',
  marketId: 'kraken-futures',
  displayName: 'Kraken Futures',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  // demo-futures.kraken.com is a real second environment, so a paper credential
  // signs against a genuine matching engine.
  defaultMode: 'paper',
  requiresDesktop: true,
  maxLeverage: KRAKEN_FUTURES_MAX_LEVERAGE,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/krakenfutures.js')
    const Base = (module.default ??
      module) as unknown as KrakenFuturesPatchableCtor
    return patchKrakenFutures(Base) as unknown as CcxtExchangeCtor
  },
  options: {
    // No `ping()` method on the class, so ccxt's keepalive degrades to the
    // runtime's protocol PING: dead in a browser, and under bun it kills a
    // healthy socket. Off — liveness is the hub's inbound-silence watchdog.
    streaming: { keepAlive: 0 },
    options: {
      // The exchange host defaults every instance to spot.
      defaultType: 'swap',
      defaultSubType: 'linear',
    },
  },
  // No trade seed: candles here are FOLDED FROM THE TAPE, so a REST page of
  // historical prints would re-add its volume to the forming bar.
  maxHistoryLimit: KRAKEN_FUTURES_MAX_HISTORY,
  historyParams: ({ timeframe, limit, endTs }) =>
    krakenFuturesCandleWindow(timeframe, limit, endTs),
  // Only market data is inbound traffic (no server heartbeat is subscribed),
  // so the silence budget is generous — a false positive costs one reconnect.
  livenessTimeoutMs: 120_000,
  // Kraken settles funding EVERY HOUR, where the other two settle every eight.
  // ccxt's own row says so (`interval: '1h'`), so this is only the fallback —
  // but it has to be right, because assuming eight hours here would report a
  // Kraken carry at an eighth of its real annualised cost.
  fundingIntervalHours: 1,
  openInterestFallback: krakenFuturesOpenInterest,
}

/**
 * Open interest from the funding payload, because ccxt exposes no
 * `fetchOpenInterest` for this venue.
 *
 * Kraken's `tickers` endpoint carries `openInterest` on every contract and
 * ccxt's `fetchFundingRates` already parses those exact rows — it simply never
 * projects the field onto the unified open-interest structure. Reading it off
 * `info` is one call for the whole venue and no new endpoint.
 *
 * The value leg is `openInterest × markPrice`: Kraken's flagship perps are
 * one-unit-of-base contracts, so the product is the notional in the quote
 * currency. Omitted rather than guessed when either side is missing.
 */
async function krakenFuturesOpenInterest(
  exchange: CcxtFuturesExchangeLike,
  symbols: Array<string>,
): Promise<Array<Record<string, unknown>>> {
  if (!exchange.fetchFundingRates) return []
  const raw = await exchange.fetchFundingRates(symbols)
  const rows =
    raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, Record<string, unknown>>)
      : []
  const wanted = new Set(symbols)
  const out: Array<Record<string, unknown>> = []
  for (const row of rows) {
    const symbol = typeof row['symbol'] === 'string' ? row['symbol'] : ''
    if (!symbol || !wanted.has(symbol)) continue
    const info = (row['info'] ?? {}) as Record<string, unknown>
    const amount = numberOf(info['openInterest'])
    if (amount === null) continue
    const mark = numberOf(row['markPrice'])
    out.push({
      symbol,
      openInterestAmount: amount,
      ...(mark !== null ? { openInterestValue: amount * mark } : {}),
      ...(typeof row['timestamp'] === 'number'
        ? { timestamp: row['timestamp'] }
        : {}),
    })
  }
  return out
}

/** Every declared timeframe is aggregated from the tape — see the header. */
function krakenFuturesLiveSource(): LiveCandleSource {
  return { kind: 'trades' }
}

export function createKrakenFuturesMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const base = createCcxtFuturesConnectorPlugin(
    krakenFuturesCcxtVenue,
    manifest,
  )
  return withDerivedCandles(base, { liveSource: krakenFuturesLiveSource })
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
