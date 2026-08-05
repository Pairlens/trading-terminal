// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type InstrumentCategory =
  | 'layer1'
  | 'defi'
  | 'meme'
  | 'ai'
  | 'gaming'
  | 'infrastructure'

export type Instrument = {
  id: string // 'okx:BTC-USDT'
  market: string
  symbol: string // 'BTC-USDT'
  name: string // 'Bitcoin'
  base: string // 'BTC'
  quote: string // 'USDT'
  assetClass: string // 'crypto' | 'stocks'
  categories: Array<InstrumentCategory>
  rank: number
  featured: boolean
}

export type InstrumentPage = {
  items: Array<Instrument>
  total: number
  hasMore: boolean
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
