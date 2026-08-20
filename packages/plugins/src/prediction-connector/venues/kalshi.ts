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

/**
 * Kalshi's recurring crypto up/down conveyor: the fifteen-minute series.
 *
 * Five assets, one window each, a new one every quarter hour. This is the
 * whole of Kalshi's up/down slate and the exclusion is deliberate: the venue's
 * hourly "Directional" series (`KXBTCD`, `KXSOLD`, …) reads like the same
 * product and is not one — it is a strike LADDER, up to three hundred markets
 * on a single question, and the nearest-the-money row of a ladder is not an
 * up/down contract. `classifyUpDown` refuses a multi-market event anyway, so a
 * ladder that slipped into this list would drop out rather than mislead, but
 * it would still cost a request per browse.
 *
 * The target price is published on the market (`floor_strike`, echoed in
 * `yes_sub_title` as "Target Price: $69,506.94"), so these rows need no candle
 * read at all — the reference is exact and comes from the venue. Settlement is
 * the average of the sixty CF Benchmarks RTI prints before the close, measured
 * against the same average before the open.
 */
const KALSHI_UPDOWN_SERIES: Array<UpDownSeriesSpec> = (
  [
    ['BTC', 'KXBTC15M', 'BTC-USDT'],
    ['ETH', 'KXETH15M', 'ETH-USDT'],
    ['SOL', 'KXSOL15M', 'SOL-USDT'],
    ['XRP', 'KXXRP15M', 'XRP-USDT'],
    ['DOGE', 'KXDOGE15M', 'DOGE-USDT'],
  ] as const
).map(([asset, ticker, spotPair]) => ({
  asset,
  // What a terminal QUOTES beside the odds, not what Kalshi settles on: the
  // venue settles on a CF Benchmarks index, which no exchange lists and which
  // tracks this pair to well inside a fifteen-minute range.
  spotPair,
  horizon: '15m' as const,
  settlementSource: 'CF Benchmarks RTI',
  scope: { series_ticker: ticker },
  windowMs: 15 * 60_000,
  // Never reached — the strike is always published — but declared so a series
  // that stopped publishing one degrades to a candle read rather than to a
  // blank column.
  referenceBasis: 'venue' as const,
  referenceExact: true,
}))

/**
 * One up/down series, by series ticker.
 *
 * `status` is deliberately NOT sent. ccxt already asks Kalshi for open events
 * server-side (`defaultEventStatus`), and the same value survives into its
 * client-side `applyEventFetchParams` pass where it is compared against a
 * parsed status the events endpoint never sets — measured 2026-08-20, passing
 * `status: 'open'` turned the one live BTC window into zero rows while the
 * identical call without it returned it.
 */
export async function fetchKalshiUpDownSeries(
  exchange: PredictionExchangeLike,
  spec: UpDownSeriesSpec,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (typeof exchange.fetchEvents !== 'function') return []
  return exchange.fetchEvents({ ...spec.scope, limit })
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

/**
 * The events browser's cold open.
 *
 * `fetchEvents` refuses an unscoped call, and Kalshi's scope vocabulary is
 * category and series ticker (declared in its `eventScopeParams`). The old
 * answer was one hardcoded category, and it was wrong twice over: the Trending
 * board was Economics and nothing else, so every other chip on the rail was
 * invisible until the user searched; and the path itself cost SIXTY requests
 * and 26 seconds, because a category resolves to a /series listing (744 series
 * for Economics, 612 KB) and then one /events page per series until the limit
 * fills. Measured 2026-08-20.
 *
 * What answers instead is Kalshi's own ranked feed: `/v1/search/series` on the
 * elections host, which ccxt already declares (`electionsPublicGetSearchSeries`)
 * and already uses for free-text search. Unqueried it returns events ordered by
 * recent volume, and every entry carries its event ticker, title, subtitle,
 * category and its markets with live prices, the previous price and volume.
 * That is the whole board in one response.
 *
 * It is fanned across categories rather than taken unscoped, and that is the
 * one judgement call here. The unscoped feed is Kalshi's honest front page, and
 * Kalshi's front page is live sport: 71 of the top 100 entries, and 25 of the
 * top 25. A rail built from that reads "Sports" and nothing else, which is the
 * defect this replaced wearing different clothes. So each category is asked for
 * its own busiest events (`?category=`, which the feed supports and which
 * answers in 0.2-0.5 s) and the pages are interleaved. Nothing is invented: the
 * order inside a category is the venue's, and the rounds are ordered by the
 * venue's own `recent_volume`, so the biggest markets still lead.
 *
 * Cost: one request per category, fired together against ccxt's 200 ms
 * throttle, roughly 600 KB and 4 seconds against 1.2 MB and 26.
 */
export const KALSHI_BROWSE_CATEGORIES = [
  'Sports',
  'Elections',
  'Crypto',
  'Economics',
  'Politics',
  'Entertainment',
  'Financials',
  'Climate and Weather',
  'Companies',
  'Commodities',
  'Science and Technology',
  'Mentions',
  'Health',
  'World',
  'Social',
  'Transportation',
] as const

/**
 * Entries asked of each category.
 *
 * The floor is what makes a thin category (Health, Transportation) reach the
 * rail at all; the ceiling keeps a large `limit` from turning sixteen cheap
 * requests into sixteen expensive ones. A crypto entry carries a fifty-strike
 * ladder, so page size and payload are not linearly related.
 */
const MIN_PER_CATEGORY = 2
const MAX_PER_CATEGORY = 10

/** The elections-host search endpoint, which is not on the shared shape. */
type KalshiSearchEndpoint = {
  electionsPublicGetSearchSeries?: (
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
}

export async function browseKalshiEvents(
  exchange: PredictionExchangeLike,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const search = (exchange as PredictionExchangeLike & KalshiSearchEndpoint)
    .electionsPublicGetSearchSeries
  const parseEvent = exchange.parseEvent
  if (typeof search !== 'function' || typeof parseEvent !== 'function') {
    throw new Error('Kalshi does not publish a browsable event listing')
  }

  const pageSize = Math.min(
    MAX_PER_CATEGORY,
    Math.max(
      MIN_PER_CATEGORY,
      Math.ceil(limit / KALSHI_BROWSE_CATEGORIES.length),
    ),
  )

  // Fired together: ccxt's throttle still spaces them 200 ms apart, but they
  // overlap in flight, so the board waits for the slowest category rather than
  // for the sum of sixteen.
  let failure: unknown = null
  const pages = await Promise.all(
    KALSHI_BROWSE_CATEGORIES.map(async (category) => {
      try {
        const response = await search.call(exchange, {
          page_size: pageSize,
          category,
        })
        return asList(response['current_page'])
      } catch (err) {
        // One category that will not answer must not empty the board. The
        // error is kept so a browse where NOTHING answered can still say why.
        failure ??= err
        return []
      }
    }),
  )

  const entries = interleavePages(pages, limit)
  if (entries.length === 0 && failure) throw failure
  return entries.map((entry) =>
    parseEvent.call(exchange, searchEntryToRawEvent(entry)),
  )
}

/**
 * Round-robin across the category pages, busiest first inside each round.
 *
 * Concatenating and sorting by volume instead would drop the tail categories
 * entirely: a live tennis match trades four million contracts a day and a
 * Health event trades a few hundred, so every Health row would fall below the
 * cut. Taking one from each category before taking a second from any is what
 * puts sixteen chips on the rail, and ordering each round by the venue's own
 * `recent_volume` is what keeps the top of the board honest.
 *
 * Exported for the test that pins both properties.
 */
export function interleavePages(
  pages: Array<Array<Record<string, unknown>>>,
  limit: number,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const depth = Math.max(0, ...pages.map((page) => page.length))
  for (let rank = 0; rank < depth && out.length < limit; rank++) {
    const round: Array<Record<string, unknown>> = []
    for (const page of pages) {
      const entry = page[rank]
      if (entry) round.push(entry)
    }
    round.sort((a, b) => recentVolume(b) - recentVolume(a))
    for (const entry of round) {
      if (out.length >= limit) break
      out.push(entry)
    }
  }
  return out
}

/**
 * One search entry, reshaped into the raw Kalshi event `parseEvent` expects.
 *
 * The two payloads describe the same thing in different words, and the
 * translation is the whole adapter: `event_title` for `title`, `close_ts` for
 * `close_time`, `yes_subtitle` for `yes_sub_title`. Prices are the exception
 * and need no translation, because the feed already states them in the
 * `*_dollars` fields `parseMarket` and `marketChange24h` read.
 *
 * Two fields have no source and are left absent rather than guessed:
 * `liquidity_dollars` and `open_interest_fp`, so a browse card states volume
 * and not those. Opening the event fetches it canonically and gets both, along
 * with the resolution criteria.
 *
 * `status` IS synthesised, from `result`: the feed lists tradeable events and
 * states the settlement result as an empty string until one exists, and
 * without a status `parseEvent` reports every browsed event as inactive.
 *
 * Exported for the fixture test, which drives it with entries copied off the
 * live feed.
 */
export function searchEntryToRawEvent(
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const eventTicker = readString(entry['event_ticker'])
  const title = readString(entry['event_title'])
  const markets = asList(entry['markets']).map((market) => {
    const result = readString(market['result'])
    return {
      ticker: readString(market['ticker']),
      event_ticker: eventTicker,
      // The event's question. A Kalshi market on a ladder or a field states
      // the strike in `yes_sub_title`, and the projection appends it, so the
      // row reads "Fed decision in September? · Cut 25bps".
      title,
      yes_sub_title: readString(market['yes_subtitle']),
      no_sub_title: readString(market['no_subtitle']),
      status: result === '' ? 'active' : 'settled',
      result,
      close_time: readString(market['close_ts']),
      open_time: readString(market['open_ts']),
      expiration_time: readString(market['expected_expiration_ts']),
      volume: market['volume'],
      last_price_dollars: market['last_price_dollars'],
      previous_price_dollars: market['previous_price_dollars'],
      yes_bid_dollars: market['yes_bid_dollars'],
      yes_ask_dollars: market['yes_ask_dollars'],
    }
  })
  return {
    event_ticker: eventTicker,
    series_ticker: readString(entry['series_ticker']),
    title,
    sub_title: readString(entry['event_subtitle']),
    category: readString(entry['category']),
    markets,
  }
}

function recentVolume(entry: Record<string, unknown>): number {
  const value = entry['recent_volume']
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

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
  // Kalshi's own ranked feed, fanned across categories — see browseKalshiEvents.
  browseEvents: browseKalshiEvents,
  cryptoUpDown: {
    series: KALSHI_UPDOWN_SERIES,
    fetchSeries: fetchKalshiUpDownSeries,
  },
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
