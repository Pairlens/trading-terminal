// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Collections: the rankings table, one collection's header, and the market
 * overview this provider refuses to fake.
 *
 * ## The N+1 that shapes this file
 *
 * `/collections/top` and `/collections/trending` rank collections and publish
 * no numbers about them: a row carries a name, an image and its contracts. The
 * floor and the volume a rankings table exists to show live one request further
 * on, at `/collections/{slug}/stats`, one call per row. Fifty rows every five
 * minutes is 600 requests an hour, which is the entire free-tier budget spent
 * on one pane.
 *
 * So the join is capped and cached. The head of the list is enriched, the tail
 * ships with its numbers ABSENT rather than zero, and the stats cache is shared
 * with the single-collection read so a board that opens a row it just saw
 * ranked pays nothing for the header. Absent is the load-bearing part: a table
 * can grey out a cell it was never told about, and it cannot un-draw a floor of
 * zero.
 */
import { openSeaFetch, unsupported } from './http'
import {
  applyCollectionStats,
  asNumber,
  asObject,
  parseCollectionDetail,
  parseFloorPoints,
  parseRankedCollections,
} from './parsers'
import { primeSlug, resolveSlug } from './slug-resolver'

import type {
  NftChain,
  NftCollectionSort,
  NftCollectionSummary,
  NftCollectionsResult,
} from '@pairlens/shared/nft-types'
import type { ParsedCollectionDetail } from './parsers'

/** Rows whose stats are joined onto a ranking. See the header. */
const RANKING_STATS_CAP = 15
/** Rows whose trailing floor move is derived, and only when it is the sort. */
const RANKING_MOVE_CAP = 12
/** Requests issued at once inside a join. The limiter paces the rest. */
const JOIN_CONCURRENCY = 4

const STATS_TTL_MS = 120_000
const DETAIL_TTL_MS = 10 * 60_000

type Cached<T> = { value: T; at: number }

const statsCache = new Map<string, Cached<unknown>>()
const detailCache = new Map<string, Cached<ParsedCollectionDetail>>()

/**
 * USD per unit of a settlement currency, learned from any collection detail.
 *
 * The only FX source in the connector. OpenSea prices everything in the chain's
 * own currency, and `pricing_currencies` on a collection detail is the one
 * place it says what that currency is worth. The market-wide tape's USD filter
 * has nowhere else to look, which is why this is module-scope and shared rather
 * than folded into the summary that taught it.
 */
const usdRates = new Map<string, Cached<number>>()
const USD_RATE_TTL_MS = 10 * 60_000

export function noteUsdRates(rates: Array<[string, number]>): void {
  const at = Date.now()
  for (const [symbol, rate] of rates) usdRates.set(symbol, { value: rate, at })
}

export function usdRateFor(symbol: string): number | undefined {
  const hit = usdRates.get(symbol.toUpperCase())
  if (!hit) return undefined
  return Date.now() - hit.at < USD_RATE_TTL_MS ? hit.value : undefined
}

export function clearCollectionCaches(): void {
  statsCache.clear()
  detailCache.clear()
  usdRates.clear()
}

function fresh<T>(cache: Map<string, Cached<T>>, key: string, ttl: number) {
  const hit = cache.get(key)
  if (!hit) return undefined
  return Date.now() - hit.at < ttl ? hit.value : undefined
}

/** One collection's metadata, cached: it changes on the order of never. */
export async function fetchCollectionDetail(
  apiKey: string,
  chain: NftChain,
  slug: string,
  fallbackContract?: string,
): Promise<ParsedCollectionDetail> {
  const key = `${chain}:${slug}`
  const cached = fresh(detailCache, key, DETAIL_TTL_MS)
  if (cached) return cached

  const raw = await openSeaFetch<unknown>(apiKey, `/collections/${slug}`)
  const detail = parseCollectionDetail(raw, chain, fallbackContract)
  if (!detail) {
    throw new Error(`OpenSea returned no collection for '${slug}'.`)
  }
  noteUsdRates(detail.usdRates)
  primeSlug(chain, detail.summary.contract, detail.slug)
  detailCache.set(key, { value: detail, at: Date.now() })
  return detail
}

async function fetchStats(apiKey: string, slug: string): Promise<unknown> {
  const cached = fresh(statsCache, slug, STATS_TTL_MS)
  if (cached !== undefined) return cached
  const raw = await openSeaFetch<unknown>(apiKey, `/collections/${slug}/stats`)
  statsCache.set(slug, { value: raw, at: Date.now() })
  return raw
}

/** Run `work` over `rows` a few at a time, keeping every result positional. */
async function mapLimited<T, TResult>(
  rows: Array<T>,
  limit: number,
  work: (row: T, index: number) => Promise<TResult>,
): Promise<Array<TResult | null>> {
  const results: Array<TResult | null> = new Array(rows.length).fill(null)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(limit, rows.length) },
    async () => {
      for (;;) {
        const index = cursor++
        if (index >= rows.length) return
        const row = rows[index]
        if (row === undefined) return
        try {
          results[index] = await work(row, index)
        } catch {
          // One row's stats failing is one row without numbers, never a failed
          // ranking: the table is still the answer to what is ranked.
          results[index] = null
        }
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * The 24h floor move, which no ranking or stats endpoint publishes.
 *
 * Derived from the two ends of a one-day floor history, and only for the pane
 * that sorts by it: it is a request per row on top of a request per row, and
 * paying that for a column nobody is sorting on would be the single most
 * expensive habit in this connector.
 */
async function fetchFloorMove(
  apiKey: string,
  slug: string,
): Promise<number | undefined> {
  const raw = await openSeaFetch<unknown>(
    apiKey,
    `/collections/${slug}/floor_prices?timeframe=one_day&resolution=2`,
  )
  const points = parseFloorPoints(raw)
  const first = points[0]?.floorPrice
  const last = points[points.length - 1]?.floorPrice
  if (first === undefined || last === undefined || first <= 0) return undefined
  return (last - first) / first
}

/** Our sort axis onto OpenSea's, where one exists. */
function rankingRequest(
  sort: NftCollectionSort,
  chain: NftChain | undefined,
  limit: number,
): string {
  const chains = chain ? `&chains=${chain === 'polygon' ? 'matic' : chain}` : ''
  if (sort === 'newest') {
    // The only axis served by the plain listing, which orders by creation.
    return `/collections?order_by=created_date&limit=${limit}${chain ? `&chain=${chain === 'polygon' ? 'matic' : chain}` : ''}`
  }
  if (sort === 'floorChange24h') {
    // OpenSea's own "what is moving" ranking. It publishes no per-row delta, so
    // the connector derives one for the head of the list and leaves the tail's
    // absent rather than ranking rows by a number it did not compute.
    return `/collections/trending?timeframe=one_day&limit=${limit}${chains}`
  }
  const sortBy =
    sort === 'sales24h'
      ? 'one_day_sales'
      : sort === 'marketCap'
        ? 'total_volume'
        : 'one_day_volume'
  return `/collections/top?sort_by=${sortBy}&limit=${limit}${chains}`
}

function reorder(
  rows: Array<NftCollectionSummary>,
  sort: NftCollectionSort,
): Array<NftCollectionSummary> {
  if (sort === 'newest' || sort === 'volume24h') return rows
  const axis = (row: NftCollectionSummary): number | undefined =>
    sort === 'sales24h'
      ? row.sales24h
      : sort === 'marketCap'
        ? row.marketCap
        : row.floorChange24h
  // Rows the join never reached keep the venue's order behind the ones it did,
  // rather than being sorted as if their missing number were zero.
  const ranked = rows.filter((row) => axis(row) !== undefined)
  const rest = rows.filter((row) => axis(row) === undefined)
  ranked.sort((a, b) => (axis(b) ?? 0) - (axis(a) ?? 0))
  return [...ranked, ...rest]
}

export async function fetchCollections(
  apiKey: string,
  chain: NftChain | undefined,
  sort: NftCollectionSort,
  limit: number,
): Promise<NftCollectionsResult> {
  const raw = await openSeaFetch<unknown>(
    apiKey,
    rankingRequest(sort, chain, Math.min(Math.max(limit, 1), 100)),
  )
  const { rows, cursor } = parseRankedCollections(raw, chain)
  for (const row of rows) {
    if (row.slug) primeSlug(row.chain, row.contract, row.slug)
  }

  const head = rows.slice(0, RANKING_STATS_CAP)
  const stats = await mapLimited(head, JOIN_CONCURRENCY, async (row) =>
    row.slug ? await fetchStats(apiKey, row.slug) : null,
  )
  const enriched = rows.map((row, index) => {
    const raw_ = stats[index]
    if (!raw_) return row
    return applyCollectionStats(row, raw_, usdRateFor(row.priceCurrency))
  })

  if (sort === 'floorChange24h') {
    const movers = enriched.slice(0, RANKING_MOVE_CAP)
    const moves = await mapLimited(movers, JOIN_CONCURRENCY, async (row) =>
      row.slug ? await fetchFloorMove(apiKey, row.slug) : undefined,
    )
    moves.forEach((move, index) => {
      const row = enriched[index]
      if (row && move != null) row.floorChange24h = move
    })
  }

  const collections = reorder(enriched, sort)
  return cursor ? { collections, cursor } : { collections }
}

/**
 * One collection's header.
 *
 * Three reads at most, and the top offer is deliberately one of them: the wire
 * type calls out the floor and the best collection bid as the two numbers that
 * matter, and a header showing only the ask is a header showing half a market.
 * It is also the read allowed to fail on its own, because a header without a
 * bid still says what the collection is.
 */
export async function fetchCollection(
  apiKey: string,
  chain: NftChain,
  contract: string,
): Promise<NftCollectionSummary> {
  const slug = await resolveSlug(apiKey, chain, contract)
  const [detail, stats, topOffer] = await Promise.all([
    fetchCollectionDetail(apiKey, chain, slug, contract),
    fetchStats(apiKey, slug).catch(() => null),
    fetchTopOffer(apiKey, slug).catch(() => null),
  ])

  const rate = usdRateFor(detail.summary.priceCurrency)
  const summary = applyCollectionStats(detail.summary, stats, rate)
  if (topOffer) {
    summary.topOffer = topOffer.price
    if (topOffer.priceUsd !== undefined) summary.topOfferUsd = topOffer.priceUsd
  }
  return summary
}

/** The best collection-wide bid, as one level. */
async function fetchTopOffer(
  apiKey: string,
  slug: string,
): Promise<{ price: number; priceUsd?: number } | null> {
  const raw = await openSeaFetch<unknown>(
    apiKey,
    `/collections/${slug}/offer_aggregates?limit=1&sort_direction=desc`,
  )
  const body = asObject(raw)
  const first = asObject(
    Array.isArray(body?.['offer_aggregates'])
      ? body['offer_aggregates'][0]
      : undefined,
  )
  const price = asNumber(asObject(first?.['offer_price'])?.['token_unit'])
  if (price === undefined) return null
  const priceUsd = asNumber(asObject(first?.['offer_price'])?.['usd_price'])
  return priceUsd === undefined ? { price } : { price, priceUsd }
}

/**
 * The market-wide overview, which this provider refuses.
 *
 * OpenSea publishes no market aggregate, and the only thing that could be built
 * from what it does publish is the sum of the fifteen collections we can afford
 * to join stats onto. That number is not the NFT market's 24h volume, it is a
 * sample of its head, and a Discovery strip labelled "24h volume" showing it
 * would be wrong by whatever the long tail is worth.
 *
 * So it throws, which is the contract for an action a provider does not serve:
 * the plugin manager walks to the next provider, and if none serves it the pane
 * renders "no provider" rather than a confident wrong number.
 */
export function fetchOverview(): never {
  return unsupported('overview')
}
