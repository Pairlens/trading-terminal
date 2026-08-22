// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Contract address to OpenSea slug, once per session.
 *
 * Our identity is `chain + contract`, because that is the only thing two
 * marketplaces agree on. Almost every OpenSea read below the collection level
 * is addressed by the venue's own slug instead, so something has to translate,
 * and the translation is worth caching hard: a slug never changes, and a board
 * with eight panes open on one collection would otherwise spend eight requests
 * out of a 600-an-hour budget learning the same string.
 *
 * The lookup itself is the cheapest route that carries a slug: one NFT from the
 * contract, whose record names its collection. There is no dedicated
 * contract-to-slug endpoint, and `GET /chain/{chain}/contract/{address}` answers
 * with the contract only.
 */
import { openSeaFetch } from './http'
import { OPENSEA_CHAIN, slugCacheKey } from './types'

import type { NftChain } from '@pairlens/shared/nft-types'
import type { SlugCache } from './types'

const slugs: SlugCache = new Map()

/** An EVM contract address. */
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/
/** A base58 account, which is what a Solana collection is addressed by. */
const BASE58_ACCOUNT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/**
 * Whether a caller's `contract` is an on-chain address or already a slug.
 *
 * Slugs travel through the same field as addresses because a Discovery row for
 * a chain we cannot resolve an address on still has to open. Anything that is
 * not shaped like an address is taken at face value and never looked up, which
 * also means a slug costs zero requests.
 */
export function looksLikeAddress(chain: NftChain, value: string): boolean {
  if (EVM_ADDRESS.test(value)) return true
  return chain === 'solana' && BASE58_ACCOUNT.test(value)
}

/**
 * Teach the cache a slug learned somewhere else.
 *
 * The collection detail and every ranked row already carry both halves, so a
 * board that opened from Discovery has usually paid for this lookup before it
 * is asked for.
 */
export function primeSlug(
  chain: NftChain,
  contract: string,
  slug: string,
): void {
  if (!slug) return
  slugs.set(slugCacheKey(chain, contract), slug)
}

export function cachedSlug(
  chain: NftChain,
  contract: string,
): string | undefined {
  return slugs.get(slugCacheKey(chain, contract))
}

export function clearSlugCache(): void {
  slugs.clear()
}

type NftListResponse = {
  nfts?: Array<{ collection?: string }>
}

/**
 * The slug for a collection, resolved once and remembered.
 *
 * Throws rather than returning null when the contract is not indexed. A null
 * here would travel up as "this collection has no listings", which is a claim
 * about the market rather than about our lookup.
 */
export async function resolveSlug(
  apiKey: string,
  chain: NftChain,
  contract: string,
): Promise<string> {
  const trimmed = contract.trim()
  if (!trimmed) throw new Error('OpenSea: no collection was addressed.')

  const cached = slugs.get(slugCacheKey(chain, trimmed))
  if (cached) return cached

  if (!looksLikeAddress(chain, trimmed)) {
    slugs.set(slugCacheKey(chain, trimmed), trimmed)
    return trimmed
  }

  const venueChain = OPENSEA_CHAIN[chain]
  const body = await openSeaFetch<NftListResponse>(
    apiKey,
    `/chain/${venueChain}/contract/${trimmed.toLowerCase()}/nfts?limit=1`,
  )
  const slug = body.nfts?.[0]?.collection
  if (!slug) {
    throw new Error(
      `OpenSea does not index ${trimmed} on ${chain}. It may be a contract OpenSea has not crawled, or the wrong chain for this address.`,
    )
  }
  slugs.set(slugCacheKey(chain, trimmed), slug)
  return slug
}
