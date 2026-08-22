// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The NFT wire contract: what a connector serving `market-data:nft` returns,
 * and what every NFT pane reads.
 *
 * An NFT collection is a market with a bid, an ask and a tape, and this file
 * is where that claim is made concrete. Marketplaces publish it as a shopping
 * grid — a wall of pictures with a "buy" button — which hides the only two
 * numbers a trader needs: how much is actually offered at each price, and how
 * much is actually bid. Listings aggregate into an ask ladder. Collection
 * offers aggregate into a bid ladder. Sales are a tape. So the types below are
 * deliberately book-shaped rather than catalogue-shaped, and the panes built on
 * them reuse the terminal's existing depth and time-and-sales vocabulary.
 *
 * ## Units, and the one rule that matters
 *
 * Every price in this file is denominated in the collection's own settlement
 * currency (`priceCurrency`: ETH on Ethereum, SOL on Solana, and so on), NOT in
 * USD. A collection's floor is quoted in ETH by every venue that lists it, and
 * converting at read time would make two panes disagree by whatever the FX
 * source drifted. `*Usd` fields are carried alongside when a provider supplies
 * them, and they are always optional: absent means "this provider did not say",
 * never "zero".
 *
 * Sizes are item counts. An NFT is indivisible, so a size is an integer and a
 * fractional one is a bug rather than a rounding artefact.
 */

/** Chains an NFT surface can address. The slug is also the URL's venue segment. */
export type NftChain =
  | 'ethereum'
  | 'solana'
  | 'base'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'

export const NFT_CHAINS: ReadonlyArray<NftChain> = [
  'ethereum',
  'solana',
  'base',
  'polygon',
  'arbitrum',
  'optimism',
]

export function isNftChain(value: string): value is NftChain {
  return (NFT_CHAINS as ReadonlyArray<string>).includes(value)
}

/**
 * The marketplaces an order can be routed to. Identity is the collection, so a
 * marketplace is an execution venue the way a pool is for a swap: chosen at
 * order time, never part of what the asset IS.
 */
export type NftMarketplace =
  | 'opensea'
  | 'blur'
  | 'magiceden'
  | 'looksrare'
  | 'x2y2'
  | 'tensor'
  | 'unknown'

/**
 * A collection's headline state. The row a rankings table draws, and the header
 * a trade board opens with.
 */
export type NftCollectionSummary = {
  /** Chain plus contract address (or mint authority on Solana) — the identity. */
  chain: NftChain
  contract: string
  /** The venue's own URL slug, when it has one. Never the identity. */
  slug?: string
  name: string
  imageUrl?: string
  /** Settlement currency ticker: ETH, SOL, MATIC. */
  priceCurrency: string
  /** Best current ask across every marketplace the provider indexes. */
  floorPrice?: number
  floorPriceUsd?: number
  /** Best current collection-wide bid — the price a holder can sell into now. */
  topOffer?: number
  topOfferUsd?: number
  /** Floor move over the trailing 24h, as a fraction (0.05 = +5%). */
  floorChange24h?: number
  volume24h?: number
  volume24hUsd?: number
  volumeChange24h?: number
  volume7d?: number
  /** Floor × supply, in the settlement currency. */
  marketCap?: number
  marketCapUsd?: number
  totalSupply?: number
  ownerCount?: number
  listedCount?: number
  /** Completed sales in the trailing 24h. */
  sales24h?: number
  /** Creator fee as a fraction of sale price (0.05 = 5%). */
  royaltyBps?: number
  verified?: boolean
  description?: string
  /** Unix ms the collection's first token was minted, when known. */
  deployedMs?: number
  externalUrl?: string
}

/**
 * One rung of the ask ladder: a listed item, priced, with the venue that will
 * fill it. The ladder is item-level rather than aggregated because on an NFT
 * book each unit is a distinct asset — a trader buying the floor is buying one
 * specific token id, and hiding which one is hiding the trade.
 */
export type NftListing = {
  tokenId: string
  name?: string
  imageUrl?: string
  price: number
  priceUsd?: number
  priceCurrency: string
  marketplace: NftMarketplace
  /** Rarity rank within the collection, 1 = rarest. Provider-defined. */
  rarityRank?: number
  seller?: string
  /** Unix ms the listing expires, when the venue publishes one. */
  expiresMs?: number
  /** Opaque venue order id, needed to fulfil this exact listing. */
  orderId?: string
}

/**
 * One rung of the bid ladder. Collection offers genuinely aggregate — an offer
 * for "any 5 tokens at 3.1 ETH" is 5 units of executable size at one price —
 * which is what makes an NFT bid side a real depth curve rather than a list.
 */
export type NftOffer = {
  price: number
  priceUsd?: number
  priceCurrency: string
  /** How many items the bidder will take at this price. */
  quantity: number
  marketplace: NftMarketplace
  /** Set when the offer names one token rather than the whole collection. */
  tokenId?: string
  /** Set when the offer is scoped to a trait rather than the whole collection. */
  trait?: { key: string; value: string }
  bidder?: string
  expiresMs?: number
  orderId?: string
}

/**
 * A print on the tape.
 *
 * Carries its own collection identity because the tape is read two ways: scoped
 * to one collection on a trade board, where the identity is redundant, and
 * market-wide on the Discovery board, where a row that cannot name what sold is
 * a price with nothing attached to it. Optional rather than required, because a
 * collection-scoped provider response genuinely does not repeat it per row.
 */
export type NftSale = {
  chain?: NftChain
  contract?: string
  collectionName?: string
  tokenId: string
  name?: string
  imageUrl?: string
  price: number
  priceUsd?: number
  priceCurrency: string
  marketplace: NftMarketplace
  timestampMs: number
  buyer?: string
  seller?: string
  txHash?: string
  /** Rarity rank at time of sale, when the provider carries one. */
  rarityRank?: number
}

/** One token in the items grid. */
export type NftItem = {
  tokenId: string
  name?: string
  imageUrl?: string
  owner?: string
  /** Current ask, when listed. Absent means not for sale. */
  listPrice?: number
  listPriceUsd?: number
  priceCurrency?: string
  marketplace?: NftMarketplace
  rarityRank?: number
  rarityScore?: number
  traits?: Array<{ key: string; value: string }>
  /** Last sale price, in the settlement currency. */
  lastSalePrice?: number
}

/**
 * Floor price for one trait value. The real alpha surface on a mature
 * collection: the collection floor is a headline, the trait floor is the
 * market.
 */
export type NftTraitFloor = {
  key: string
  value: string
  /**
   * Settlement currency for this trait's floor. Carried per row rather than
   * assumed from the collection, because a price with no ticker beside it is
   * the one thing this file's header forbids, and a pane reading it off a
   * second query is a pane that can render the two out of step.
   */
  priceCurrency?: string
  /** How many tokens carry this trait. */
  count: number
  /** Share of supply carrying it, as a fraction. */
  rarity?: number
  floorPrice?: number
  floorPriceUsd?: number
  listedCount?: number
}

/**
 * A point on a collection's price history. Bucketed by the connector, never by
 * a pane: two panes bucketing the same tape at different offsets is how a chart
 * and a stat disagree about the same day.
 */
export type NftPricePoint = {
  timestampMs: number
  /** Floor price at the close of the bucket, when the provider tracks a floor. */
  floorPrice?: number
  /** Volume-weighted average sale price within the bucket. */
  averagePrice?: number
  /** OHLC of sale prices within the bucket, when derived from a tape. */
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
  salesCount?: number
}

/** Where a history series came from, so a chart can say so rather than imply. */
export type NftSeriesBasis =
  /** The provider publishes a tracked floor over time. */
  | 'floor'
  /** Bucketed from the sales tape by the connector — an average, not a floor. */
  | 'sales'

export type NftPriceSeries = {
  basis: NftSeriesBasis
  priceCurrency: string
  points: Array<NftPricePoint>
  /**
   * True when the window asked for reaches further back than the provider
   * served. A short series and a truncated one look identical on a chart, and
   * only one of them is a data gap worth telling the user about.
   */
  truncated?: boolean
}

/** Market-wide state for the Discovery board's overview strip. */
export type NftMarketOverview = {
  volume24hUsd?: number
  volumeChange24h?: number
  marketCapUsd?: number
  sales24h?: number
  salesChange24h?: number
  /** Distinct wallets that traded in the window. */
  traders24h?: number
  /** Share of 24h volume by marketplace, as fractions summing to ~1. */
  marketplaceShare?: Array<{ marketplace: NftMarketplace; share: number }>
  /** Share of 24h volume by chain. */
  chainShare?: Array<{ chain: NftChain; share: number }>
}

/**
 * A holder position: what a wallet owns in one collection. The cost basis is
 * optional because most providers index ownership without indexing what the
 * current owner paid.
 */
export type NftHolding = {
  chain: NftChain
  contract: string
  collectionName?: string
  tokenId: string
  name?: string
  imageUrl?: string
  /** What this wallet paid, when the provider can attribute an acquisition. */
  costBasis?: number
  priceCurrency?: string
  /** Best bid this token could be sold into now. */
  markPrice?: number
  acquiredMs?: number
}

// ── Request/response envelopes for `market-data:nft` ──────────────────
//
// One capability, action-dispatched, the way `market-data:pool-stats` serves
// five reads. A separate capability per read would multiply the resolver's
// per-capability winner selection across reads that must agree with each other.

export type NftReadAction =
  | 'collections'
  | 'collection'
  | 'book'
  | 'listings'
  | 'offers'
  | 'sales'
  | 'items'
  | 'traits'
  | 'series'
  | 'overview'
  | 'holdings'

/** Ranking axis for the `collections` action. */
export type NftCollectionSort =
  | 'volume24h'
  | 'floorChange24h'
  | 'sales24h'
  | 'marketCap'
  | 'newest'

export type NftCollectionsResult = {
  collections: Array<NftCollectionSummary>
  /** Opaque continuation token; absent means the provider served the tail. */
  cursor?: string
}

export type NftListingsResult = {
  listings: Array<NftListing>
  cursor?: string
}

export type NftOffersResult = {
  offers: Array<NftOffer>
  cursor?: string
}

export type NftSalesResult = {
  sales: Array<NftSale>
  cursor?: string
}

export type NftItemsResult = {
  items: Array<NftItem>
  cursor?: string
}

export type NftHoldingsResult = {
  holdings: Array<NftHolding>
  cursor?: string
}

/**
 * The two-sided book a trade board draws. Assembled by the connector so the
 * bid and ask sides are read at one instant: a pane fetching them separately
 * can render a crossed book that never existed.
 */
export type NftBook = {
  chain: NftChain
  contract: string
  priceCurrency: string
  asks: Array<NftListing>
  bids: Array<NftOffer>
  /** Unix ms both sides were read at. */
  asOfMs: number
}
