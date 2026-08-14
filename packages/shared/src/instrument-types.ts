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
