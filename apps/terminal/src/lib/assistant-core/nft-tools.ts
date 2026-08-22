// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── NFT collections, as tools ────────────────────────────────────────
//
// Three tools, matching the three questions an NFT trader actually asks.
// `list_nft_collections` ranks a chain, which is "what is running". `
// get_nft_collection` reads one collection's state, which is "how is this
// one doing". `get_nft_book` reads both sides of its ladder, which is the
// only one of the three that answers "can I actually get filled" and is
// therefore the one worth having at all: a floor with two items behind it
// and a floor with two hundred are the same number and completely
// different markets.
//
// There is deliberately no tool that places an NFT order. Trades reach the
// user as confirm-card proposals through the shared guarded path, the same
// as every other asset class, and a tool that signed one directly would be
// the one place in the terminal where an order skipped the vault seal and
// the risk locks.
//
// Reads go through `pluginManager.execute`, unlike the prediction tools'
// fan-out, because there is exactly one answer here. OpenSea serves it,
// CoinGecko is the keyless fallback the manager walks to when the first one
// throws, and that IS the behaviour we want. The prediction fan-out exists
// because each venue is a separate market; two NFT providers describing one
// collection are two descriptions of the same thing.
//
// Nothing throws. A throw ends the turn, so every failure leaves as data.

import { tool } from 'ai'
import { z } from 'zod'

import { NFT_CHAINS } from '@pairlens/shared/nft-types'
import type { ToolSet } from 'ai'
import type {
  NftBook,
  NftChain,
  NftCollectionSummary,
  NftCollectionsResult,
} from '@pairlens/shared/nft-types'

import type { AssistantDeps } from './tool-deps'

const CHAIN = z
  .enum(NFT_CHAINS as unknown as [NftChain, ...Array<NftChain>])
  .describe(
    'Chain the collection lives on. A collection IS its chain plus its contract, so the same art on two chains is two markets.',
  )

const CONTRACT = z
  .string()
  .describe(
    'Collection contract address, or the marketplace slug where a chain has no contract to point at.',
  )

/** Failures leave as data, so a dead provider does not end the turn. */
function failure(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : String(error) }
}

/**
 * What the model gets to see about a collection.
 *
 * Trimmed hard on purpose. The full summary carries a description and a
 * banner, which cost tokens on every row of a fifty-row ranking and answer
 * nothing a trader asked. Prices stay in the collection's own settlement
 * currency and the ticker travels with them, because a model handed a bare
 * number will assume ETH and be wrong by two orders of magnitude on Polygon.
 */
function brief(c: NftCollectionSummary): Record<string, unknown> {
  return {
    name: c.name,
    chain: c.chain,
    contract: c.contract,
    currency: c.priceCurrency,
    floor: c.floorPrice,
    floorUsd: c.floorPriceUsd,
    floorChange24h: c.floorChange24h,
    topOffer: c.topOffer,
    volume24h: c.volume24h,
    sales24h: c.sales24h,
    supply: c.totalSupply,
    holders: c.ownerCount,
    listed: c.listedCount,
  }
}

export function buildNftTools(deps: AssistantDeps): ToolSet {
  const { pluginManager } = deps

  return {
    list_nft_collections: tool({
      description:
        'Rank NFT collections on one chain by 24h volume, floor move, sales or market cap. Use for "what NFTs are moving" and "top collections on Base".',
      inputSchema: z.object({
        chain: CHAIN,
        sort: z
          .enum([
            'volume24h',
            'floorChange24h',
            'sales24h',
            'marketCap',
            'newest',
          ])
          .default('volume24h')
          .describe('Ranking axis. `newest` surfaces recent deployments.'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ chain, sort, limit }) => {
        try {
          const result = (await pluginManager.execute('market-data:nft', {
            action: 'collections',
            market: chain,
            sort,
            limit,
          })) as NftCollectionsResult | null
          const collections = result?.collections ?? []
          if (!collections.length) {
            return {
              chain,
              collections: [],
              note: 'No provider returned collections for this chain. An OpenSea API key may be needed, or this chain may not be indexed.',
            }
          }
          return { chain, sort, collections: collections.map(brief) }
        } catch (err) {
          return failure(err)
        }
      },
    }),

    get_nft_collection: tool({
      description:
        "Read one NFT collection's current state: floor, top offer, 24h volume and change, supply, holders and how many are listed.",
      inputSchema: z.object({ chain: CHAIN, contract: CONTRACT }),
      execute: async ({ chain, contract }) => {
        try {
          const collection = (await pluginManager.execute('market-data:nft', {
            action: 'collection',
            market: chain,
            contract,
          })) as NftCollectionSummary | null
          if (!collection) {
            return {
              error: `No indexed collection at ${contract} on ${chain}.`,
            }
          }
          return brief(collection)
        } catch (err) {
          return failure(err)
        }
      },
    }),

    get_nft_book: tool({
      description:
        "Read both sides of a collection's ladder: the cheapest listings (the ask side, item by item) and the standing collection offers (the bid side, with executable size at each price). Use this to answer whether a floor is real, how deep the bid is, and what a sweep would cost.",
      inputSchema: z.object({
        chain: CHAIN,
        contract: CONTRACT,
        depth: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(10)
          .describe('Rungs per side.'),
      }),
      execute: async ({ chain, contract, depth }) => {
        try {
          const book = (await pluginManager.execute('market-data:nft', {
            action: 'book',
            market: chain,
            contract,
          })) as NftBook | null
          if (!book) {
            return { error: `No book available for ${contract} on ${chain}.` }
          }
          const asks = book.asks.slice(0, depth)
          const bids = book.bids.slice(0, depth)
          return {
            currency: book.priceCurrency,
            asOf: new Date(book.asOfMs).toISOString(),
            // The cost of taking the whole visible ask side. The single most
            // useful derived number on an NFT market and the one a model
            // otherwise gets wrong by averaging instead of summing.
            sweepCost: asks.reduce((sum, a) => sum + a.price, 0),
            asks: asks.map((a) => ({
              price: a.price,
              tokenId: a.tokenId,
              rarityRank: a.rarityRank,
              marketplace: a.marketplace,
            })),
            bids: bids.map((b) => ({
              price: b.price,
              quantity: b.quantity,
              marketplace: b.marketplace,
              scope: b.tokenId ? 'token' : b.trait ? 'trait' : 'collection',
            })),
          }
        } catch (err) {
          return failure(err)
        }
      },
    }),
  }
}
