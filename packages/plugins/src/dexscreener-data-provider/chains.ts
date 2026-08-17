// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pairlens market id → DexScreener chain id.
 *
 * DexScreener happens to name every chain we ship exactly the way our own
 * connectors do, with one exception: Solana's connector is Jupiter, an
 * aggregator rather than a chain module, so the market id is `jupiter` and the
 * chain id is `solana`. Every id below was read back off a live
 * `/token-pairs/v1/{chainId}/{tokenAddress}` response rather than assumed, and
 * the response echoes `chainId`, which is what pins the mapping.
 *
 * An unknown market returns null, and the caller refuses. This is the one place
 * the sibling providers get it wrong on purpose and pay for it: GeckoTerminal's
 * `networkForMarket` defaults to Solana, so a pool pane bound to a chain it does
 * not know silently answers about Solana instead. A refusal is a state the pane
 * can render; a wrong chain is not.
 */

const MARKET_CHAIN_IDS: Record<string, string> = {
  jupiter: 'solana',
  solana: 'solana',
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  bsc: 'bsc',
  polygon: 'polygon',
  optimism: 'optimism',
  avalanche: 'avalanche',
}

export function chainIdForMarket(market: string | undefined): string | null {
  if (!market) return null
  return MARKET_CHAIN_IDS[market] ?? null
}

/** Every market id this provider can answer for. Test/diagnostic seam. */
export function supportedMarkets(): Array<string> {
  return Object.keys(MARKET_CHAIN_IDS)
}
