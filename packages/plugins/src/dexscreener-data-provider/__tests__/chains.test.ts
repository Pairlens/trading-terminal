// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chain-id mapping, pinned.
 *
 * Every id here was read back off a live `/token-pairs/v1/{chainId}/{token}`
 * response on 2026-08-17, and the response echoes `chainId`, which is what makes
 * this a measurement rather than a guess. A wrong id does not fail loudly: the
 * endpoint answers `200` with an empty array, so the pane would report "no pool
 * on this chain" for a chain that has thousands.
 */
import { describe, expect, it } from 'bun:test'

import { EVM_CHAINS } from '../../evm-dex-connector/chains'
import { chainIdForMarket, supportedMarkets } from '../chains'

/**
 * The markets a DEX pane can actually be bound to, read from the connectors
 * themselves rather than restated. A new EVM chain therefore fails HERE until
 * its DexScreener id has been verified, instead of silently reporting no pools.
 */
const DEX_CHAIN_MARKETS = [
  'jupiter',
  ...Object.values(EVM_CHAINS).map((chain) => chain.market),
]

describe('chainIdForMarket', () => {
  it('maps every chain the terminal ships a DEX connector for', () => {
    expect(
      Object.fromEntries(
        DEX_CHAIN_MARKETS.map((market) => [market, chainIdForMarket(market)]),
      ),
    ).toEqual({
      jupiter: 'solana',
      ethereum: 'ethereum',
      base: 'base',
      arbitrum: 'arbitrum',
      bsc: 'bsc',
      polygon: 'polygon',
    })
  })

  it('names Solana by its chain, not by its aggregator', () => {
    // The one market id that is not its own chain id: Solana's connector is
    // Jupiter, an aggregator rather than a chain module.
    expect(chainIdForMarket('jupiter')).toBe('solana')
    expect(chainIdForMarket('solana')).toBe('solana')
  })

  it('uses the chain name where GeckoTerminal uses a slug of its own', () => {
    // GeckoTerminal says `eth`, `polygon_pos`, `avax`. DexScreener does not, so
    // a network slug must never be forwarded between the two providers.
    expect(chainIdForMarket('polygon')).toBe('polygon')
    expect(chainIdForMarket('ethereum')).toBe('ethereum')
    expect(chainIdForMarket('avalanche')).toBe('avalanche')
  })

  it('refuses a market it does not know instead of defaulting to one', () => {
    // The failure this avoids: GeckoTerminal's equivalent defaults to Solana, so
    // a pane bound to an unknown venue silently reports Solana's pools.
    expect(chainIdForMarket('coinbase')).toBeNull()
    expect(chainIdForMarket('kalshi')).toBeNull()
    expect(chainIdForMarket('')).toBeNull()
    expect(chainIdForMarket(undefined)).toBeNull()
  })

  it('lists only markets it can actually answer for', () => {
    for (const market of supportedMarkets()) {
      expect(chainIdForMarket(market), market).toBeTruthy()
    }
  })
})
