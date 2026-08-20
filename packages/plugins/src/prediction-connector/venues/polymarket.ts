// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Polymarket's CLOB, backed by ccxt's prediction class.
 *
 * The opposite venue to Kalshi on almost every axis:
 *
 * - **`pro: true`, but no `watchOHLCV`.** Ticker, book and trades stream over
 *   `wss://ws-subscriptions-clob.polymarket.com/ws/market`; candles do not
 *   exist as a channel at all. So candles are seeded from `fetchOHLCV` (which
 *   ccxt buckets client-side out of the price-history tape) and carried forward
 *   by aggregating the trade stream, with a periodic REST reconcile.
 * - **Browser-capable.** gamma, clob and data all answer
 *   `access-control-allow-origin: *` (measured 2026-08-15), and a WS handshake
 *   is CORS-exempt, so nothing here is desktop-gated.
 * - **The socket has no protocol ping.** It needs a text `"PING"` every 10 s
 *   and replies `"PONG"`; ccxt's class already declares that as
 *   `streaming.keepAlive`, and the host's `handleMessage` wrap counts the PONG
 *   as inbound, so the silence watchdog sees a healthy socket rather than a
 *   stalled one.
 * - **Orders are signed by an EOA, not by an API key.** ccxt can authenticate
 *   REST with the L2 triple, but `createOrder` signs an EIP-712 CTF order and
 *   throws without a `privateKey` — so trading here genuinely requires a
 *   wallet, and credentials arrive the way the EVM DEX connectors' do: a
 *   `walletId`, an `address`, and a `getPrivateKey` accessor that reaches the
 *   vault per use. ccxt derives the L2 credentials from the key itself.
 * - **US persons may not trade.** Market data is open worldwide;
 *   `polymarketTradeGeoCheck` refuses order placement from the US with the same
 *   typed error the CEX venues raise, so the region dialog recognises it.
 *
 * Pair keys here are MAPPED, not passthrough: ccxt's handle is
 * `EVENTSLUG_MARKETSLUG:LABEL` and its id form is a 77-digit CLOB token id, so
 * the sanitized key is remembered against the token id rather than recomputed.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { createPredictionConnectorManifest } from '../manifest'
import { createPredictionConnectorPlugin } from '../index'
import type {
  PredictionExchangeCtor,
  PredictionExchangeLike,
  PredictionSlot,
  PredictionVenueConfig,
} from '../types'
import type { UpDownSeriesSpec } from '../crypto-updown'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

// Bundled rather than hotlinked, same as Kalshi: polymarket.com's bot
// protection refuses the image request, so the mark never loaded.
// `bun scripts/fetch-plugin-posters.ts polymarket-market-connector` refreshes.
const ICON_URL = '/posters/polymarket-market-connector.png'

/**
 * ccxt publishes `1m, 5m, 1h, 6h, 1d`. `6h` is not in the app's `Timeframe`
 * union, and widening a shared union for one venue would ripple through every
 * chart control, so it is left out of v1 rather than half-supported.
 */
export const POLYMARKET_TIMEFRAMES = ['1m', '5m', '1h', '1d'] as const

/**
 * Polymarket does not serve US persons for TRADING; its own terms and its geo
 * block say so. Market data stays open — a US user can watch the book and the
 * tape, they just cannot place an order — so this is a trade-time gate and not
 * a `geoCheck`.
 */
export function polymarketTradeGeoCheck(slot: PredictionSlot): void {
  if (slot.country.toUpperCase() === 'US') {
    throw new GeoRestrictedError('Polymarket', slot.country)
  }
}

export const POLYMARKET_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'polymarket',
  displayName: 'Polymarket',
  assetClasses: ['prediction'],
  capabilities: ['read', 'trade'],
  // Wallet-backed: the connect flow provisions a wallet rather than a key
  // pair, so there is no credential form to describe here.
  credentialSchema: [],
  supportedTimeframes: [...POLYMARKET_TIMEFRAMES],
  iconUrl: ICON_URL,
  // The funder is a Polygon address, but the key format, the derivation and
  // the wallet store entry are all plain EVM — which is what this field names.
  walletChain: 'ethereum',
  triggerOrders: false,
}

export const polymarketMarketConnectorManifest: PluginManifest =
  createPredictionConnectorManifest({
    id: 'polymarket-market-connector',
    name: 'Polymarket Market Connector',
    displayName: 'Polymarket',
    description: 'Event contracts on the Polymarket CLOB, settled in USDC',
    marketId: 'polymarket',
    icon: ICON_URL,
    gradient: 'from-indigo-500 to-blue-600',
    abbr: 'PM',
    timeframes: [...POLYMARKET_TIMEFRAMES],
    walletChain: 'ethereum',
    marketOrders: 'native',
  })

/**
 * The events browser's cold open.
 *
 * ccxt's `requireEventQuery` accepts only query/queries/tags/eventId/slug plus
 * whatever a venue declares in `options.eventScopeParams` — and Polymarket
 * declares NONE. So `status`, `sort` and `limit` are not scopes, and an
 * unqueried `fetchEvents` throws `ArgumentsRequired` no matter how it is
 * dressed. There is also no tag that means "everything busy", so a tag-scoped
 * call would be a different browse, not this one.
 *
 * `fetchRawEventsList` IS the venue's trending listing — gamma `/events`
 * ordered by 24 h volume, the same call `fetchMarkets` makes for its own cold
 * start — so the browse goes straight to it and then through ccxt's OWN
 * parsers. Reusing `parseEventToMarkets` / `parseEvent` rather than reading
 * gamma JSON here keeps one definition of the event shape, and registering the
 * parsed markets before `populateOutcomes` leaves ccxt's outcome cache in
 * exactly the state `fetchEvents` would have left it — so the first chart
 * opened from a browse row is a cache hit rather than another round trip.
 */
export async function browsePolymarketEvents(
  exchange: PredictionExchangeLike,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const list = exchange.fetchRawEventsList
  const parseMarkets = exchange.parseEventToMarkets
  const parseEvent = exchange.parseEvent
  if (
    typeof list !== 'function' ||
    typeof parseMarkets !== 'function' ||
    typeof parseEvent !== 'function'
  ) {
    throw new Error('Polymarket does not publish a browsable event listing')
  }

  const raw = await list.call(exchange, {
    limit,
    status: 'active',
    sort: 'volume',
  })
  if (!exchange.markets) {
    exchange.markets = exchange.createSafeDictionary?.() ?? {}
  }
  const events: Array<Record<string, unknown>> = []
  for (const rawEvent of raw) {
    for (const market of parseMarkets.call(exchange, rawEvent)) {
      const handle = market['market']
      if (typeof handle === 'string') exchange.markets[handle] = market
    }
    events.push(parseEvent.call(exchange, rawEvent))
  }
  exchange.populateOutcomes?.()
  return events
}

/**
 * Polymarket's recurring crypto up/down conveyor.
 *
 * Eight series, four assets × two horizons. The slugs are gamma's own and are
 * not derivable from the asset — 'btc' and 'eth' are abbreviated, 'solana' and
 * 'xrp' are not — which is the whole reason the slate is declared.
 *
 * Both horizons settle on Binance, and the venue's rules name the candle
 * rather than a price:
 *
 *  - **Hourly** resolves Up when the CLOSE of the BTC/USDT 1-hour candle
 *    beginning at the titled hour is at or above its OPEN. The open of that
 *    candle is the reference exactly, so a terminal holding the same feed can
 *    state the distance to it without qualification.
 *  - **Daily** compares the 1-MINUTE closes at noon ET on two consecutive
 *    days. The hour that begins at noon ET contains the reference minute but
 *    is not it, so the row is marked inexact and the pane says so.
 */
const POLYMARKET_UPDOWN_SERIES: Array<UpDownSeriesSpec> = (
  [
    ['BTC', 'btc', 'BTC-USDT'],
    ['ETH', 'eth', 'ETH-USDT'],
    ['SOL', 'solana', 'SOL-USDT'],
    ['XRP', 'xrp', 'XRP-USDT'],
  ] as const
).flatMap(([asset, slug, spotPair]) => [
  {
    asset,
    spotPair,
    horizon: 'hourly' as const,
    settlementSource: `Binance ${spotPair.replace('-', '/')}`,
    scope: { series_slug: `${slug}-up-or-down-hourly` },
    windowMs: 60 * 60_000,
    referenceBasis: 'candle-open' as const,
    referenceTimeframe: '1h',
    referenceExact: true,
  },
  {
    asset,
    spotPair,
    horizon: 'daily' as const,
    settlementSource: `Binance ${spotPair.replace('-', '/')}`,
    scope: { series_slug: `${slug}-up-or-down-daily` },
    windowMs: 24 * 60 * 60_000,
    referenceBasis: 'candle-open' as const,
    // The hour containing the venue's one-minute reference. See above.
    referenceTimeframe: '1h',
    referenceExact: false,
  },
])

/**
 * One up/down series, through the venue's own listing endpoint.
 *
 * Same route as the unscoped browse and for the same reason — gamma declares
 * no `eventScopeParams`, so a series is not something `fetchEvents` can be
 * asked for — with `series_slug` riding along in the params gamma forwards
 * verbatim.
 *
 * Ordering stays the listing default (24 h volume) rather than newest. The
 * window that is TRADING is the busiest one by a wide margin, so volume puts
 * it on the first page; ordering by start date would return the furthest-out
 * placeholders and leave the live contract off the board entirely.
 */
export async function fetchPolymarketUpDownSeries(
  exchange: PredictionExchangeLike,
  spec: UpDownSeriesSpec,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const list = exchange.fetchRawEventsList
  const parseMarkets = exchange.parseEventToMarkets
  const parseEvent = exchange.parseEvent
  if (
    typeof list !== 'function' ||
    typeof parseMarkets !== 'function' ||
    typeof parseEvent !== 'function'
  ) {
    return []
  }

  const raw = await list.call(exchange, {
    ...spec.scope,
    limit,
    status: 'active',
  })
  if (!exchange.markets) {
    exchange.markets = exchange.createSafeDictionary?.() ?? {}
  }
  const events: Array<Record<string, unknown>> = []
  for (const rawEvent of raw) {
    for (const market of parseMarkets.call(exchange, rawEvent)) {
      const handle = market['market']
      if (typeof handle === 'string') exchange.markets[handle] = market
    }
    events.push(parseEvent.call(exchange, rawEvent))
  }
  exchange.populateOutcomes?.()
  return events
}

export const polymarketPredictionVenue: PredictionVenueConfig = {
  exchangeId: 'polymarket',
  marketId: 'polymarket',
  displayName: 'Polymarket',
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/prediction/polymarket.js')
    return (module.default ?? module) as unknown as PredictionExchangeCtor
  },
  timeframes: [...POLYMARKET_TIMEFRAMES],
  collateral: 'USDC',
  // No key pair to declare: the slot is built from the wallet provisioning
  // path instead, and a bare `initialize` must therefore create nothing.
  credentialKeys: [],
  walletCredentials: true,
  // No testnet: the CTF contracts ccxt signs against are mainnet Polygon, and
  // there is no `urls.test` on the class to switch to.
  defaultMode: 'live',
  outcomeAddressing: 'mapped',
  streaming: 'watch',
  // A priceless market order takes the outcome's current price as its
  // marketable reference and rides FOK, on both sides.
  marketOrders: 'native',
  tradeGeoCheck: polymarketTradeGeoCheck,
  toCcxtCredentials: (fields) => {
    const privateKey = fields['privateKey'] ?? ''
    const walletAddress = fields['walletAddress'] ?? ''
    // The EOA key is what signs; ccxt derives the L2 API credentials from it
    // on the first authed call (`loadApiCredentials`).
    if (privateKey) {
      return {
        privateKey,
        ...(walletAddress ? { walletAddress } : {}),
      }
    }
    return null
  },
  // No scope selector can express an unqueried browse here, so it goes to the
  // venue's own trending listing instead — see browsePolymarketEvents.
  browseEvents: browsePolymarketEvents,
  cryptoUpDown: {
    series: POLYMARKET_UPDOWN_SERIES,
    fetchSeries: fetchPolymarketUpDownSeries,
  },
  // The book carries hundreds of levels on a liquid outcome; the depth pane
  // renders a fraction of that and the copy cost is per frame.
  orderbookDepth: 50,
  // The class pings every 10 s and the venue answers, so a genuinely silent
  // minute is a stalled socket rather than a quiet market.
  livenessTimeoutMs: 60_000,
}

export function createPolymarketMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createPredictionConnectorPlugin(polymarketPredictionVenue, manifest)
}
