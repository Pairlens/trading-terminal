// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * KuCoin Futures, backed by ccxt Pro's `kucoinfutures`.
 *
 * Venue specifics the runtime has to encode:
 *
 * - **Desktop only.** `api-futures.kucoin.com` sends no
 *   `Access-Control-Allow-Origin` at all (measured 2026-08-15), and there is no
 *   CORS-enabled sibling host to read from. The socket is unreachable from a
 *   browser for a second reason on top: its URL is issued by a REST POST
 *   (`/bullet-public`) that the same block covers. No `devProxy` either: the
 *   spot venue's `/__kucoin-*` prefixes point at `api.kucoin.com`, so browser
 *   dev is refused here exactly like the hosted build.
 * - **No sandbox, so no paper.** ccxt declares `urls.test` as
 *   present-but-undefined, which `enableCcxtSandbox` detects and reports as "no
 *   sandbox here", and the venue publishes no dry-run order param for contracts
 *   the way spot KuCoin does (`test: true` is a SPOT endpoint). A paper
 *   credential is therefore refused with a sentence rather than routed to the
 *   live matching engine — the Polymarket precedent, for the same reason.
 * - **Sizes are integer contracts.** XBTUSDTM is 0.001 BTC per contract, so the
 *   number in the ticket is not a BTC amount and `contractSize` off the markets
 *   table is what converts it. This is exactly why the futures order builder
 *   has no quote-denominated path.
 * - **The 24 h statistics have exactly one source, and it is not the ticker.**
 *   `/contractMarket/ticker` is a last-trade feed (price, size, top of book) and
 *   so is the unified `fetchTicker`, which ccxt routes at
 *   `futuresPublicGetTicker` — neither carries a daily high, low, volume or
 *   change. The shared normalizer floors an absent field at 0, and each frame
 *   REPLACES the snapshot, so left alone this venue reports a fabricated
 *   `+0.00%` and a zero volume forever rather than "unknown". Two things fix
 *   it, both below: the ticker seed is routed at `contracts/{symbol}`, the one
 *   endpoint that publishes the daily stats, and `patchKucoinFuturesTicker`
 *   carries the last known set forward across every stats-less frame after it.
 * - **`priceChgPct` is a FRACTION.** ccxt scales KuCoin's spot `changeRate` by
 *   100 and hands the contract parser's `priceChgPct` straight through
 *   (`kucoin.js` `parseContractTicker`), so an unpatched 24 h change here reads
 *   100× low. Same defect and same repair as the Crypto.com venue patch.
 * - **200 bars per OHLCV call.** `fetchContractOHLCV` hard-caps at 200 and pages
 *   by time, which is a quarter of the spot venue's page.
 * - **`3m` and `6h` are not KuCoin futures intervals** (its swap granularity map
 *   declares them undefined), and `8h`/`12h` are venue-side but absent from the
 *   app's Timeframe union. What is left is the seven below.
 * - **The bullet token, the paging cursor and the negotiate memo** are all
 *   fixed by the SPOT venue's `withKucoinQuirks` subclass, reused verbatim: the
 *   futures class inherits every one of those methods from `pro/kucoin`, so the
 *   defects and the fixes are literally the same code.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { pageEndMs } from '@pairlens/market-engine/candle-paging'
import {
  captureKucoinWsUrls,
  seedKucoinWsUrls,
  withKucoinQuirks,
} from '../../ccxt-connector/venues/kucoin-exchange'
import { createCexFuturesConnectorManifest } from '../manifest'
import { createCcxtFuturesConnectorPlugin } from '../index'
import type {
  CcxtExchangeCtor,
  CcxtExchangeLike,
  CcxtTickerLike,
} from '../../ccxt-connector/types'
import type { CcxtFuturesVenueConfig } from '../futures-types'
import type { Timeframe } from '@pairlens/shared/types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png'

/** The venue's swap granularity map, intersected with the app's union. */
export const KUCOIN_FUTURES_TIMEFRAMES: Array<Timeframe> = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
  '1w',
]

export const KUCOIN_FUTURES_MAX_LEVERAGE = 125

/**
 * Shown instead of routing a paper order to production. Names the reason and
 * the two ways out, because "paper is unavailable" alone reads as a bug.
 */
export const KUCOIN_FUTURES_NO_PAPER =
  'KuCoin Futures has no sandbox environment — switch this credential to live, or paper-trade perpetuals on Binance Futures or Kraken Futures'

/**
 * Raw contract-payload keys that mean "this row carries the daily statistics".
 * Only `contracts/active` and `contracts/{symbol}` publish them; the ticker
 * endpoints and the WS channel publish none of them.
 */
const DAILY_STAT_KEYS = [
  'highPrice',
  'lowPrice',
  'volumeOf24h',
  'turnoverOf24h',
  'priceChg',
  'priceChgPct',
] as const

/** The unified fields a stats-bearing payload owns, and a stats-less one must not. */
const CARRIED_TICKER_FIELDS = [
  'high',
  'low',
  'baseVolume',
  'quoteVolume',
  'change',
  'percentage',
] as const

/**
 * The slice of a ccxt exchange the KuCoin Futures ticker patch overrides.
 *
 * Ambient CLASS rather than a type literal: TypeScript only lets a subclass
 * override a base member declared as a method, and the repo's lint rule forbids
 * method shorthand inside a type. `declare class` is both — a method-bearing
 * shape, and type-position-only, so nothing is emitted.
 */
declare class KucoinFuturesPatchable {
  parseTicker(ticker: unknown, market?: unknown): Record<string, unknown>
}

type KucoinFuturesPatchableCtor = new (
  config: Record<string, unknown>,
) => KucoinFuturesPatchable

/** True when the raw payload actually published a daily statistic. */
function carriesDailyStats(raw: Record<string, unknown>): boolean {
  return DAILY_STAT_KEYS.some(
    (key) => raw[key] !== undefined && raw[key] !== null && raw[key] !== '',
  )
}

/**
 * Scale `priceChgPct` from a fraction to a percent, on the RAW payload.
 *
 * Before `safeTicker` sees it, like the Crypto.com patch and for the same
 * reason: `safeTicker` derives `open` from `last` and `percentage`, so patching
 * the parsed output would fix the number and leave a silently wrong open price
 * behind it. `toPrecision(12)` because `0.0447 * 100` is `4.470000000000001` in
 * binary floating point, and that value would ship into a UI label.
 */
function scaleKucoinFuturesChangeToPercent(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const change = raw['priceChgPct']
  if (change === undefined || change === null || change === '') return raw
  const asNumber = Number(change)
  if (!Number.isFinite(asNumber)) return raw
  const percent = Number.parseFloat((asNumber * 100).toPrecision(12))
  return { ...raw, priceChgPct: String(percent) }
}

/**
 * A KuCoin Futures class whose ticker keeps the venue's 24 h statistics.
 *
 * The stats arrive on ONE endpoint (`contracts/{symbol}`, which the ticker seed
 * below calls) and on nothing else. Every frame after that — the WS
 * `/contractMarket/ticker` channel, a unified `fetchTicker` — is a last-trade
 * payload, and the shared normalizer floors its absent daily fields at 0. So a
 * live perp's watchlist chip would flip from a correct `+2.31%` to a fabricated
 * `+0.00%` on the first print and stay there.
 *
 * The memo is keyed by unified symbol and only ever written from a payload that
 * RAW-carries a statistic, so a genuine zero (a contract that truly moved 0.00%
 * in the window) is stored and carried like any other value — the discriminator
 * is field presence on the wire, never the parsed number. Per instance, so a
 * region rebuild or a reconnect starts clean rather than serving day-old highs.
 */
export function patchKucoinFuturesTicker(
  Base: KucoinFuturesPatchableCtor,
): KucoinFuturesPatchableCtor {
  return class PatchedKucoinFutures extends Base {
    private readonly dailyStats = new Map<string, Record<string, unknown>>()

    override parseTicker(
      ticker: unknown,
      market?: unknown,
    ): Record<string, unknown> {
      if (!ticker || typeof ticker !== 'object') {
        return super.parseTicker(ticker, market)
      }
      const raw = ticker as Record<string, unknown>
      const hasStats = carriesDailyStats(raw)
      const parsed = super.parseTicker(
        hasStats ? scaleKucoinFuturesChangeToPercent(raw) : raw,
        market,
      )
      const symbol = parsed['symbol']
      if (typeof symbol !== 'string' || !symbol) return parsed

      if (hasStats) {
        const remembered: Record<string, unknown> = {}
        for (const field of CARRIED_TICKER_FIELDS) {
          remembered[field] = parsed[field]
        }
        this.dailyStats.set(symbol, remembered)
        return parsed
      }

      const remembered = this.dailyStats.get(symbol)
      if (!remembered) return parsed
      for (const field of CARRIED_TICKER_FIELDS) {
        if (parsed[field] === undefined || parsed[field] === null) {
          parsed[field] = remembered[field]
        }
      }
      return parsed
    }
  }
}

/**
 * Ticker seed routed at `contracts/{symbol}` — the only KuCoin Futures endpoint
 * that publishes the daily high, low, volume and change for one contract.
 *
 * The unified `fetchTicker` the generic seed would call maps to
 * `futuresPublicGetTicker`, which is last-trade only, and `fetchTickers` maps to
 * the whole `contracts/active` list (the multi-hundred-KB markets download) for
 * one row. This is the weight-6 middle. Failure is silent by contract — the
 * stream paints the header either way, just without the daily fields.
 */
export async function fetchKucoinFuturesSeedTicker(
  exchange: CcxtExchangeLike,
  symbol: string,
): Promise<CcxtTickerLike> {
  const host = exchange as unknown as {
    futuresPublicGetContractsSymbol?: (
      params: Record<string, string>,
    ) => Promise<{ data?: Record<string, unknown> }>
    parseTicker?: (ticker: unknown, market?: unknown) => Record<string, unknown>
  }
  if (
    typeof host.futuresPublicGetContractsSymbol !== 'function' ||
    typeof host.parseTicker !== 'function'
  ) {
    throw new Error('kucoinfutures: contracts/{symbol} is not reachable')
  }
  const market = exchange.market(symbol)
  const response = await host.futuresPublicGetContractsSymbol({
    symbol: String(market['id'] ?? ''),
  })
  const row = response.data
  if (!row) throw new Error(`kucoinfutures: no contract detail for ${symbol}`)
  return host.parseTicker(row, market)
}

export const KUCOIN_FUTURES_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'kucoin-futures',
  displayName: 'KuCoin Futures',
  assetClasses: ['crypto-perp'],
  capabilities: ['read', 'trade'],
  requiresDesktop: true,
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
    { key: 'passphrase', label: 'Passphrase', type: 'secret', required: true },
  ],
  supportedTimeframes: [...KUCOIN_FUTURES_TIMEFRAMES],
  iconUrl: ICON_URL,
  triggerOrders: true,
  maxLeverage: KUCOIN_FUTURES_MAX_LEVERAGE,
}

export const kucoinFuturesMarketConnectorManifest: PluginManifest =
  createCexFuturesConnectorManifest({
    id: 'kucoin-futures-market-connector',
    name: 'KuCoin Futures Market Connector',
    displayName: 'KuCoin Futures',
    marketId: 'kucoin-futures',
    icon: ICON_URL,
    gradient: 'from-emerald-500 to-cyan-600',
    abbr: 'KCF',
    timeframes: [...KUCOIN_FUTURES_TIMEFRAMES],
    maxLeverage: KUCOIN_FUTURES_MAX_LEVERAGE,
    // No sandbox at all (see the header). Machine-readable so the terminal
    // never fans a paper-mode credential here and initializes the connector
    // against the PRODUCTION host.
    paperTrading: false,
    requiresDesktop: true,
    triggerOrders: true,
    // The same KuCoin key signs both, provided it carries futures permission.
    credentialAlias: 'kucoin',
    headerImage:
      'https://assets.staticimg.com/cms/media/7feiEEHmJE61RECXMyp8rTcA5Qcsl0zSv6rz9NVjg.png',
  })

export const kucoinFuturesCcxtVenue: CcxtFuturesVenueConfig = {
  exchangeId: 'kucoinfutures',
  marketId: 'kucoin-futures',
  displayName: 'KuCoin Futures',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    { key: 'passphrase', required: true },
  ],
  // Live-only: there is nothing to route a paper order to. The wizard reads
  // this, and `noPaperReason` is what a paper slot is refused with if one is
  // provisioned anyway.
  defaultMode: 'live',
  noPaperReason: KUCOIN_FUTURES_NO_PAPER,
  requiresDesktop: true,
  maxLeverage: KUCOIN_FUTURES_MAX_LEVERAGE,
  loadExchangeClass: async () => {
    const module = await import('ccxt/js/src/pro/kucoinfutures.js')
    const Base = (module.default ?? module) as unknown as CcxtExchangeCtor
    // `pro/kucoinfutures` extends `pro/kucoin`, so it inherits the paging
    // defect, the margin-symbols call and the immortal bullet-URL memo along
    // with everything else — the same subclass fixes all three here. The ticker
    // patch goes on top: it is this venue's alone, and the shared parsers are
    // right for the other thirteen.
    return patchKucoinFuturesTicker(
      withKucoinQuirks(Base) as unknown as KucoinFuturesPatchableCtor,
    ) as unknown as CcxtExchangeCtor
  },
  options: {
    options: {
      // The exchange host defaults every instance to spot. Left alone,
      // `loadMarkets` would fetch the spot symbol list from a futures host and
      // resolve nothing.
      defaultType: 'swap',
      defaultAccountType: 'contract',
      // `fetchTickersFees` is spot-only anyway; naming it keeps the futures
      // load to the single `contracts/active` call.
      fetchMarkets: { types: ['swap'], fetchTickersFees: false },
    },
  },
  // The negotiated bullet URL (a serial REST POST in front of every cold WS
  // connect, valid ~24 h) survives the host's discard-and-rebuild.
  captureOptions: captureKucoinWsUrls,
  seedOptions: seedKucoinWsUrls,
  // 5 | 20 | 50 | 100 or ccxt throws, and the value picks the CHANNEL: 50
  // routes to `/contractMarket/level2Depth50`, which pushes the whole book
  // every frame and needs no REST snapshot to seed.
  orderbookDepth: 50,
  // Full-push channel, so no REST book seed is needed. The tape and the ticker
  // both open empty though: the trade stream sends only new prints, and the
  // ticker channel emits per trade, so a quiet perp's price header would sit
  // on a dash. Candles come from watchOHLCV, never the tape, so the trade seed
  // cannot pollute the forming bar.
  seedTrades: true,
  seedTicker: true,
  // Routed away from the unified fetchTicker, which is last-trade only here —
  // this is the venue's only source of the daily statistics, and the ticker
  // patch keeps them alive across every stats-less frame after it.
  seedTickerFetch: fetchKucoinFuturesSeedTicker,
  // `fetchContractOHLCV` hard-caps at 200 and pages by time.
  maxHistoryLimit: 200,
  // Nudged to strictly-older here and translated into ccxt's `since` argument
  // by `withKucoinQuirks` — KuCoin's own request has no `until`.
  historyPageParams: (endTs) => ({ until: pageEndMs(endTs) }),
  livenessTimeoutMs: 60_000,
  // Eight-hour settlement, and ccxt declares `fetchFundingRates: false` here —
  // the venue answers one contract per call, so the funding matrix asks it only
  // for the contracts it is already showing rather than sweeping the venue.
  fundingIntervalHours: 8,
  geoCheck: (country) => {
    // Diverges from the spot connector on purpose: that one throws a plain
    // Error to preserve pre-ccxt UI behavior, and there is no such history
    // here. A typed refusal is what raises the region dialog.
    if (country.toUpperCase() === 'US') {
      throw new GeoRestrictedError('KuCoin Futures', country)
    }
  },
}

export function createKucoinFuturesMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtFuturesConnectorPlugin(kucoinFuturesCcxtVenue, manifest)
}
