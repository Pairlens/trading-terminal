// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Internal shapes for the OpenSea connector: the chain table, the slug cache
 * and the wallet slot.
 *
 * Nothing here is a wire type. What crosses the plugin boundary is defined in
 * `@pairlens/shared/nft-types`, and this module exists so the read half and the
 * trading half of the connector agree on the things neither of them owns.
 */
import type { NftChain } from '@pairlens/shared/nft-types'

/** OpenSea's own chain slug for each chain we address. */
export const OPENSEA_CHAIN: Readonly<Record<NftChain, string>> = {
  ethereum: 'ethereum',
  base: 'base',
  polygon: 'matic',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  // Present so the record is exhaustive. OpenSea does index Solana, but its
  // Solana orders are not Seaport, so the trading half refuses it explicitly
  // rather than building a transaction the chain cannot execute.
  solana: 'solana',
}

/** EIP-155 ids, for the viem chain the wallet client is built on. */
export const EVM_CHAIN_ID: Readonly<Partial<Record<NftChain, number>>> = {
  ethereum: 1,
  base: 8453,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
}

/** The settlement currency a chain's floors are quoted in. */
export const CHAIN_CURRENCY: Readonly<Record<NftChain, string>> = {
  ethereum: 'ETH',
  base: 'ETH',
  arbitrum: 'ETH',
  optimism: 'ETH',
  polygon: 'POL',
  solana: 'SOL',
}

/**
 * Chains this connector will sign an order on.
 *
 * Deliberately narrower than the chains it READS. OpenSea's order endpoints
 * check the API key before they validate the chain, so probing cannot tell you
 * which chains actually accept a Seaport order, and a connector that offers a
 * ticket it cannot fill is worse than one that says so. Widen this only against
 * a real key and a real fill.
 */
export const TRADABLE_CHAINS: ReadonlyArray<NftChain> = [
  'ethereum',
  'base',
]

export function isTradableChain(chain: NftChain): boolean {
  return TRADABLE_CHAINS.includes(chain)
}

/**
 * The wallet binding, provisioned through `initialize`.
 *
 * Identical in shape and in discipline to the DEX connectors' slot: the private
 * key is never held, only an id-scoped accessor that the terminal refuses for
 * any other wallet id, and `getSlot` fails CLOSED so a provided-but-unknown
 * wallet id resolves to nothing rather than falling back to the first slot.
 */
export type WalletSlot = {
  walletId: string
  address: string
  getPrivateKey: (() => Promise<string | null>) | null
}

/**
 * A collection's OpenSea slug, learned from a contract address.
 *
 * Every OpenSea read below the collection level is slug-addressed, while our
 * identity is `chain + contract` (which is the only thing two marketplaces
 * agree on). So one lookup translates, and it is cached for the session: a
 * slug does not change, and re-resolving it per pane would spend a third of a
 * 600-reads-an-hour budget on a string.
 */
export type SlugCache = Map<string, string>

export function slugCacheKey(chain: NftChain, contract: string): string {
  return `${chain}:${contract.toLowerCase()}`
}

/** What the trading half needs from the read half, and nothing more. */
export type OpenSeaRequest = <T>(
  path: string,
  init?: { method?: string; body?: unknown; priority?: 'high' | 'low' },
) => Promise<T>
