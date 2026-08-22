// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * OpenSea payloads to the NFT wire contract. Pure, so all of it is testable
 * without a key.
 *
 * ## Units
 *
 * OpenSea publishes prices two ways and they are not interchangeable. Orders
 * and sale payments carry a RAW integer string plus the token's own `decimals`
 * (`{ value: '8100000000000000000', decimals: 18 }`); collection stats, floor
 * history and offer aggregates carry an already-denominated number. Assuming 18
 * on the second kind divides a floor into dust, and assuming the first kind is
 * denominated multiplies it by a billion, so the two live behind two functions
 * with names that say which is which. Nothing here ever hardcodes 18: USDC
 * offers are 6, and a collection priced in one is a real collection.
 *
 * The raw path is string arithmetic rather than `Number(value) / 10 ** decimals`
 * because 8.1 ETH is 8.1e18 wei, well past the point where a double stops
 * counting integers exactly.
 *
 * ## The asymmetries worth knowing
 *
 * OpenSea's own shapes disagree with each other in three places, and each one
 * silently yields `undefined` if you write a single accessor for both:
 *
 * - A sale event nests its token under `nft`; an order event nests it under
 *   `asset`.
 * - A listing's price is `price.current.value`; an offer's is `price.value`.
 * - The rankings endpoints page on `cursor`; everything else pages on `next`.
 *
 * The third one lives in the clients. The first two live here.
 */
import { CHAIN_CURRENCY, OPENSEA_CHAIN } from './types'

import type {
  NftChain,
  NftCollectionSummary,
  NftHolding,
  NftItem,
  NftListing,
  NftMarketplace,
  NftOffer,
  NftPricePoint,
  NftSale,
  NftTraitFloor,
} from '@pairlens/shared/nft-types'

// ── Reading untyped JSON ─────────────────────────────────────────────

type Json = Record<string, unknown>

export function asObject(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null
}

export function asArray(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : []
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** A number, from a number or a numeric string. Never NaN, never Infinity. */
export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

// ── Units ────────────────────────────────────────────────────────────

/**
 * A raw integer amount scaled by its own `decimals`.
 *
 * String arithmetic, because the raw amounts are routinely larger than a double
 * counts exactly. A value that already carries a decimal point is passed
 * through: OpenSea does not mix the two in one field, but a provider that
 * started to would otherwise have its prices multiplied by 1e18.
 */
export function unitsFromRaw(
  value: unknown,
  decimals: unknown,
): number | undefined {
  const places = asNumber(decimals)
  if (places === undefined || places < 0) return undefined
  const raw =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : ''
  if (!raw) return undefined
  if (raw.includes('.') || raw.includes('e') || raw.includes('E')) {
    return asNumber(raw)
  }
  const negative = raw.startsWith('-')
  const digits = (negative ? raw.slice(1) : raw).replace(/^0+(?=\d)/, '')
  if (!/^\d+$/.test(digits)) return undefined
  const places_ = Math.trunc(places)
  const padded = digits.padStart(places_ + 1, '0')
  const whole = padded.slice(0, padded.length - places_)
  const fraction = places_ > 0 ? padded.slice(padded.length - places_) : ''
  const parsed = Number(
    `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`,
  )
  return Number.isFinite(parsed) ? parsed : undefined
}

/** A price OpenSea already denominated: stats, floor history, aggregates. */
export function unitsFromDenominated(value: unknown): number | undefined {
  const parsed = asNumber(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

/**
 * Unix ms, from whatever OpenSea sent.
 *
 * Its timestamps are seconds (`closing_date`, `startTime`), sometimes as
 * strings, and its metadata dates are ISO. The seconds/ms split is decided by
 * magnitude: anything below 1e12 is a second count, because 1e12 ms is the year
 * 2001 and 1e12 seconds is the year 33658.
 */
export function toMs(value: unknown): number | undefined {
  if (typeof value === 'string' && !/^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const seconds = asNumber(value)
  if (seconds === undefined || seconds <= 0) return undefined
  return seconds < 1e12 ? Math.round(seconds * 1000) : Math.round(seconds)
}

// ── Chains, currencies, marketplaces ─────────────────────────────────

const CHAIN_BY_VENUE_SLUG: Record<string, NftChain> = Object.fromEntries(
  Object.entries(OPENSEA_CHAIN).map(([chain, slug]) => [
    slug,
    chain as NftChain,
  ]),
) as Record<string, NftChain>

/** OpenSea's chain slug back to ours. Undefined for a chain we do not address. */
export function chainFromVenue(value: unknown): NftChain | undefined {
  const slug = asString(value)?.toLowerCase()
  if (!slug) return undefined
  return CHAIN_BY_VENUE_SLUG[slug]
}

/**
 * Whether a payment currency is the chain's own settlement currency.
 *
 * Wrapped native tokens count: every collection bid on Ethereum is denominated
 * in WETH because Seaport cannot escrow raw ETH, and treating that as a
 * different currency would empty the bid side of every book. A stablecoin sale
 * does not count, and mixing one into a floor series would draw a 3000 ETH
 * candle on a 3 ETH collection.
 */
export function isSettlementCurrency(
  symbol: string | undefined,
  settlement: string,
): boolean {
  if (!symbol) return false
  const a = symbol.toUpperCase()
  const b = settlement.toUpperCase()
  if (a === b) return true
  return a === `W${b}` || `W${a}` === b
}

/**
 * The venue every row this file produces will fill on.
 *
 * There is nothing in a v2 payload to read a venue off. What looks like a
 * label, `protocol_address`, is a Seaport CONTRACT address (`seaport.ts` looks
 * the same field up in an address-keyed table), so matching it against
 * marketplace names badged the whole board `unknown`. The endpoint is what
 * knows the venue: `/listings/collection/...` and `/offers/collection/...`
 * serve orders posted to OpenSea's own book, and `/events` calls a transfer a
 * `sale` only when OpenSea brokered it, so a fill on another venue arrives as a
 * bare `transfer` that `parseSaleEvents` drops before it can be priced. The day
 * a payload does start naming a venue, this is the one place to read it.
 */
const OPENSEA_MARKETPLACE: NftMarketplace = 'opensea'

/** The currency a chain's prices are quoted in when the payload does not say. */
export function currencyForChain(chain: NftChain): string {
  return CHAIN_CURRENCY[chain]
}

// ── Context every row parser needs ───────────────────────────────────

export type ParseContext = {
  chain: NftChain
  contract?: string
  /** The collection's settlement currency: ETH, POL, SOL. */
  priceCurrency: string
  /** USD per unit of the settlement currency, when a rate is known. */
  usdRate?: number
  collectionName?: string
}

function usd(amount: number | undefined, rate: number | undefined) {
  if (amount === undefined || rate === undefined) return undefined
  return amount * rate
}

// ── Collections ──────────────────────────────────────────────────────

/**
 * What one collection detail teaches us.
 *
 * The USD rates ride out separately rather than being folded into the summary,
 * because they are the only FX source in the whole connector: `pricing_currencies`
 * is where OpenSea says what a unit of the settlement currency is worth, and the
 * market-wide tape's USD filter has nowhere else to learn it.
 */
export type ParsedCollectionDetail = {
  summary: NftCollectionSummary
  slug: string
  /** Symbol to USD price, learned from `pricing_currencies`. */
  usdRates: Array<[string, number]>
}

/**
 * OpenSea's fee table into a creator royalty.
 *
 * `required: true` is the marketplace's own take, which every venue charges and
 * which is not the creator's. What is left is the royalty a seller actually
 * gives up. OpenSea publishes each `fee` as a percent (2.5 for 2.5%), and
 * `royaltyRate` is a fraction, which is the whole reason for the division.
 */
function royaltyFraction(fees: unknown): number | undefined {
  const rows = asArray(fees)
  if (rows.length === 0) return undefined
  let total = 0
  let seen = false
  for (const row of rows) {
    const fee = asObject(row)
    if (!fee || fee['required'] === true) continue
    const percent = asNumber(fee['fee'])
    if (percent === undefined) continue
    total += percent
    seen = true
  }
  return seen ? total / 100 : undefined
}

export function parseCollectionDetail(
  raw: unknown,
  chain: NftChain,
  fallbackContract?: string,
): ParsedCollectionDetail | null {
  const body = asObject(raw)
  if (!body) return null
  const slug = asString(body['collection'])
  if (!slug) return null

  const contracts = asArray(body['contracts'])
    .map((entry) => asObject(entry))
    .filter((entry): entry is Json => entry !== null)
  // The contract for OUR chain, not the first one listed: a collection deployed
  // on Ethereum and on Base is one slug with two addresses, and picking the
  // wrong one hands the board an identity it cannot read back.
  const onChain = contracts.find(
    (entry) => chainFromVenue(entry['chain']) === chain,
  )
  const contract =
    asString(onChain?.['address']) ??
    fallbackContract ??
    asString(contracts[0]?.['address']) ??
    slug

  const rates: Array<[string, number]> = []
  const pricing = asObject(body['pricing_currencies'])
  for (const key of ['listing_currency', 'offer_currency']) {
    const currency = asObject(pricing?.[key])
    const symbol = asString(currency?.['symbol'])
    const price = asNumber(currency?.['usd_price'])
    if (symbol && price !== undefined) rates.push([symbol.toUpperCase(), price])
  }

  const rarity = asObject(body['rarity'])
  const supply =
    asNumber(body['total_supply']) ??
    asNumber(body['unique_item_count']) ??
    asNumber(rarity?.['total_supply'])

  const summary: NftCollectionSummary = {
    chain,
    contract,
    slug,
    name: asString(body['name']) ?? slug,
    priceCurrency: currencyForChain(chain),
  }
  const imageUrl = asString(body['image_url'])
  if (imageUrl) summary.imageUrl = imageUrl
  const description = asString(body['description'])
  if (description) summary.description = description
  if (supply !== undefined) summary.totalSupply = supply
  const royalty = royaltyFraction(body['fees'])
  if (royalty !== undefined) summary.royaltyRate = royalty
  if (body['safelist_status'] !== undefined) {
    summary.verified = asString(body['safelist_status']) === 'verified'
  }
  const created = toMs(asString(body['created_date']))
  if (created !== undefined) summary.deployedMs = created
  const url = asString(body['opensea_url']) ?? asString(body['project_url'])
  if (url) summary.externalUrl = url

  return { summary, slug, usdRates: rates }
}

/**
 * A ranked row, which carries metadata and nothing else.
 *
 * `/collections/top` and `/collections/trending` publish no floor and no
 * volume, which is why the clients join stats onto the head of the list rather
 * than reading them here. A row that never gets joined keeps its numbers absent
 * instead of zero: a table can grey out "not fetched", and it cannot un-say a
 * floor of 0.
 */
export function parseRankedCollections(
  raw: unknown,
  fallbackChain?: NftChain,
): { rows: Array<NftCollectionSummary>; cursor?: string } {
  const body = asObject(raw)
  const rows: Array<NftCollectionSummary> = []
  for (const entry of asArray(body?.['collections'])) {
    const row = asObject(entry)
    if (!row) continue
    if (row['is_disabled'] === true) continue
    const contracts = asArray(row['contracts'])
      .map((c) => asObject(c))
      .filter((c): c is Json => c !== null)
    const first = contracts[0]
    const chain =
      contracts.map((c) => chainFromVenue(c['chain'])).find((c) => c) ??
      fallbackChain
    if (!chain) continue
    const owned =
      contracts.find((c) => chainFromVenue(c['chain']) === chain) ?? first
    const detail = parseCollectionDetail(
      row,
      chain,
      asString(owned?.['address']),
    )
    if (detail) rows.push(detail.summary)
  }
  const cursor = asString(body?.['next'])
  return cursor ? { rows, cursor } : { rows }
}

/**
 * Stats folded onto a summary.
 *
 * Returns a new object rather than mutating, so a cached row and the row a pane
 * holds can never be the same reference. `market_cap` is not in the stats
 * schema, so the wire type's own definition is used instead: floor times
 * supply, and absent when either half is missing.
 */
export function applyCollectionStats(
  summary: NftCollectionSummary,
  raw: unknown,
  usdRate?: number,
): NftCollectionSummary {
  const body = asObject(raw)
  if (!body) return summary
  const next: NftCollectionSummary = { ...summary }

  const total = asObject(body['total'])
  const floor = unitsFromDenominated(total?.['floor_price'])
  if (floor !== undefined) {
    next.floorPrice = floor
    const floorUsd = usd(floor, usdRate)
    if (floorUsd !== undefined) next.floorPriceUsd = floorUsd
  }
  const symbol = asString(total?.['floor_price_symbol'])
  if (symbol) next.priceCurrency = symbol
  const owners = asNumber(total?.['num_owners'])
  if (owners !== undefined) next.ownerCount = owners

  for (const entry of asArray(body['intervals'])) {
    const interval = asObject(entry)
    const name = asString(interval?.['interval'])
    const volume = asNumber(interval?.['volume'])
    const sales = asNumber(interval?.['sales'])
    if (name === 'one_day') {
      if (volume !== undefined) {
        next.volume24h = volume
        const volumeUsd = usd(volume, usdRate)
        if (volumeUsd !== undefined) next.volume24hUsd = volumeUsd
      }
      if (sales !== undefined) next.sales24h = sales
    }
    if (name === 'seven_day' && volume !== undefined) next.volume7d = volume
  }

  if (next.floorPrice !== undefined && next.totalSupply !== undefined) {
    next.marketCap = next.floorPrice * next.totalSupply
    const capUsd = usd(next.marketCap, usdRate)
    if (capUsd !== undefined) next.marketCapUsd = capUsd
  }
  return next
}

// ── The ask ladder ───────────────────────────────────────────────────

/** Seaport item types that are an NFT rather than a payment token. */
const NFT_ITEM_TYPES = new Set([2, 3, 4, 5])

function seaportParameters(order: Json): Json | null {
  return asObject(asObject(order['protocol_data'])?.['parameters'])
}

export function parseListings(
  raw: unknown,
  ctx: ParseContext,
): { listings: Array<NftListing>; cursor?: string } {
  const body = asObject(raw)
  const listings: Array<NftListing> = []

  for (const entry of asArray(body?.['listings'])) {
    const order = asObject(entry)
    if (!order) continue
    const status = asString(order['status'])
    if (status && status !== 'ACTIVE') continue

    // A listing nests its price one level deeper than an offer does.
    const price = asObject(asObject(order['price'])?.['current'])
    const amount = unitsFromRaw(price?.['value'], price?.['decimals'])
    if (amount === undefined) continue
    const currency = asString(price?.['currency']) ?? ctx.priceCurrency

    const parameters = seaportParameters(order)
    const offered = asArray(parameters?.['offer'])
      .map((item) => asObject(item))
      .find(
        (item) => item && NFT_ITEM_TYPES.has(asNumber(item['itemType']) ?? -1),
      )
    const tokenId =
      asString(asObject(order['asset'])?.['identifier']) ??
      asString(offered?.['identifierOrCriteria'])
    if (!tokenId) continue

    const listing: NftListing = {
      tokenId,
      price: amount,
      priceCurrency: currency,
      marketplace: OPENSEA_MARKETPLACE,
    }
    const priceUsd = usd(
      amount,
      isSettlementCurrency(currency, ctx.priceCurrency)
        ? ctx.usdRate
        : undefined,
    )
    if (priceUsd !== undefined) listing.priceUsd = priceUsd
    const seller = asString(parameters?.['offerer'])
    if (seller) listing.seller = seller
    const expires = toMs(parameters?.['endTime'])
    if (expires !== undefined) listing.expiresMs = expires
    const orderId = asString(order['order_hash'])
    if (orderId) listing.orderId = orderId
    listings.push(listing)
  }

  listings.sort((a, b) => a.price - b.price)
  const cursor = asString(body?.['next'])
  return cursor ? { listings, cursor } : { listings }
}

// ── The bid ladder ───────────────────────────────────────────────────

/**
 * `GET /collections/{slug}/offer_aggregates`: real depth, already bucketed by
 * price, which is the whole bid book rather than one page of orders.
 *
 * It publishes no order hash, so a level cannot be lifted from here alone. That
 * is the right trade for a ladder: a page of raw orders shows the levels it
 * happens to contain, and a depth curve missing its middle is worse than one
 * that cannot be clicked.
 */
export function parseOfferAggregates(
  raw: unknown,
  ctx: ParseContext,
): { offers: Array<NftOffer>; cursor?: string } {
  const body = asObject(raw)
  const offers: Array<NftOffer> = []

  for (const entry of asArray(body?.['offer_aggregates'])) {
    const level = asObject(entry)
    if (!level) continue
    const priceBlock = asObject(level['offer_price'])
    const price = unitsFromDenominated(priceBlock?.['token_unit'])
    if (price === undefined || price <= 0) continue

    const bidders = asArray(level['bidders'])
      .map((bidder) => asObject(bidder))
      .filter((bidder): bidder is Json => bidder !== null)
    const quantity =
      bidders.reduce(
        (sum, bidder) => sum + (asNumber(bidder['quantity']) ?? 0),
        0,
      ) ||
      asNumber(level['total_offers']) ||
      1

    const offer: NftOffer = {
      price,
      priceCurrency: asString(priceBlock?.['symbol']) ?? ctx.priceCurrency,
      quantity,
      marketplace: OPENSEA_MARKETPLACE,
    }
    const priceUsd = asNumber(priceBlock?.['usd_price'])
    if (priceUsd !== undefined) offer.priceUsd = priceUsd
    // One bidder at a level is a bidder worth naming; several are a level.
    if (bidders.length === 1) {
      const address = asString(bidders[0]?.['address'])
      if (address) offer.bidder = address
    }
    offers.push(offer)
  }

  offers.sort((a, b) => b.price - a.price)
  const cursor = asString(body?.['next'])
  return cursor ? { offers, cursor } : { offers }
}

/**
 * Raw collection offers, aggregated into levels ourselves.
 *
 * The fallback for when the aggregates endpoint is unavailable, and the only
 * path that carries an order hash and an expiry per level. Aggregation is by
 * price and trait scope: an offer for "any 5 tokens at 3.1" and another for
 * "any 2 at 3.1" are seven units of executable size at one price, which is what
 * makes an NFT bid side a depth curve at all. The representative order id kept
 * for a level is the largest one, because that is the order a seller hitting
 * the level will be routed into first.
 */
export function parseOffers(
  raw: unknown,
  ctx: ParseContext,
): { offers: Array<NftOffer>; cursor?: string } {
  const body = asObject(raw)
  const levels = new Map<string, NftOffer>()
  const levelBest = new Map<string, number>()

  for (const entry of asArray(body?.['offers'])) {
    const order = asObject(entry)
    if (!order) continue
    const status = asString(order['status'])
    if (status && status !== 'ACTIVE') continue

    // An offer's price is flat, where a listing's is under `.current`.
    const price = asObject(order['price'])
    const total = unitsFromRaw(price?.['value'], price?.['decimals'])
    if (total === undefined || total <= 0) continue
    const currency = asString(price?.['currency']) ?? ctx.priceCurrency

    const parameters = seaportParameters(order)
    // The NFT side of a collection offer sits in the consideration: its
    // startAmount is how many items the bidder will take.
    const wanted = asArray(parameters?.['consideration'])
      .map((item) => asObject(item))
      .find(
        (item) => item && NFT_ITEM_TYPES.has(asNumber(item['itemType']) ?? -1),
      )
    const quantity =
      asNumber(order['remaining_quantity']) ??
      asNumber(wanted?.['startAmount']) ??
      1
    // `price` is what the bidder pays in total, so a five-item offer prices per
    // item only after the division. Getting this backwards inverts the ladder.
    const unit = quantity > 0 ? total / quantity : total

    const criteria = asObject(order['criteria'])
    const trait = asObject(asArray(criteria?.['traits'])[0])
    const traitKey = asString(trait?.['type'])
    const traitValue = asString(trait?.['value'])
    const tokenId = asString(asObject(order['asset'])?.['identifier'])

    const key = `${unit.toFixed(12)}|${currency}|${traitKey ?? ''}|${traitValue ?? ''}|${tokenId ?? ''}`
    const existing = levels.get(key)
    if (existing) {
      existing.quantity += quantity
      if (quantity > (levelBest.get(key) ?? 0)) {
        levelBest.set(key, quantity)
        const orderId = asString(order['order_hash'])
        if (orderId) existing.orderId = orderId
        const bidder = asString(parameters?.['offerer'])
        if (bidder) existing.bidder = bidder
      }
      continue
    }

    const offer: NftOffer = {
      price: unit,
      priceCurrency: currency,
      quantity,
      marketplace: OPENSEA_MARKETPLACE,
    }
    const priceUsd = usd(
      unit,
      isSettlementCurrency(currency, ctx.priceCurrency)
        ? ctx.usdRate
        : undefined,
    )
    if (priceUsd !== undefined) offer.priceUsd = priceUsd
    if (traitKey && traitValue)
      offer.trait = { key: traitKey, value: traitValue }
    if (tokenId) offer.tokenId = tokenId
    const bidder = asString(parameters?.['offerer'])
    if (bidder) offer.bidder = bidder
    const expires = toMs(parameters?.['endTime'])
    if (expires !== undefined) offer.expiresMs = expires
    const orderId = asString(order['order_hash'])
    if (orderId) offer.orderId = orderId

    levels.set(key, offer)
    levelBest.set(key, quantity)
  }

  const offers = [...levels.values()].sort((a, b) => b.price - a.price)
  const cursor = asString(body?.['next'])
  return cursor ? { offers, cursor } : { offers }
}

// ── The tape ─────────────────────────────────────────────────────────

/**
 * Sale events into prints.
 *
 * Two things this does that are not obvious. The token sits under `nft` on a
 * sale and under `asset` on an order, and the events feed mixes both when more
 * than one `event_type` is asked for, so the type is checked before the shape
 * is read. And a sale's `payment.quantity` is what the buyer paid in TOTAL,
 * while `quantity` is how many items moved: an ERC-1155 print of five is one
 * event, and dividing is what keeps its price comparable with a floor.
 */
export function parseSaleEvents(
  raw: unknown,
  ctx: ParseContext,
): { sales: Array<NftSale>; cursor?: string } {
  const body = asObject(raw)
  const sales: Array<NftSale> = []

  for (const entry of asArray(body?.['asset_events'])) {
    const event = asObject(entry)
    if (!event) continue
    if (asString(event['event_type']) !== 'sale') continue

    const payment = asObject(event['payment'])
    const paid = unitsFromRaw(payment?.['quantity'], payment?.['decimals'])
    if (paid === undefined) continue
    const items = Math.max(1, Math.trunc(asNumber(event['quantity']) ?? 1))
    const unit = paid / items

    const nft = asObject(event['nft'])
    const tokenId = asString(nft?.['identifier'])
    if (!tokenId) continue
    const timestampMs =
      toMs(event['closing_date']) ?? toMs(event['event_timestamp'])
    if (timestampMs === undefined) continue

    const currency = asString(payment?.['symbol']) ?? ctx.priceCurrency
    const chain = chainFromVenue(event['chain']) ?? ctx.chain

    const sale: NftSale = {
      tokenId,
      price: unit,
      priceCurrency: currency,
      marketplace: OPENSEA_MARKETPLACE,
      timestampMs,
    }
    sale.chain = chain
    const contract = asString(nft?.['contract']) ?? ctx.contract
    if (contract) sale.contract = contract
    // The caller's own display name wins where it has one; the payload only
    // carries the slug, which is a routing key rather than a label.
    const collectionName = ctx.collectionName ?? asString(nft?.['collection'])
    if (collectionName) sale.collectionName = collectionName
    const name = asString(nft?.['name'])
    if (name) sale.name = name
    const imageUrl =
      asString(nft?.['display_image_url']) ?? asString(nft?.['image_url'])
    if (imageUrl) sale.imageUrl = imageUrl
    const buyer = asString(event['buyer'])
    if (buyer) sale.buyer = buyer
    const seller = asString(event['seller'])
    if (seller) sale.seller = seller
    const txHash = asString(event['transaction'])
    if (txHash) sale.txHash = txHash
    const priceUsd = usd(
      unit,
      isSettlementCurrency(currency, ctx.priceCurrency)
        ? ctx.usdRate
        : undefined,
    )
    if (priceUsd !== undefined) sale.priceUsd = priceUsd

    sales.push(sale)
  }

  sales.sort((a, b) => b.timestampMs - a.timestampMs)
  const cursor = asString(body?.['next'])
  return cursor ? { sales, cursor } : { sales }
}

// ── Items and holdings ───────────────────────────────────────────────

function traitsOf(nft: Json): Array<{ key: string; value: string }> {
  const traits: Array<{ key: string; value: string }> = []
  for (const entry of asArray(nft['traits'])) {
    const trait = asObject(entry)
    const key = asString(trait?.['trait_type'])
    const value = trait?.['value']
    if (!key || value === undefined || value === null) continue
    traits.push({ key, value: String(value) })
  }
  return traits
}

/**
 * The items grid.
 *
 * OpenSea's NFT model carries no rarity rank and no owner, so neither is set.
 * Inventing a rank from trait counts would produce a number that disagrees with
 * the one the collection page shows, which is worse than a blank column.
 */
export function parseNftRecords(
  raw: unknown,
  ctx: ParseContext,
): { items: Array<NftItem>; cursor?: string } {
  const body = asObject(raw)
  const items: Array<NftItem> = []

  for (const entry of asArray(body?.['nfts'])) {
    const nft = asObject(entry)
    if (!nft) continue
    const tokenId = asString(nft['identifier'])
    if (!tokenId) continue
    const item: NftItem = { tokenId, priceCurrency: ctx.priceCurrency }
    const name = asString(nft['name'])
    if (name) item.name = name
    const imageUrl =
      asString(nft['display_image_url']) ?? asString(nft['image_url'])
    if (imageUrl) item.imageUrl = imageUrl
    const traits = traitsOf(nft)
    if (traits.length > 0) item.traits = traits
    items.push(item)
  }

  const cursor = asString(body?.['next'])
  return cursor ? { items, cursor } : { items }
}

/** Best asks merged onto the items grid, so a card can show its own price. */
export function mergeListingsIntoItems(
  items: Array<NftItem>,
  listings: Array<NftListing>,
): Array<NftItem> {
  if (listings.length === 0) return items
  const best = new Map<string, NftListing>()
  for (const listing of listings) {
    const held = best.get(listing.tokenId)
    if (!held || listing.price < held.price) best.set(listing.tokenId, listing)
  }
  return items.map((item) => {
    const listing = best.get(item.tokenId)
    if (!listing) return item
    const priced: NftItem = {
      ...item,
      listPrice: listing.price,
      priceCurrency: listing.priceCurrency,
      marketplace: listing.marketplace,
    }
    if (listing.priceUsd !== undefined) priced.listPriceUsd = listing.priceUsd
    return priced
  })
}

/**
 * A wallet's tokens.
 *
 * `markPrice` and `costBasis` stay absent: OpenSea indexes ownership without
 * indexing what the current owner paid, and a mark would be one collection-offer
 * read per distinct collection in the wallet. A portfolio of thirty collections
 * would spend a twentieth of the hourly budget on a column.
 */
export function parseHoldings(
  raw: unknown,
  chain: NftChain,
  contractFilter?: string,
): { holdings: Array<NftHolding>; cursor?: string } {
  const body = asObject(raw)
  const holdings: Array<NftHolding> = []
  const wanted = contractFilter?.toLowerCase()

  for (const entry of asArray(body?.['nfts'])) {
    const nft = asObject(entry)
    if (!nft) continue
    const tokenId = asString(nft['identifier'])
    const contract = asString(nft['contract'])
    if (!tokenId || !contract) continue
    if (wanted && contract.toLowerCase() !== wanted) continue

    const holding: NftHolding = {
      chain,
      contract,
      tokenId,
      priceCurrency: currencyForChain(chain),
    }
    const collectionName = asString(nft['collection'])
    if (collectionName) holding.collectionName = collectionName
    const name = asString(nft['name'])
    if (name) holding.name = name
    const imageUrl =
      asString(nft['display_image_url']) ?? asString(nft['image_url'])
    if (imageUrl) holding.imageUrl = imageUrl
    holdings.push(holding)
  }

  const cursor = asString(body?.['next'])
  return cursor ? { holdings, cursor } : { holdings }
}

// ── Traits ───────────────────────────────────────────────────────────

/**
 * The trait table.
 *
 * `GET /traits/{slug}` publishes counts per value and nothing else, so
 * `floorPrice` stays absent on every row. A trait floor is one filtered
 * best-listings read per trait VALUE, and a mid-sized collection has several
 * hundred of them: that is the whole hourly budget for one pane. The rarity
 * share is real, and it is what makes the table useful without a price.
 */
export function parseTraits(
  raw: unknown,
  totalSupply?: number,
): Array<NftTraitFloor> {
  const body = asObject(raw)
  const counts = asObject(body?.['counts'])
  if (!counts) return []

  const rows: Array<NftTraitFloor> = []
  for (const [key, values] of Object.entries(counts)) {
    const byValue = asObject(values)
    if (!byValue) continue
    for (const [value, entry] of Object.entries(byValue)) {
      // A count is usually a bare number; a value object is tolerated so a
      // payload that grows a floor does not need this parser rewritten.
      const nested = asObject(entry)
      const count = asNumber(nested ? nested['count'] : entry)
      if (count === undefined) continue
      const row: NftTraitFloor = { key, value, count }
      if (totalSupply && totalSupply > 0) row.rarity = count / totalSupply
      const floor = unitsFromDenominated(nested?.['floor_price'])
      if (floor !== undefined) row.floorPrice = floor
      rows.push(row)
    }
  }
  return rows
}

// ── Floor history ────────────────────────────────────────────────────

/**
 * `GET /collections/{slug}/floor_prices` into series points.
 *
 * A tracked floor, which is the number a collection is actually quoted at, and
 * the reason this connector can serve a series with `basis: 'floor'` rather
 * than only an average of fills.
 */
export function parseFloorPoints(raw: unknown): Array<NftPricePoint> {
  const body = asObject(raw)
  const points: Array<NftPricePoint> = []
  for (const entry of asArray(body?.['floor_prices'])) {
    const point = asObject(entry)
    if (!point) continue
    const timestampMs = toMs(point['time'])
    const floorPrice = unitsFromDenominated(point['token_unit'])
    if (timestampMs === undefined || floorPrice === undefined) continue
    points.push({ timestampMs, floorPrice })
  }
  points.sort((a, b) => a.timestampMs - b.timestampMs)
  return points
}
