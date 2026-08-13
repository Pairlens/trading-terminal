// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit Global, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple.
 *
 * - **`watchOHLCV` is a trap.** `has.watchOHLCV` is true, but the
 *   implementation throws `NotSupported` for every timeframe except `1s`, and
 *   even that resolves a single `[ts,o,h,l,c,v]` row instead of an array. So
 *   candles come off `watchTrades` through the shared aggregator, seeded and
 *   repaired from REST, exactly as on Coinbase.
 * - **Market ids are reversed** — `BTC/USDT` is `USDT-BTC`, quote first. ccxt
 *   handles the real table itself (`parseMarket` splits `quoteId-baseId`), but
 *   the stand-in market this file synthesises for a cold profile has to build
 *   the id the same way round or the first subscribe asks for a pair that does
 *   not exist.
 * - **Markets carry no precision and no limits.** `fetchMarkets` is one call to
 *   `market/all`, which returns `{market, korean_name, english_name}` and
 *   nothing else, so every market comes back with `precision 1e-8` and empty
 *   `limits`. Order-size validation cannot be delegated to ccxt on this venue
 *   — flagged for the trading phase.
 * - **No 2h.** The minutes endpoint takes units of 1/3/5/10/15/30/60/240, so
 *   the terminal's 2h is folded from 1h. Everything else the terminal offers
 *   maps to a real endpoint.
 * - **No trigger orders at all** — no stop, no stop-limit, no stop-market, no
 *   `createTriggerOrder`. The manifest omits `triggerOrders`, matching the
 *   native and the venue.
 * - **ccxt reports the 24 h change as a fraction here**, unlike every other
 *   venue, so the ticker and the bulk snapshot are scaled to percent on the
 *   way out — see `../upbit-change-percent.ts` for the measurement.
 * - **120 s idle disconnect** with no client ping and no heartbeat responder,
 *   which is precisely the case ccxt cannot see in a browser (its ping loop
 *   degrades to `lastPong = now`). The silence budget is set below the venue's
 *   own idle timeout so the bridge reconnects on its own terms.
 * - Regional host, both transports, via `hostname` — see `./upbit-regions`.
 */

import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { withDerivedCandles } from '../derived-candle-plugin'
import { withPercentChange24h } from '../upbit-change-percent'
import { resolveUpbitHost } from './upbit-regions'
import type { LiveCandleSource } from '../derived-candle-plugin'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type { Timeframe } from '@pairlens/shared/types'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/351.png'

export const UPBIT_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'upbit',
  displayName: 'Upbit',
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
  // 2h is new: folded from 1h, the minutes endpoint has no 120-unit.
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
}

export const upbitMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'upbit-market-connector',
    name: 'Upbit Market Connector',
    displayName: 'Upbit Global',
    marketId: 'upbit',
    icon: ICON_URL,
    gradient: 'from-blue-500 to-blue-700',
    abbr: 'UPB',
    tickerSnapshot: true,
    headerImage:
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80',
    trades: true,
  })

/** Target timeframe → the venue timeframe its history is folded from. */
export const UPBIT_HISTORY_FOLD: Partial<Record<string, Timeframe>> = {
  '2h': '1h',
}

/** Every timeframe comes off the trade tape — `watchOHLCV` only does `1s`. */
export function upbitLiveSource(): LiveCandleSource {
  return { kind: 'trades' }
}

export const upbitCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'upbit',
  marketId: 'upbit',
  displayName: 'Upbit',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  // ccxt gates a base-denominated market buy on a price here (`createMarket-
  // BuyOrderRequiresPrice`) so it can compute the cost to spend; the trading
  // runtime fetches a reference price and passes it through.
  marketBuyRequiresPrice: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/upbit.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  // Upbit pushes a full ~15-level book on every tick and ignores the depth
  // argument entirely.
  orderbookDepth: undefined,
  maxHistoryLimit: 200,
  // `to` is the newest candle to return and it is INCLUSIVE, so the cursor is
  // nudged; `olderThan` filters the page regardless. ISO-8601, not epoch.
  historyPageParams: (endTs) => ({
    to: new Date(pageEndMs(endTs)).toISOString(),
  }),
  // Upbit drops a socket that has been idle for 120 s and neither side pings,
  // so the watchdog has to fire first or the reconnect is the venue's choice.
  livenessTimeoutMs: 90_000,
  applyUrls: (exchange, country) => {
    // Covers REST and WS at once: both URL templates carry `{hostname}` and
    // are imploded per request. ccxt's default is the Korean exchange.
    exchange.hostname = resolveUpbitHost(country)
  },
  synthesizeMarket: (pair) => {
    const [base, quote] = pair.split('-')
    if (!base || !quote) return null
    // QUOTE-BASE. 'BTC-USDT' (Pairlens) is 'USDT-BTC' (Upbit).
    const id = `${quote}-${base}`
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

export function createUpbitMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const base = createCcxtConnectorPlugin(upbitCcxtVenue, manifest)
  return withDerivedCandles(withPercentChange24h(base), {
    historyFold: UPBIT_HISTORY_FOLD,
    liveSource: upbitLiveSource,
  })
}
