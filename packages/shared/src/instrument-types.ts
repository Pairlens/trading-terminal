// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type InstrumentCategory =
  | 'layer1'
  | 'defi'
  | 'meme'
  | 'ai'
  | 'gaming'
  | 'infrastructure'

/**
 * Instrument identity is a discriminated union — one arm per asset class the
 * platform targets (CEX spot, CEX derivatives, on-chain tokens, equities,
 * prediction markets). Two rules bind every producer and consumer:
 *
 * 1. **No identity by symbol parsing.** Every row carries the opaque,
 *    connector-resolvable identifiers of its arm (venue-native market id,
 *    chain + contract address, MIC ticker, prediction market id). Nothing in
 *    the discovery layer may derive identity from a `BASE-QUOTE` string —
 *    pair-shaped classes happen to fit that mold; derivatives and prediction
 *    markets do not.
 * 2. **Rows are gated on a serving connector.** Discovery never surfaces an
 *    instrument no active plugin can chart. "Spot-only" is a property of
 *    today's content, not a contract invariant — derivative and prediction
 *    rows ship when a connector serves them, with no schema break.
 */
export type InstrumentKind =
  | 'cex-pair'
  | 'cex-derivative'
  | 'token'
  | 'equity'
  | 'prediction'

type InstrumentCommon = {
  id: string // 'okx:BTC-USDT'
  kind: InstrumentKind
  market: string
  symbol: string // 'BTC-USDT'
  name: string // 'Bitcoin'
  base: string // 'BTC'
  quote: string // 'USDT'
  assetClass: string // 'crypto' | 'stocks' | 'dex'
  categories: Array<InstrumentCategory>
  rank: number
  featured: boolean
}

/** A centralized-exchange spot pair, keyed by its dash-canonical symbol. */
export type CexPairInstrument = InstrumentCommon & {
  kind: 'cex-pair'
}

/**
 * A centralized-exchange derivative. Maps directly onto ccxt's unified
 * `BTC/USDT:USDT` scheme: on one venue "BTC-USDT" can be a spot pair, a
 * linear perp and several dated futures — distinct instruments sharing a
 * ticker. No bundled connector serves these yet; the arm exists so the
 * contract never needs a breaking change to admit them.
 */
export type CexDerivativeInstrument = InstrumentCommon & {
  kind: 'cex-derivative'
  /** Settlement currency, e.g. 'USDT' for a linear perp. */
  settle: string
  contract: 'perp' | 'future'
  linear: boolean
  /** Expiry timestamp in ms for dated futures; absent for perps. */
  expiryMs?: number
}

/**
 * An on-chain token, keyed by `(chain, address)` — never by symbol. There
 * are hundreds of tokens named PEPE; symbol-keyed identity merges a rug with
 * the real token. Selecting a token row pins exactly the address it
 * displayed (see-what-you-trade); liquidity and verification metadata are
 * the vetting a venue listing provides for CEX pairs.
 */
export type TokenInstrument = InstrumentCommon & {
  kind: 'token'
  /** Chain slug: 'solana' | 'ethereum' | 'base' | 'arbitrum' | 'bsc' | 'polygon' | ... */
  chain: string
  /** Contract address / mint on that chain. */
  address: string
  decimals?: number
  liquidityUsd?: number
  volume24hUsd?: number
  verified?: boolean
}

/**
 * An exchange-listed equity. Identified by ticker plus (optionally) MIC or
 * FIGI, which are open identifiers — never ISIN/CUSIP, which are licensed.
 */
export type EquityInstrument = InstrumentCommon & {
  kind: 'equity'
  /** ISO 10383 market identifier code, e.g. 'XNAS'. */
  mic?: string
  figi?: string
}

/**
 * A prediction-market outcome, keyed `venue + marketId + outcome`. Its
 * display name is a question, not a ticker. Deep-search-tier content — these
 * are born and resolved daily.
 */
export type PredictionInstrument = InstrumentCommon & {
  kind: 'prediction'
  predictionMarketId: string
  outcome: string
  /**
   * The market's own short label within its event: 'Gavin Newsom',
   * 'Above 13.5M'. What a ticker slot shows in place of a 100-character
   * routing key. See `shortTitle` on `PredictionMarketSummary`.
   */
  shortTitle?: string
  /** Venue event grouping this market belongs to (Kalshi event ticker, Polymarket event id). */
  eventId?: string
  /** Event headline, when it differs from the market question in `name`. */
  eventTitle?: string
  /** Expected resolution/close timestamp in ms. */
  endMs?: number
  status?: 'open' | 'closed' | 'resolved'
}

export type Instrument =
  | CexPairInstrument
  | CexDerivativeInstrument
  | TokenInstrument
  | EquityInstrument
  | PredictionInstrument

/**
 * The dedupe/merge key for discovery results: identity, never bare symbol.
 * Tokens key by chain+address; everything else keys by kind + the fields
 * that make the instrument unique within its arm. Two assets sharing a
 * ticker are two rows.
 *
 * Deliberately NOT the same as `toInstrumentRef` in `./market-ref`, which
 * looks similar and answers a different question. This key wants maximum
 * discrimination so a merge never fuses two assets: it keeps the MIC, so
 * AAPL on two exchanges stays two rows. A routing ref wants what a connector
 * will actually accept, and a broker resolves a bare ticker itself. Merging
 * them would silently weaken this one.
 */
export function instrumentIdentityKey(inst: Instrument): string {
  switch (inst.kind) {
    case 'token':
      return `token:${inst.chain}:${inst.address.toLowerCase()}`
    case 'cex-derivative':
      return `deriv:${inst.symbol}:${inst.settle}:${inst.contract}:${inst.expiryMs ?? ''}`
    case 'equity':
      return `equity:${inst.symbol}:${inst.mic ?? ''}`
    case 'prediction':
      return `prediction:${inst.market}:${inst.predictionMarketId}:${inst.outcome}`
    case 'cex-pair':
      return `pair:${inst.symbol}`
  }
}

export type InstrumentPage = {
  items: Array<Instrument>
  total: number
  hasMore: boolean
}

// ── Prediction-market event browsing (`market-data:events`) ───────────
//
// The typed payload of the `market-data:events` capability. Prediction
// connectors serve their venue's event hierarchy for browsing surfaces; the
// leaf outcomes carry the same pair keys the connector's streaming and
// trading capabilities accept, so a browser row can pivot straight into a
// chart or an order ticket without symbol parsing.

export type PredictionOutcomeSummary = {
  /** Route-safe pair key the serving connector resolves (see rule 1 above). */
  pairKey: string
  /** Outcome display label, e.g. 'Yes' / 'No' / a candidate name. */
  label: string
  /** Last/mark probability price in collateral units (0..1). */
  price?: number
  bid?: number
  ask?: number
  /**
   * Probability moved over the last 24h, signed FOR THIS OUTCOME, in
   * collateral units (0.07 is "up seven points"). Absent when the venue does
   * not publish it or the payload cannot attribute it to one side.
   *
   * Both venues state the move on the market rather than the outcome
   * (Polymarket's `oneDayPriceChange`, Kalshi's `previous_price_dollars`), and
   * both state it from the YES side, so a complement outcome carries the
   * negation. A market with more than two outcomes gets nothing rather than a
   * guess.
   */
  change24h?: number
}

export type PredictionMarketSummary = {
  /** Venue-native market id (Kalshi ticker, Polymarket condition id). */
  id: string
  /** The market question. */
  title: string
  /**
   * The market's short label within its event, when the venue publishes one:
   * Polymarket's `groupItemTitle` ('Gavin Newsom'), Kalshi's `yes_sub_title`
   * ('Above 13.5M'). It is the one field that separates siblings of a
   * categorical event without repeating the question, which is what makes it
   * the right thing to show wherever a ticker used to go.
   */
  shortTitle?: string
  /** Per-market artwork, when the venue publishes one (Polymarket icons). */
  imageUrl?: string
  /**
   * The venue's own resolution criteria, verbatim (Kalshi `rules_primary` plus
   * `rules_secondary`, Polymarket the market `description`). Prose, not a URL:
   * neither venue publishes one, and a header that had to choose between
   * linking nowhere and stating the rules states them.
   */
  rules?: string
  outcomes: Array<PredictionOutcomeSummary>
  volume?: number
  liquidity?: number
  openInterest?: number
  /** Expected resolution/close timestamp in ms. */
  endMs?: number
  status?: 'open' | 'closed' | 'resolved'
}

export type PredictionEventSummary = {
  /** Venue-native event id (Kalshi event ticker, Polymarket event id/slug). */
  id: string
  /** The connector's marketId ('kalshi', 'polymarket'). */
  market: string
  title: string
  category?: string
  imageUrl?: string
  markets: Array<PredictionMarketSummary>
  volume?: number
  liquidity?: number
  endMs?: number
}

/** Params accepted by `market-data:events` execute calls. */
export type PredictionEventsQuery = {
  /** Free-text search; venue-required when no category is given. */
  query?: string
  category?: string
  limit?: number
  cursor?: string
}

export type PredictionEventsResponse = {
  market: string
  events: Array<PredictionEventSummary>
  cursor?: string
  ts: number
}

// ── Instruments index snapshot (App Server → terminal) ────────────────
//
// The server-built discovery snapshot: which venues list which pairs, the
// top-token slice, and the equity universe. Normalization rules are part of
// this contract (the server repo cannot import packages/plugins, so this
// comment is the only thing preventing drift against the client's
// trimMarkets):
//
// - `symbol` is dash-canonical `BASE-QUOTE`, uppercase, derived from ccxt's
//   unified symbol with '/' → '-'. Spot, active markets only in schema v1.
// - Venue ids are the client's marketIds ('binance', 'okx', ...), and the
//   per-venue value is the VENUE-NATIVE market id (ccxt `market.id`), so a
//   row resolves against the client's own tables without symbol parsing.
// - Region-neutral semantics: a row asserts "venue lists this pair", never
//   "you can reach it". The client's geo gate stays authoritative, which is
//   why every payload carries per-venue sweep health.
// - Snapshot absence is "unknown", never "not listed". Only a venue that
//   published a live listing may ground a negative claim.
export const INSTRUMENTS_INDEX_SCHEMA_VERSION = 1

export type VenueSweepStatus = 'ok' | 'geo-blocked' | 'error'

export type VenueSweepHealth = {
  venue: string
  /** Epoch ms of the last successful sweep for this venue. */
  sweptAt: number
  status: VenueSweepStatus
  /** Listing rows the last good sweep produced. */
  rows: number
}

export type SnapshotPairRow = {
  /** Dash-canonical 'BASE-QUOTE'. */
  symbol: string
  base: string
  quote: string
  /** venue marketId → venue-native market id. */
  venues: Record<string, string>
}

export type SnapshotTokenRow = {
  chain: string
  address: string
  symbol: string
  name: string
  decimals?: number
  liquidityUsd?: number
  volume24hUsd?: number
  verified?: boolean
}

export type SnapshotEquityRow = {
  symbol: string
  name: string
  mic?: string
}

export type InstrumentsIndexSnapshot = {
  schemaVersion: number
  /** Epoch ms the blob was compiled. */
  builtAt: number
  /** ccxt version the sweeper ran — pinned to the client's (4.5.71). */
  ccxtVersion: string
  venues: Array<VenueSweepHealth>
  pairs: Array<SnapshotPairRow>
  tokens: Array<SnapshotTokenRow>
  equities: Array<SnapshotEquityRow>
}

/**
 * Served at GET /api/instruments/index — the mutable entry point that names
 * the current immutable blob URL (long max-age, CDN-cacheable).
 */
export type InstrumentsIndexMeta = {
  schemaVersion: number
  hash: string
  /** Server-relative URL of the immutable snapshot blob. */
  url: string
  builtAt: number
  bytes: number
}

/** Response of GET /api/instruments/search — the deep-search endpoint. */
export type DeepSearchResponse = {
  schemaVersion: number
  query: string
  items: Array<Instrument>
  /**
   * Venue qualification for cex-pair items, carried out-of-band so the
   * identity types stay pure: symbol → (venue marketId → venue-native id).
   */
  listings?: Record<string, Record<string, string>>
}

export type TopCoin = {
  rank: number
  symbol: string // 'BTC'
  name: string // 'Bitcoin'
  slug: string // 'bitcoin'
  price: number // USD
  marketCap: number
  volume24h: number
  percentChange1h: number
  percentChange24h: number
  percentChange7d: number
  logoUrl: string | null
}

export type TopCoinsResponse = {
  coins: Array<TopCoin>
  updatedAt: string // ISO timestamp of last CMC fetch
}

/** One pair's quote in a bulk `market-data:ticker-snapshot` response. */
export type BulkTickerEntry = {
  /** Canonical 'BASE-QUOTE', e.g. 'BTC-USDT'. */
  symbol: string
  price: number
  /** 24h change in percent. */
  change24h: number
}

/** Payload of the `market-data:ticker-snapshot` capability — every spot
 * pair a venue lists, from one public REST call. */
export type BulkTickersResponse = {
  market: string
  tickers: Array<BulkTickerEntry>
  ts: number
}

export type HeatmapItem = {
  symbol: string
  name: string
  price: number
  marketCap: number
  volume24h: number
  percentChange1h: number
  percentChange24h: number
  percentChange7d: number
  logoUrl: string | null
}

export type HeatmapResponse = {
  items: Array<HeatmapItem>
  updatedAt: string
}

export type NewsTopic = {
  topic: string
  relevanceScore: number
}

export type NewsTickerSentiment = {
  ticker: string
  relevanceScore: number
  sentimentScore: number
  sentimentLabel: string
}

export type NewsArticle = {
  title: string
  url: string
  timePublished: string // ISO
  authors: Array<string>
  summary: string
  bannerImage: string | null
  source: string
  sourceDomain: string
  topics: Array<NewsTopic>
  overallSentimentScore: number
  overallSentimentLabel: string
  tickerSentiment: Array<NewsTickerSentiment>
}

export type NewsFeedParams = {
  tickers?: string
  topics?: string
  sort?: 'LATEST' | 'EARLIEST' | 'RELEVANCE'
  limit?: number
  timeFrom?: string
  timeTo?: string
}

export type NewsFeedResponse = {
  articles: Array<NewsArticle>
  fetchedAt: string
}

/**
 * Why the feed could not be served. An empty `articles` array means the
 * provider answered and had nothing to match; these mean it never answered
 * usefully at all, which is a different thing to tell the user.
 */
export type NewsUnavailableReason =
  | 'not_configured' // this server has no news provider key
  | 'rate_limited' // the provider is refusing us for now
  | 'upstream_error' // the provider errored, or answered with something unusable

/** Error body served with a 5xx when the news provider fails us. */
export type NewsUnavailableResponse = {
  error: 'news_unavailable'
  reason: NewsUnavailableReason
  fetchedAt: string
}

export type TickerOverview = {
  // -- Common fields (populated for all asset classes) --
  ticker: string
  name: string
  description: string | null
  homepageUrl: string | null
  market: string // 'crypto' | 'stocks'
  currencyName: string
  active: boolean
  type: string | null
  marketCap: number | null
  iconUrl: string | null
  logoUrl: string | null

  // -- Stock-specific (null for crypto) --
  primaryExchange: string | null
  sicCode: string | null
  sicDescription: string | null
  totalEmployees: number | null
  listDate: string | null
  sharesOutstanding: number | null

  // -- Crypto-specific (null for stocks) --
  tags: Array<string> | null
  dateLaunched: string | null
  urls: {
    website: Array<string>
    twitter: Array<string>
    reddit: Array<string>
    sourceCode: Array<string>
    explorer: Array<string>
  } | null

  // -- Raw API results for future use --
  raw: Record<string, unknown>
}

export type TickerOverviewResponse = {
  overview: TickerOverview | null
  fetchedAt: string
}

export type FearGreedDataPoint = {
  value: number
  valueClassification: string
  timestamp: string
}

export type FearGreedResponse = {
  latest: FearGreedDataPoint
  historical: Array<FearGreedDataPoint>
  fetchedAt: string
}

// ── Equity fundamentals and the earnings calendar ─────────────────────
//
// What the App Server serves the equities Company and Earnings panes from its
// fundamentals provider. Two routes, two caches: `/api/company-overview`
// answers for one symbol (and carries that symbol's next scheduled report so
// the pane needs a single round trip), `/api/earnings-calendar` answers for a
// window of the whole market.
//
// Every figure is nullable, and absent means "the provider published nothing"
// rather than zero. The provider states missing numbers as the strings 'None'
// and '-', so a parser that coerced them would turn an unpublished P/E into a
// company that earns nothing. Panes collapse a null cell instead of printing a
// dash grid.
//
// Ratios and rates travel as FRACTIONS, matching the rest of this file: 0.259
// is a 25.9% margin, so no consumer has to guess the scale.

/** Analyst opinion counts, as many buckets as the provider published. */
export type CompanyAnalystRatings = {
  strongBuy: number | null
  buy: number | null
  hold: number | null
  sell: number | null
  strongSell: number | null
}

/**
 * One listed company as its fundamentals provider describes it.
 *
 * `sector` and `industry` are verbatim provider labels, which arrive shouting
 * ('TECHNOLOGY'): the wire keeps what the provider said and the pane does the
 * casing, because a server that title-cased everything would also rewrite
 * 'NVIDIA CORP' into something no ticker page shows.
 *
 * `sharesOutstanding` is the share count, NOT free float. No provider here
 * publishes float or short interest, and a pane must label it as what it is.
 */
export type CompanyFundamentals = {
  /** Bare ticker, uppercase, as the equity instrument carries it. */
  symbol: string
  name: string | null
  exchange: string | null
  sector: string | null
  industry: string | null
  /** Reporting currency of every money figure below, ISO 4217. */
  currency: string | null

  // Valuation
  marketCap: number | null
  peRatio: number | null
  /** P/E on the street's forward estimate, where the provider carries one. */
  forwardPe: number | null
  pegRatio: number | null
  epsTtm: number | null
  ebitda: number | null
  revenueTtm: number | null

  // Growth, year over year on the most recently reported quarter
  revenueGrowthYoy: number | null
  earningsGrowthYoy: number | null

  // Margins and returns
  profitMargin: number | null
  operatingMargin: number | null
  returnOnEquity: number | null

  // Distribution, risk, range
  dividendYield: number | null
  beta: number | null
  week52High: number | null
  week52Low: number | null
  sharesOutstanding: number | null

  // Analyst context
  analystTargetPrice: number | null
  /** Null when the provider published no ratings at all. */
  analystRatings: CompanyAnalystRatings | null
}

/**
 * One scheduled earnings report.
 *
 * There is no before-the-bell / after-the-close field, deliberately: the
 * provider's calendar publishes a date and no time. Inventing a slot would
 * invent the one detail a trader acts on, so the pane groups by date and says
 * nothing about the bell.
 */
export type EarningsCalendarEntry = {
  /** Bare ticker, uppercase. */
  symbol: string
  name: string | null
  /** Report date in the exchange's own calendar, ISO 'YYYY-MM-DD'. */
  reportDate: string
  /** Fiscal period end being reported, ISO 'YYYY-MM-DD'. */
  fiscalDateEnding: string | null
  /** Consensus EPS in `currency`; null when no estimate was published. */
  epsEstimate: number | null
  currency: string | null
}

/** `/api/company-overview?symbol=NVDA` */
export type CompanyOverviewResponse = {
  /** Null when the provider covers no such symbol. */
  fundamentals: CompanyFundamentals | null
  /** The symbol's next report on or after today, when the calendar has one. */
  nextEarnings: EarningsCalendarEntry | null
  fetchedAt: string
}

/** `/api/earnings-calendar?days=7&symbols=NVDA,AAPL` */
export type EarningsCalendarResponse = {
  /** Ascending by report date, then symbol. */
  entries: Array<EarningsCalendarEntry>
  /** Window covered, inclusive, ISO 'YYYY-MM-DD'. */
  start: string
  end: string
  fetchedAt: string
}

/**
 * Why fundamentals or the calendar could not be served. Same three reasons the
 * news feed uses, for the same reason: an empty window is a fact about the
 * calendar, and these are facts about the provider, which is a different thing
 * to tell the user.
 */
export type EquityFundamentalsUnavailableReason =
  | 'not_configured' // this server has no fundamentals provider key
  | 'rate_limited' // the provider is refusing us for now
  | 'upstream_error' // the provider errored, or answered with something unusable

/** Error body served with a 5xx when the fundamentals provider fails us. */
export type EquityFundamentalsUnavailableResponse = {
  error: 'company_overview_unavailable' | 'earnings_calendar_unavailable'
  reason: EquityFundamentalsUnavailableReason
  fetchedAt: string
}

// ── Trading-day clock and calendar (`market-data:session`) ────────────
//
// What a broker connector answers when a surface asks where the trading day
// is. Every instant is epoch milliseconds: venues publish a local wall clock
// ('09:30') against their own timezone, and a wire format that passed that
// through would make every consumer redo the conversion — badly, on the days
// that matter. `timeZone` rides along anyway, because a pane still has to
// LABEL those instants in exchange time.
//
// The rule that makes this worth a capability: a half day is a shorter
// `closeMs` and a holiday is an ABSENT date, never a flag either way. Nothing
// downstream is allowed to assume 09:30 to 16:00.

export type MarketSessionClock = {
  /** The venue's own clock at the moment of the read. */
  nowMs: number
  /** Regular trading hours only — pre-market and after-hours are not "open". */
  isOpen: boolean
  nextOpenMs: number | null
  nextCloseMs: number | null
  /** IANA zone the venue schedules its sessions in, e.g. 'America/New_York'. */
  timeZone: string
}

export type MarketSessionDay = {
  /** Session date in the venue's own timezone, ISO 'YYYY-MM-DD'. */
  date: string
  /** Regular trading hours. */
  openMs: number
  closeMs: number
  /** Extended-hours bounds, where the venue publishes them. */
  preOpenMs?: number
  postCloseMs?: number
}

export type MarketSessionCalendar = {
  timeZone: string
  /** Trading days only, ascending. A holiday is a missing entry. */
  days: Array<MarketSessionDay>
}

// ── Perpetual futures: funding and open interest ────────────────────────
// Wire shapes for `market-data:funding`, served by the ccxt futures bridge and
// read by the funding matrix, basis monitor, OI leaders, extremes rail and the
// funding belt. Public data: no credential ever travels with these calls.

/** Params accepted by `market-data:funding` execute calls. */
export type FundingQuery =
  /** Every contract the venue publishes a rate for, or just the named pairs. */
  | { action: 'funding-rates'; pairs?: Array<string>; limit?: number }
  /**
   * Open interest for the named pairs. Bounded on purpose: two of the three
   * venues answer one symbol per REST call, so an unbounded sweep is hundreds
   * of requests. `history` additionally asks for the trailing 24h change,
   * which costs a second call per symbol and is skipped where the venue
   * publishes no OI series.
   */
  | { action: 'open-interest'; pairs: Array<string>; history?: boolean }
  /** Settled rates for one contract, newest last. */
  | { action: 'funding-history'; pair: string; limit?: number }

/**
 * One contract's current funding, as the venue publishes it right now.
 *
 * `fundingRate` is the rate for ONE interval, as a fraction (0.0001 = 0.01%),
 * signed the way every perp venue signs it: positive means longs pay shorts.
 * Annualising it needs the interval, which is why `intervalHours` is not
 * optional — a rate without its period is a number nobody can compare across
 * venues (Kraken settles hourly, Binance and KuCoin every eight hours, and a
 * handful of Binance contracts every four). `intervalKnown` says whether the
 * venue stated it or the connector fell back to the venue's ordinary period,
 * so a surface that cares can mark the estimate.
 */
export type FundingRateEntry = {
  /** Three-segment perp pair key, e.g. 'BTC-USDT-USDT'. */
  pair: string
  base: string
  quote: string
  fundingRate: number
  intervalHours: number
  intervalKnown: boolean
  /** Epoch ms of the next settlement, where the venue publishes one. */
  nextFundingMs?: number
  markPrice?: number
  indexPrice?: number
  /** The venue's own forecast for the next stamp, where it publishes one. */
  predictedRate?: number
  /** Epoch ms the venue stamped the row. */
  ts?: number
}

export type FundingSnapshotResponse = {
  /** The connector's marketId ('binance-futures', 'kraken-futures'). */
  market: string
  entries: Array<FundingRateEntry>
  ts: number
}

export type OpenInterestEntry = {
  pair: string
  base: string
  /** Open contracts, in the venue's own contract units. */
  amount?: number
  /**
   * Base-asset size of one contract, so a contract count can be priced. Not 1
   * everywhere: KuCoin's XBTUSDTM is 0.001 BTC, and ignoring that overstates
   * open interest a thousandfold.
   */
  contractSize?: number
  /** Open interest in the settle currency, where the venue prices it. */
  value?: number
  /** Trailing 24h change as a fraction; absent when no series was served. */
  change24h?: number
  ts?: number
}

export type OpenInterestResponse = {
  market: string
  entries: Array<OpenInterestEntry>
  /**
   * False when the venue publishes no open interest at all (Kraken Futures
   * through ccxt), so a pane can say that rather than render an empty list
   * that reads as "no positions anywhere".
   */
  supported: boolean
  ts: number
}

/** One settled funding stamp. */
export type FundingHistoryPoint = { ts: number; rate: number }

export type FundingHistoryResponse = {
  market: string
  pair: string
  /** Ascending by time, oldest first. */
  points: Array<FundingHistoryPoint>
  intervalHours: number
  ts: number
}

// ── DEX pool reads (`market-data:pool-stats`) ───────────────────────────────
// What an AMM pool actually publishes, as the DEX data providers report it.
// One capability with an `action` param serves four reads (stats, trades,
// pools, networks) because they come from one provider and one budget; the
// terminal hooks in `hooks/use-pool-*.ts` are the only consumers.
//
// EVERY figure a provider does not publish is `null` rather than zero or a
// guess. Pool depth is the reason: GeckoTerminal reports value locked in USD
// and nothing per side, DexPaprika reports both sides, and a pane that filled
// the gap by halving the USD figure would be inventing a constant-product
// pool that a concentrated-liquidity venue is not.

/** Which pool read an execute call is asking for. */
export type PoolStatsAction = 'stats' | 'trades' | 'pools' | 'networks'

/** Buy/sell counts over a window, as the provider reports them. */
export type PoolTradeCounts = {
  buys: number
  sells: number
  buyers: number | null
  sellers: number | null
}

/** One AMM pool, resolved for a pair. Nulls are "not published", never zero. */
export type PoolStats = {
  /** Provider network slug (`solana`, `eth`, `base`, …). */
  network: string
  /** Pool address / id on that network. */
  address: string
  /** The pool's own label, e.g. `SOL / USDC 0.04%`. */
  name: string
  dexName: string
  baseSymbol: string | null
  quoteSymbol: string | null
  /** Base token price in USD. */
  priceUsd: number | null
  /** Quote token price in USD — what converts a USD size into quote units. */
  quotePriceUsd: number | null
  /** Base price denominated in the quote token. */
  priceInQuote: number | null
  change1hPct: number | null
  change24hPct: number | null
  volume1hUsd: number | null
  volume24hUsd: number | null
  /** Value locked, both sides, in USD. */
  reserveUsd: number | null
  /** Base-side reserve in token units. Only where the provider publishes it. */
  baseReserve: number | null
  quoteReserve: number | null
  /** Fee tier as a fraction (0.0004 = 4 bps), from the venue or the pool name. */
  feeTier: number | null
  trades24h: PoolTradeCounts | null
  /** 24h buy/sell notionals — DexPaprika publishes these, GeckoTerminal does not. */
  buyVolume24hUsd: number | null
  sellVolume24hUsd: number | null
  /** ISO timestamp the pool was created. */
  createdAt: string | null
  fdvUsd: number | null
  source: PoolStatsSource
}

/**
 * Which provider a pool read came from.
 *
 * Three, not two, and the third one is why the browser has reserves at all:
 * DexScreener publishes `liquidity.base` / `liquidity.quote` with an open CORS
 * header, where DexPaprika publishes the same numbers behind none. It answers
 * pool state and nothing else, so it appears in `PoolStats.source` and not in
 * the listing or chain-aggregate sources below.
 */
export type PoolStatsSource = 'geckoterminal' | 'dexpaprika' | 'dexscreener'

/** One confirmed swap through a pool. `side` is the aggressor on the base leg. */
export type PoolTrade = {
  id: string
  ts: number
  side: 'buy' | 'sell'
  amountUsd: number
  /** Base token price in USD at the swap. */
  priceUsd: number | null
  baseAmount: number | null
  quoteAmount: number | null
  /** Signer of the transaction, unlabelled — a raw address, never a name. */
  wallet: string | null
  txHash: string | null
  blockNumber: number | null
}

/** A pool row in a network's ranked listing. */
export type PoolListingEntry = {
  network: string
  address: string
  name: string
  dexName: string
  priceUsd: number | null
  change24hPct: number | null
  volume24hUsd: number | null
  reserveUsd: number | null
  baseSymbol: string | null
  quoteSymbol: string | null
  /** Base token address, so a row can open the pair by identity, not by symbol. */
  baseAddress: string | null
}

export type PoolListingResponse = {
  network: string
  pools: Array<PoolListingEntry>
  source: 'geckoterminal' | 'dexpaprika'
}

/**
 * A network's activity, and HOW MUCH of the network it covers.
 *
 * `coverage` is not decoration. DexPaprika publishes chain-wide totals;
 * GeckoTerminal publishes no network endpoint at all, so the same numbers can
 * only be summed over the pools that were sampled. Labelling a top-20 sum as
 * "Ethereum's 24h volume" would be off by an order of magnitude, so the pane
 * says which one it is showing.
 */
export type ChainPoolStats = {
  /** The provider's own network slug (`eth`, `polygon_pos`, `solana`). */
  network: string
  /**
   * The Pairlens market id this row answers for, echoed back. Providers use
   * different slugs for the same chain (`eth` here, `ethereum` there), so a
   * batched request correlates on what the CALLER asked, not on the slug.
   */
  market: string
  displayName: string
  volume24hUsd: number | null
  reserveUsd: number | null
  txns24h: number | null
  poolsCount: number | null
  coverage: 'network' | 'top-pools'
  /** Pools behind the figures when `coverage` is `top-pools`. */
  sampledPools: number | null
  source: 'geckoterminal' | 'dexpaprika'
}

// ── DEX liquidity positions (`trading:orders`, action `lp-positions`) ────────
// A concentrated-liquidity position as the chain itself reports it, read from
// the v3-family NonfungiblePositionManager for one wallet address.
//
// This rides an ACTION on `trading:orders` rather than the `trading:positions`
// capability, deliberately. Every consumer of that capability id (futures,
// equities, predictions) reads `NormalizedPosition`, which describes a directional
// position with an entry price, leverage and liquidation level — none of which
// an LP position has. Declaring the id with a different payload would make the
// next generic positions consumer wrong instead of empty. `quote` and `gas` set
// the precedent: a read that needs no account is an action on the venue's own
// surface, and this one never touches a wallet slot or a private key either.
//
// Everything chain state cannot answer is absent rather than guessed. There is
// no cost basis, no fee history and therefore no fee APR, no time-in-range and
// no impermanent loss in here: a position stores its liquidity and its bounds,
// not what it was worth when it was opened.

/** One leg of a position's pool, resolved to what a row can print. */
export type LpPositionToken = {
  address: string
  symbol: string
  decimals: number
}

/** A single v3-family liquidity position, priced against live pool state. */
export type LpPositionEntry = {
  /** Pairlens market id of the chain the position lives on. */
  market: string
  /** Position manager holding the NFT — half of the position's identity. */
  managerAddress: string
  /** ERC-721 token id, decimal string. The other half. */
  tokenId: string
  /** Venue that deployed the manager, e.g. `Uniswap v3`. */
  dexName: string
  /** Pool the position belongs to, null when the factory lookup failed. */
  poolAddress: string | null
  /** Fee in hundredths of a bip, as the pool stores it (3000 = 0.30%). */
  fee: number
  /** The same fee as a fraction of notional, or null when it is unreadable. */
  feeTier: number | null
  /** Sorted by address, exactly as the pool orders them. */
  token0: LpPositionToken
  token1: LpPositionToken
  /** Position liquidity, `uint128` as a decimal string. */
  liquidity: string
  tickLower: number
  tickUpper: number
  /** Pool's current tick. Null when the pool state could not be read. */
  currentTick: number | null
  /** Pool's `sqrtPriceX96`, decimal string. Null with `currentTick`. */
  sqrtPriceX96: string | null
  /** Whether the pool trades inside the band. Null when the pool is unread. */
  inRange: boolean | null
  /** Token amounts the liquidity stands for now, human units. */
  amount0: number | null
  amount1: number | null
  /**
   * Uncollected fees in human units, from a static `collect` simulation with
   * max amounts. Null when the simulation could not be run, which is NOT the
   * same as zero and must not be printed as one.
   */
  fees0: number | null
  fees1: number | null
  /** Band and current price, token1 per token0, decimal-corrected. */
  priceLower: number | null
  priceUpper: number | null
  priceCurrent: number | null
  /**
   * True when the caller passed a pair whose two legs resolved to exactly this
   * position's tokens. Null when no pair was passed or a leg did not resolve —
   * "undeterminable", which a pane shows as an unfiltered list rather than as
   * "no positions on this pool".
   */
  matchesPair: boolean | null
}

export type LpPositionsResponse = {
  market: string
  /** The address that was read. Echoed so a row can never be misattributed. */
  owner: string
  positions: Array<LpPositionEntry>
  /**
   * Position NFTs the wallet holds on this chain, spent receipts included. A
   * closed position keeps its token until it is burned, so this is routinely far
   * larger than the number of live ranges and is NOT what a pane should count.
   */
  totalFound: number
  /** How many of those were inspected, bounded by the enumeration cap. */
  enumerated: number
  /** Live positions found among them: liquidity, or fees still owed. */
  listable: number
  /** Cap on live positions priced, so a pane can say it is showing a subset. */
  cap: number
  /** Managers that could not be read at all, and why. Data, not a throw. */
  errors: Array<{ manager: string; message: string }>
  ts: number
}
