// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Supported EVM chains for on-chain DEX trading.
 *
 * Each chain is exposed as its own Pairlens market (market id = chain slug,
 * which deliberately matches the DexPaprika network slug so the wildcard data
 * providers resolve pools on the right network). All chains share the
 * 'ethereum' wallet chain — one EVM private key works everywhere.
 */

export type EvmChainConfig = {
  /** Pairlens market id AND DexPaprika network slug. */
  market: string
  displayName: string
  /** Short uppercase label for UI chips. */
  abbr: string
  chainId: number
  /** KyberSwap aggregator API path segment. */
  kyberSlug: string
  /** GeckoTerminal network slug (token discovery + market data). */
  geckoNetwork: string
  /** Chain logo for the venue selector / plugin store. */
  iconUrl: string
  /** Default public JSON-RPC endpoint (CORS-friendly). */
  rpcUrl: string
  /** Block explorer root, for linking a confirmed swap to its transaction. */
  explorerUrl: string
  nativeSymbol: string
  wrappedNativeAddress: string
  /** Canonical USD-stable quote token for generated pairs. */
  quote: { symbol: string; address: string; decimals: number }
}

export const EVM_CHAINS: Record<string, EvmChainConfig> = {
  ethereum: {
    market: 'ethereum',
    displayName: 'Ethereum',
    abbr: 'ETH',
    chainId: 1,
    kyberSlug: 'ethereum',
    geckoNetwork: 'eth',
    iconUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    nativeSymbol: 'ETH',
    wrappedNativeAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    quote: {
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
  },
  base: {
    market: 'base',
    displayName: 'Base',
    abbr: 'BASE',
    chainId: 8453,
    kyberSlug: 'base',
    geckoNetwork: 'base',
    iconUrl:
      'https://coin-images.coingecko.com/asset_platforms/images/131/small/base-network.png',
    rpcUrl: 'https://base-rpc.publicnode.com',
    explorerUrl: 'https://basescan.org',
    nativeSymbol: 'ETH',
    wrappedNativeAddress: '0x4200000000000000000000000000000000000006',
    quote: {
      symbol: 'USDC',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
  },
  arbitrum: {
    market: 'arbitrum',
    displayName: 'Arbitrum',
    abbr: 'ARB',
    chainId: 42161,
    kyberSlug: 'arbitrum',
    geckoNetwork: 'arbitrum',
    iconUrl: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=040',
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
    explorerUrl: 'https://arbiscan.io',
    nativeSymbol: 'ETH',
    wrappedNativeAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    quote: {
      symbol: 'USDC',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
    },
  },
  bsc: {
    market: 'bsc',
    displayName: 'BNB Chain',
    abbr: 'BNB',
    chainId: 56,
    kyberSlug: 'bsc',
    geckoNetwork: 'bsc',
    iconUrl: 'https://cryptologos.cc/logos/bnb-bnb-logo.png?v=040',
    rpcUrl: 'https://bsc-rpc.publicnode.com',
    explorerUrl: 'https://bscscan.com',
    nativeSymbol: 'BNB',
    wrappedNativeAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    // USDT dominates BSC liquidity; USDC pools are comparatively thin.
    quote: {
      symbol: 'USDT',
      address: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
    },
  },
  polygon: {
    market: 'polygon',
    displayName: 'Polygon',
    abbr: 'POL',
    chainId: 137,
    kyberSlug: 'polygon',
    geckoNetwork: 'polygon_pos',
    iconUrl: 'https://cryptologos.cc/logos/polygon-matic-logo.png?v=040',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    explorerUrl: 'https://polygonscan.com',
    nativeSymbol: 'POL',
    wrappedNativeAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    quote: {
      symbol: 'USDC',
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      decimals: 6,
    },
  },
}

/** Resolve the viem chain object for a market (dynamic import, code-split). */
export async function getViemChain(market: string) {
  const chains = await import('viem/chains')
  switch (market) {
    case 'ethereum':
      return chains.mainnet
    case 'base':
      return chains.base
    case 'arbitrum':
      return chains.arbitrum
    case 'bsc':
      return chains.bsc
    case 'polygon':
      return chains.polygon
    case 'sepolia':
      // Testnet — used only by the opt-in testnet verification suite
      return chains.sepolia
    default:
      throw new Error(`Unsupported EVM market: ${market}`)
  }
}
