// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two-sided book: listings up the ask ladder, collection offers down the
 * bid.
 *
 * ## Why `book` is one action and not two the caller zips
 *
 * A pane fetching listings and offers as separate queries gets two answers from
 * two instants. A bid withdrawn in the gap renders a crossed book that never
 * existed, and a crossed book is the one thing a depth pane must never draw
 * because it reads as free money. So both sides are issued together and stamped
 * with one `asOfMs`, and the pane shows when rather than guessing.
 *
 * ## Where each side comes from
 *
 * The ask side is `/listings/collection/{slug}/best`, which is the cheapest
 * listing per token: that IS the ladder, because on an NFT book every unit is a
 * distinct asset and a trader buying the floor is buying one specific token id.
 *
 * The bid side prefers `/collections/{slug}/offer_aggregates`, which is the
 * whole bid book already bucketed by price. Raw `/offers/collection/{slug}/all`
 * is the fallback and the per-order detail: it carries an order hash and an
 * expiry that the aggregates do not, but it is paginated, and a page of orders
 * shows the levels it happens to contain. A depth curve missing its middle is
 * worse than one that cannot be clicked.
 */
import { openSeaFetch } from './http'
import { fetchCollectionDetail, usdRateFor } from './collections-client'
import { parseListings, parseOfferAggregates, parseOffers } from './parsers'
import { resolveSlug } from './slug-resolver'

import type {
  NftBook,
  NftChain,
  NftListingsResult,
  NftOffersResult,
} from '@pairlens/shared/nft-types'
import type { ParseContext } from './parsers'

/** OpenSea caps these pages at 100; the ladder panes ask for far fewer. */
const MAX_PAGE = 100

function clamp(limit: number | undefined, fallback: number): number {
  const wanted = Math.trunc(limit ?? fallback)
  return Math.min(Math.max(wanted, 1), MAX_PAGE)
}

/**
 * The parse context a ladder needs: the settlement currency and the FX rate.
 *
 * One collection-detail read, cached for ten minutes, and it is the same read
 * the header pane already paid for. Without it every price on the ladder would
 * be denominated in a guess and every USD column would be blank.
 */
async function contextFor(
  apiKey: string,
  chain: NftChain,
  contract: string,
  slug: string,
): Promise<ParseContext> {
  const detail = await fetchCollectionDetail(apiKey, chain, slug, contract)
  const priceCurrency = detail.summary.priceCurrency
  const rate = usdRateFor(priceCurrency)
  const ctx: ParseContext = { chain, contract, priceCurrency }
  if (rate !== undefined) ctx.usdRate = rate
  if (detail.summary.name) ctx.collectionName = detail.summary.name
  return ctx
}

export async function fetchListings(
  apiKey: string,
  chain: NftChain,
  contract: string,
  limit?: number,
): Promise<NftListingsResult> {
  const slug = await resolveSlug(apiKey, chain, contract)
  const ctx = await contextFor(apiKey, chain, contract, slug)
  const raw = await openSeaFetch<unknown>(
    apiKey,
    `/listings/collection/${slug}/best?limit=${clamp(limit, 50)}`,
  )
  return parseListings(raw, ctx)
}

/**
 * The bid ladder, aggregates first.
 *
 * The fallback runs on a THROWN aggregates read, not on an empty one: an empty
 * bid side is a real answer for a collection nobody is bidding on, and retrying
 * it against the raw endpoint would spend a second request to learn the same
 * nothing.
 */
export async function fetchOffers(
  apiKey: string,
  chain: NftChain,
  contract: string,
  limit?: number,
): Promise<NftOffersResult> {
  const slug = await resolveSlug(apiKey, chain, contract)
  const ctx = await contextFor(apiKey, chain, contract, slug)
  const depth = clamp(limit, 50)
  try {
    const raw = await openSeaFetch<unknown>(
      apiKey,
      `/collections/${slug}/offer_aggregates?limit=${depth}&sort_direction=desc`,
    )
    return parseOfferAggregates(raw, ctx)
  } catch {
    const raw = await openSeaFetch<unknown>(
      apiKey,
      `/offers/collection/${slug}/all?limit=${depth}`,
    )
    return parseOffers(raw, ctx)
  }
}

export async function fetchBook(
  apiKey: string,
  chain: NftChain,
  contract: string,
  limit?: number,
): Promise<NftBook> {
  const slug = await resolveSlug(apiKey, chain, contract)
  const ctx = await contextFor(apiKey, chain, contract, slug)
  const depth = clamp(limit, 30)

  // Issued together, resolved together, stamped once. Settling the two sides at
  // one instant is the entire point of this action existing.
  const [asks, bids] = await Promise.all([
    openSeaFetch<unknown>(
      apiKey,
      `/listings/collection/${slug}/best?limit=${depth}`,
    ).then((raw) => parseListings(raw, ctx).listings),
    openSeaFetch<unknown>(
      apiKey,
      `/collections/${slug}/offer_aggregates?limit=${depth}&sort_direction=desc`,
    )
      .then((raw) => parseOfferAggregates(raw, ctx).offers)
      .catch(async () => {
        const raw = await openSeaFetch<unknown>(
          apiKey,
          `/offers/collection/${slug}/all?limit=${depth}`,
        )
        return parseOffers(raw, ctx).offers
      }),
  ])

  return {
    chain,
    contract: ctx.contract ?? contract,
    priceCurrency: ctx.priceCurrency,
    asks,
    bids,
    asOfMs: Date.now(),
  }
}
