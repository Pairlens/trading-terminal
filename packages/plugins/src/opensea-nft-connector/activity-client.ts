// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The tape, the items grid, the trait table and a wallet's holdings.
 *
 * ## The market-wide tape
 *
 * `sales` is the one read that works unscoped: the Discovery board's whale feed
 * is the same action without a contract. OpenSea's market-wide `/events` takes
 * no chain parameter, so the chain filter is applied here, on `event.chain`,
 * after the page lands. That means a chain nobody is trading returns few rows
 * from a full page rather than a full page of rows, which is honest and cheap.
 *
 * ## The USD floor on the whale feed
 *
 * A "whale" filter is a USD number, and OpenSea prices everything in the
 * chain's own currency. The rate is learned from a collection detail's
 * `pricing_currencies` (see `collections-client`), and when the tape is
 * unscoped the rate is learned from the first print's OWN collection rather
 * than a hardcoded reference. A print whose USD value cannot be computed is
 * dropped from a filtered feed rather than passed through: a feed that says
 * "over $50k" must not include rows nobody checked.
 */
import { openSeaFetch } from './http'
import { fetchCollectionDetail, usdRateFor } from './collections-client'
import {
  currencyForChain,
  mergeListingsIntoItems,
  parseHoldings,
  parseListings,
  parseNftRecords,
  parseSaleEvents,
  parseTraits,
} from './parsers'
import { looksLikeAddress, resolveSlug } from './slug-resolver'
import { OPENSEA_CHAIN } from './types'

import type {
  NftChain,
  NftHoldingsResult,
  NftItemsResult,
  NftSalesResult,
  NftTraitFloor,
} from '@pairlens/shared/nft-types'
import type { ParseContext } from './parsers'

/** OpenSea's own ceiling on an events page. */
const MAX_EVENT_PAGE = 200

function clamp(limit: number | undefined, fallback: number, max: number) {
  const wanted = Math.trunc(limit ?? fallback)
  return Math.min(Math.max(wanted, 1), max)
}

export type SalesQuery = {
  chain: NftChain
  /** Absent means the market-wide tape. */
  contract?: string
  limit?: number
  /** Drop prints worth less than this in USD. */
  minPriceUsd?: number
}

export async function fetchSales(
  apiKey: string,
  query: SalesQuery,
): Promise<NftSalesResult> {
  const { chain, contract, minPriceUsd } = query
  const limit = clamp(query.limit, 50, MAX_EVENT_PAGE)

  if (contract) {
    const slug = await resolveSlug(apiKey, chain, contract)
    const detail = await fetchCollectionDetail(apiKey, chain, slug, contract)
    const ctx: ParseContext = {
      chain,
      contract,
      priceCurrency: detail.summary.priceCurrency,
      collectionName: detail.summary.name,
    }
    const rate = usdRateFor(ctx.priceCurrency)
    if (rate !== undefined) ctx.usdRate = rate
    const raw = await openSeaFetch<unknown>(
      apiKey,
      `/events/collection/${slug}?event_type=sale&limit=${limit}`,
    )
    const parsed = parseSaleEvents(raw, ctx)
    return applyUsdFloor(parsed, minPriceUsd)
  }

  const ctx: ParseContext = { chain, priceCurrency: currencyForChain(chain) }
  const rate = usdRateFor(ctx.priceCurrency)
  if (rate !== undefined) ctx.usdRate = rate

  // Ask for a full page even when the caller wants fewer rows: the chain filter
  // runs after the page lands, so a narrow request would return a handful.
  const raw = await openSeaFetch<unknown>(
    apiKey,
    `/events?event_type=sale&limit=${MAX_EVENT_PAGE}`,
  )
  let parsed = parseSaleEvents(raw, ctx)
  let sales = parsed.sales.filter((sale) => sale.chain === chain)

  if (minPriceUsd && ctx.usdRate === undefined) {
    // Learn the rate from a collection that actually printed, rather than from
    // a slug baked into this file that could be delisted tomorrow.
    const seed = sales.find((sale) => sale.collectionName)
    if (seed?.collectionName) {
      try {
        await fetchCollectionDetail(apiKey, chain, seed.collectionName)
        const learned = usdRateFor(ctx.priceCurrency)
        if (learned !== undefined) {
          ctx.usdRate = learned
          parsed = parseSaleEvents(raw, ctx)
          sales = parsed.sales.filter((sale) => sale.chain === chain)
        }
      } catch {
        // No rate, so the USD floor below drops everything rather than letting
        // unpriced rows through a filter that claims to have checked them.
      }
    }
  }

  const filtered = applyUsdFloor({ sales }, minPriceUsd)
  return { sales: filtered.sales.slice(0, clamp(query.limit, 50, MAX_EVENT_PAGE)) }
}

function applyUsdFloor(
  result: NftSalesResult,
  minPriceUsd: number | undefined,
): NftSalesResult {
  if (!minPriceUsd) return result
  const sales = result.sales.filter(
    (sale) => sale.priceUsd !== undefined && sale.priceUsd >= minPriceUsd,
  )
  return result.cursor ? { sales, cursor: result.cursor } : { sales }
}

/**
 * The items grid, with each card's own ask merged in.
 *
 * Two reads rather than one because OpenSea's NFT records carry no price: the
 * grid would be a wall of pictures, which is exactly the shopping surface this
 * asset class exists to replace. The listings half is allowed to fail on its
 * own and the grid still renders, priceless.
 */
export async function fetchItems(
  apiKey: string,
  chain: NftChain,
  contract: string,
  limit?: number,
): Promise<NftItemsResult> {
  const slug = await resolveSlug(apiKey, chain, contract)
  const detail = await fetchCollectionDetail(apiKey, chain, slug, contract)
  const ctx: ParseContext = {
    chain,
    contract,
    priceCurrency: detail.summary.priceCurrency,
  }
  const rate = usdRateFor(ctx.priceCurrency)
  if (rate !== undefined) ctx.usdRate = rate
  const page = clamp(limit, 60, MAX_EVENT_PAGE)

  const [itemsRaw, listingsRaw] = await Promise.all([
    openSeaFetch<unknown>(apiKey, `/collection/${slug}/nfts?limit=${page}`),
    openSeaFetch<unknown>(
      apiKey,
      `/listings/collection/${slug}/best?limit=${Math.min(page, 100)}`,
    ).catch(() => null),
  ])

  const parsed = parseNftRecords(itemsRaw, ctx)
  const listings = listingsRaw ? parseListings(listingsRaw, ctx).listings : []
  const items = mergeListingsIntoItems(parsed.items, listings)
  return parsed.cursor ? { items, cursor: parsed.cursor } : { items }
}

/**
 * The trait table.
 *
 * The supply comes from the collection detail because the trait payload has no
 * denominator, and a rarity share is the only real number on this table:
 * OpenSea publishes no trait floors, and deriving them would be a filtered
 * listings read per trait value.
 */
export async function fetchTraits(
  apiKey: string,
  chain: NftChain,
  contract: string,
): Promise<Array<NftTraitFloor>> {
  const slug = await resolveSlug(apiKey, chain, contract)
  const [detail, raw] = await Promise.all([
    fetchCollectionDetail(apiKey, chain, slug, contract).catch(() => null),
    openSeaFetch<unknown>(apiKey, `/traits/${slug}`),
  ])
  return parseTraits(raw, detail?.summary.totalSupply)
}

export async function fetchHoldings(
  apiKey: string,
  chain: NftChain,
  owner: string,
  contract?: string,
  limit?: number,
): Promise<NftHoldingsResult> {
  const venueChain = OPENSEA_CHAIN[chain]
  const page = clamp(limit, 50, MAX_EVENT_PAGE)
  // Scope server-side when we can: an account endpoint filtered by slug is one
  // page of the right tokens instead of pages of the wrong ones.
  const slug = contract
    ? await resolveSlug(apiKey, chain, contract).catch(() => undefined)
    : undefined
  const scope = slug ? `&collection=${encodeURIComponent(slug)}` : ''
  const raw = await openSeaFetch<unknown>(
    apiKey,
    `/chain/${venueChain}/account/${owner}/nfts?limit=${page}${scope}`,
  )
  // The client-side filter stays even when the server scoped the read: a slug
  // spanning two chains would otherwise hand a Base board Ethereum tokens. It
  // only applies to an address, because a slug never matches a token's own
  // `contract` field and would filter the whole page away.
  const addressFilter =
    contract && looksLikeAddress(chain, contract) ? contract : undefined
  return parseHoldings(raw, chain, addressFilter)
}
