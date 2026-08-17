// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kalshi, the CFTC-regulated event exchange, backed by ccxt's prediction class.
 *
 * Four venue facts shape everything in this file:
 *
 * - **`pro: false`.** The class has no `watch*` methods at all, so every
 *   channel is a REST poll. Kalshi's rate limit is 200 ms and its markets move
 *   on human timescales, so a 4–5 s cadence is generous rather than tight.
 * - **Desktop only.** `external-api.kalshi.com` and `api.elections.kalshi.com`
 *   answer 403 to any request carrying a foreign `Origin` header, and the
 *   OPTIONS preflight 403s too (measured 2026-08-15 with curl; a request with
 *   no Origin, which is what the Tauri Rust HTTP client sends, passes). Same
 *   tier as Coinbase, Gate, KuCoin, MEXC and Bitfinex — except that those five
 *   have a `/__*` dev proxy prefix and this venue has none, so it declares no
 *   `devProxy` and browser dev is refused alongside the hosted build.
 * - **Three timeframes.** `period_interval` accepts 1, 60 and 1440 minutes and
 *   400s on anything else, so the manifest advertises `1m`, `1h`, `1d` and the
 *   connector refuses the rest before a request is made.
 * - **RSA, not HMAC.** Signing is RSA-PSS SHA-256 with a PEM private key, and
 *   `secret` is not used at all. The PEM is stored in `apiSecret` (the same
 *   slot Coinbase's PEM uses, so the credential wizard needs no new field
 *   type) and mapped onto ccxt's `privateKey` here.
 * - **No market orders.** Every Kalshi order is a limit order and ccxt throws
 *   `ArgumentsRequired` without a price; immediate execution is an aggressive
 *   limit with an IOC time-in-force. So the venue is declared limit-only and
 *   the ticket is told through `metadata.limitOnly` rather than finding out
 *   from a rejection.
 *
 * Geo posture is deliberately permissive. Kalshi is a US exchange and its
 * `countries` list says so, but it also serves international members through
 * kalshi.com, and a hard refusal outside the US would lock out accounts that
 * work. The venue enforces eligibility at trade time; see `kalshiTradeGeoCheck`.
 */

import { createPredictionConnectorManifest } from '../manifest'
import { createPredictionConnectorPlugin } from '../index'
import type {
  PredictionExchangeCtor,
  PredictionSlot,
  PredictionVenueConfig,
} from '../types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

// Served from the terminal's own bundle, unlike the CEX venues that hotlink a
// CDN mark: kalshi.com resets the TLS handshake on an image request, so every
// surface that showed the venue — picker, Accounts, connect gate — rendered a
// broken image. `bun scripts/fetch-plugin-posters.ts kalshi-market-connector`
// refreshes the file.
const ICON_URL = '/posters/kalshi-market-connector.png'

/** The venue's own OHLCV intervals — 1, 60 and 1440 minutes. Nothing else. */
export const KALSHI_TIMEFRAMES = ['1m', '1h', '1d'] as const

/**
 * A NO outcome is the YES ticker plus this suffix, and `kalshi.fetchOutcome`
 * strips it to resolve the underlying market. Both forms are id-form outcome
 * symbols, which is what lets the pair key be a passthrough.
 */
export const KALSHI_NO_SUFFIX = '-NO'

/**
 * Kalshi's PEM arrives from the credential form with real newlines or with
 * `\n` escapes, depending on how the user copied it out of the dashboard.
 * ccxt's own signer handles the escaped form, but normalising here means the
 * value ccxt is constructed with is the same either way — which matters
 * because a mismatched PEM fails as an opaque signature error.
 */
export function normalizeKalshiPem(raw: string): string {
  return raw.includes('-----BEGIN') ? raw.split('\\n').join('\n') : raw
}

/**
 * Order-time geo gate.
 *
 * Currently allows every region: Kalshi is CFTC-regulated and US-domiciled,
 * but it onboards international members too, and refusing a non-US country
 * here would block credentials that the venue itself accepts. The venue
 * rejects an ineligible account at order time with a message the order pane
 * shows verbatim. Kept as an explicit hook rather than omitted so a future
 * region block is a one-line change with a place to document itself.
 */
export function kalshiTradeGeoCheck(_slot: PredictionSlot): void {
  // Intentionally permissive — see the doc comment above.
}

export const KALSHI_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'kalshi',
  displayName: 'Kalshi',
  assetClasses: ['prediction'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key ID', type: 'text', required: true },
    {
      key: 'apiSecret',
      label: 'RSA Private Key (PEM)',
      type: 'secret',
      required: true,
    },
  ],
  supportedTimeframes: [...KALSHI_TIMEFRAMES],
  iconUrl: ICON_URL,
  triggerOrders: false,
}

export const kalshiMarketConnectorManifest: PluginManifest =
  createPredictionConnectorManifest({
    id: 'kalshi-market-connector',
    name: 'Kalshi Market Connector',
    displayName: 'Kalshi',
    description:
      'Event contracts on Kalshi, the CFTC-regulated prediction exchange',
    marketId: 'kalshi',
    icon: ICON_URL,
    gradient: 'from-teal-500 to-emerald-600',
    abbr: 'KA',
    timeframes: [...KALSHI_TIMEFRAMES],
    requiresDesktop: true,
    limitOnly: true,
    marketOrders: 'none',
  })

export const kalshiPredictionVenue: PredictionVenueConfig = {
  exchangeId: 'kalshi',
  marketId: 'kalshi',
  displayName: 'Kalshi',
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/prediction/kalshi.js')
    return (module.default ?? module) as unknown as PredictionExchangeCtor
  },
  timeframes: [...KALSHI_TIMEFRAMES],
  collateral: 'USD',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  // The demo environment at external-api.demo.kalshi.co is a real second
  // endpoint set (ccxt declares it as `urls.test`), so a paper credential
  // signs against it rather than being simulated.
  defaultMode: 'paper',
  requiresDesktop: true,
  // A raw ticker and `<ticker>-NO` are both id-form outcome symbols ccxt
  // resolves on demand, so nothing has to be remembered between sessions.
  outcomeAddressing: 'passthrough',
  streaming: 'poll',
  // Limit orders only — ccxt's kalshi refuses a priceless order outright.
  marketOrders: 'none',
  tradeGeoCheck: kalshiTradeGeoCheck,
  toCcxtCredentials: (fields) => {
    const apiKey = fields['apiKey'] ?? ''
    const pem = fields['apiSecret'] ?? ''
    if (!apiKey || !pem) return null
    // ccxt's kalshi never reads `secret`; the PEM belongs in `privateKey`.
    return { apiKey, privateKey: normalizeKalshiPem(pem) }
  },
  /**
   * The events browser's cold open.
   *
   * `fetchEvents` refuses an unscoped call, and Kalshi's own scope vocabulary
   * is category and series ticker (declared in its `eventScopeParams`). A
   * category is the closest thing the venue has to "what is busy right now",
   * and Economics is both broad and permanently populated — an empty browse
   * that returned nothing would read as a broken pane.
   */
  defaultEventScope: (limit) => ({ category: 'Economics', limit }),
  /**
   * Four independent polls per open pair, against a 200 ms rate limiter.
   *
   * That is roughly 0.9 requests a second where the limiter allows 5, so the
   * headroom is real and the cadences are chosen for freshness rather than to
   * stay under a ceiling.
   *
   * Folding the ticker into the order-book poll was considered and rejected:
   * a book gives top-of-book and nothing else, while the ticker row carries
   * `last`, `volume24h` and the 24 h change that the price readout, the
   * watchlist and the multi-price pane all render. Deriving a ticker from a
   * book would mean either dropping those or inventing them, and a fabricated
   * 24 h change is a worse outcome than one extra request every four seconds.
   */
  pollIntervals: {
    candles: 5_000,
    ticker: 4_000,
    orderbook: 4_000,
    trades: 5_000,
  },
}

export function createKalshiMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createPredictionConnectorPlugin(kalshiPredictionVenue, manifest)
}
