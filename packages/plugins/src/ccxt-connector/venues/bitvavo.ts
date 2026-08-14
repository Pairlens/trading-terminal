// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo, backed by ccxt Pro.
 *
 * Drop-in for the native connector: same plugin id, same manifest, same
 * exported triple. The quiet one of this group — candles, ticker, book and
 * trades all stream natively, the book is seeded over the socket rather than
 * REST (`pro/bitvavo.js:790` sends a `getBook` action), and every host is
 * CORS-open, so nothing here is desktop-gated.
 *
 * What it does need:
 *
 * - **No `1w`.** The interval list stops at `1d`. Weekly bars are folded from
 *   daily ones — history by chaining REST pages, live by folding the daily
 *   stream into the open week. The terminal offers `1w` on every venue
 *   regardless of what the adapter advertises (`supportedTimeframes` is
 *   hardcoded in `market-data-provider.tsx`), so this is what makes the
 *   timeframe work rather than draw nothing.
 * - **Blocked in the US.** Bitvavo is an Amsterdam exchange under DNB/MiCA and
 *   does not serve US residents, so every capability refuses with a typed
 *   `GeoRestrictedError` — the same gate, and the same message, as the native.
 * - **No ticker snapshot.** The native declares none, so neither does this;
 *   the multi-price pane falls through to another provider for EUR pairs.
 *   (ccxt does implement `fetchTickers` here, so turning it on later is a
 *   one-line manifest change rather than a connector change.)
 * - **Live only.** Bitvavo has no testnet and ccxt has no sandbox for it; the
 *   native simulates paper inside `placeOrder`, which is the trading phase's
 *   problem, not this file's.
 * - No app-level ping and no heartbeat responder, so ccxt cannot see a stalled
 *   socket in a browser at all and the silence watchdog is the only detector.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import { createCexConnectorManifest } from '../../cex-connector'
import { createCcxtConnectorPlugin } from '../index'
import { withDerivedCandles } from '../derived-candle-plugin'
import type { LiveCandleSource } from '../derived-candle-plugin'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type { Timeframe } from '@pairlens/shared/types'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

// bitvavo.com serves a 403 to non-browser clients, so the apex favicon renders
// blank in the venue picker / store card. The account subdomain serves the same
// mark (256px) without the block.
const ICON_URL = 'https://account.bitvavo.com/favicon.ico'

/**
 * Refuse the regions Bitvavo does not serve.
 *
 * Only the US is hard-blocked; everywhere else is allowed to attempt a
 * connection and the exchange enforces its own eligibility at trade time.
 * Kept here rather than imported from the native connector so the ccxt venue
 * modules stand alone once the natives are deleted.
 */
export function assertBitvavoRegionAllowed(country: string): void {
  if (country.toUpperCase() === 'US') {
    throw new GeoRestrictedError('Bitvavo', country)
  }
}

export const BITVAVO_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'bitvavo',
  displayName: 'Bitvavo',
  assetClasses: ['crypto-spot'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
  ],
  // 1w is new: folded from 1d, the venue serves no weekly interval.
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

export const bitvavoMarketConnectorManifest: PluginManifest =
  createCexConnectorManifest({
    id: 'bitvavo-market-connector',
    name: 'Bitvavo Market Connector',
    displayName: 'Bitvavo',
    marketId: 'bitvavo',
    icon: ICON_URL,
    gradient: 'from-blue-500 to-indigo-600',
    abbr: 'BV',
    triggerOrders: true,
    headerImage:
      'https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?w=600&q=80',
    trades: true,
  })

/** Target timeframe → the venue timeframe its history is folded from. */
export const BITVAVO_HISTORY_FOLD: Partial<Record<string, Timeframe>> = {
  '1w': '1d',
}

/** Everything streams natively except the weekly bar, folded from daily. */
export function bitvavoLiveSource(timeframe: string): LiveCandleSource {
  const source = BITVAVO_HISTORY_FOLD[timeframe]
  return source === undefined
    ? { kind: 'passthrough' }
    : { kind: 'fold', source }
}

export const bitvavoCcxtVenue: CcxtVenueConfig = {
  exchangeId: 'bitvavo',
  marketId: 'bitvavo',
  displayName: 'Bitvavo',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  geoCheck: (country) => assertBitvavoRegionAllowed(country),
  // Orders and cancels ride the venue's WS trade API — single static host,
  // already routed by this venue's URL hooks and inside the CSP baseline.
  // See CcxtVenueConfig.wsOrders for why this is per-venue opt-in.
  wsOrders: true,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/bitvavo.js')
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
  // Free-form depth on this venue; the native subscribes the full book.
  orderbookDepth: undefined,
  // Empty-opening trade stream on a venue of mostly quiet EUR pairs — the
  // tape measured 10 s to its first print on BTC-EUR. Candles come from
  // watchOHLCV, so the REST fill is safe.
  seedTrades: true,
  maxHistoryLimit: 1440,
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 120_000,
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

export function createBitvavoMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return withDerivedCandles(
    createCcxtConnectorPlugin(bitvavoCcxtVenue, manifest),
    {
      historyFold: BITVAVO_HISTORY_FOLD,
      liveSource: bitvavoLiveSource,
    },
  )
}
