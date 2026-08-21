// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the OpenSea connector declares.
 *
 * One plugin serves both halves of the NFT asset class, which is unusual here
 * and is the reason OpenSea was chosen: it is the only NFT venue that answers
 * market data AND accepts a signed order over an API a browser can call. Every
 * other candidate splits those across two vendors, or fails CORS, or both.
 *
 * ## The two secrets, and why they are different things
 *
 * The API key is plugin CONFIG: it authenticates reads and it posts an order to
 * OpenSea's book. It is not a trading credential and it cannot move an asset.
 *
 * The private key is a WALLET, provisioned separately through `initialize` and
 * never held by this plugin, only reached through an id-scoped accessor the
 * terminal refuses for any other wallet id. `metadata.walletChain` is what
 * enrols the connector in that provisioning. Buying an NFT is an on-chain
 * transaction and listing one is an EIP-712 signature, so the key that signs is
 * the user's own and lives in the OS keychain or the browser vault, exactly as
 * it does for the DEX connectors.
 *
 * ## Timeframes, and what a floor actually is
 *
 * OpenSea publishes a real floor series at
 * `/collections/{slug}/floor_prices?timeframe=&resolution=`, down to one
 * minute, on a free key and over open CORS. That is rarer than it sounds: it is
 * the only browser-callable per-collection floor history there is, and it is
 * why the intraday steps are here at all.
 *
 * It returns floor POINTS, not OHLC. Candlesticks are bucketed from the sales
 * tape instead, and the two are different numbers: a floor is the cheapest ask,
 * an average of fills is not. `NftSeriesBasis` travels with every series so the
 * chart says which one it drew rather than implying.
 *
 * These timeframes are OpenSea's own. A chain served by the keyless CoinGecko
 * fallback is daily-granularity, so a board reads its timeframes off the
 * provider that resolved, never off the asset class.
 */
import type { PluginManifest } from '@pairlens/plugin-system/types'

/**
 * Chains OpenSea indexes that we address.
 *
 * Reads span all of these. Signing does NOT: `TRADABLE_CHAINS` in `types.ts` is
 * deliberately narrower, because OpenSea validates the API key before the chain
 * and a route that answers 401 for a nonsense chain proves nothing about which
 * chains take an order.
 */
export const OPENSEA_MARKETS = [
  'ethereum',
  'base',
  'polygon',
  'arbitrum',
  'optimism',
  'solana',
]

export const OPENSEA_TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d']

export const openSeaNftManifest: PluginManifest = {
  id: 'opensea-nft-connector',
  name: 'OpenSea',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'NFT collections, the listings and offers book, the sales tape and Seaport order execution. Add your own OpenSea key: they are free and issued instantly.',
  homepage: 'https://opensea.io',
  icon: '/posters/opensea-nft-connector.png',
  metadata: {
    assetClass: 'nft',
    family: 'nfts',
    timeframes: OPENSEA_TIMEFRAMES,
    gradient: 'from-sky-400 to-blue-600',
    abbr: 'OS',
    walletChain: 'ethereum',
  },
  capabilities: [
    {
      id: 'market-data:nft',
      singleton: false,
      markets: OPENSEA_MARKETS,
      priority: 5,
      streaming: false,
    },
    {
      id: 'market-data:candles',
      singleton: false,
      markets: OPENSEA_MARKETS,
      priority: 5,
      streaming: true,
    },
    {
      id: 'market-data:history',
      singleton: false,
      markets: OPENSEA_MARKETS,
      priority: 5,
      streaming: false,
    },
    {
      id: 'market-data:ticker',
      singleton: false,
      markets: OPENSEA_MARKETS,
      priority: 5,
      streaming: true,
    },
    {
      id: 'market-data:discovery:search',
      singleton: false,
      markets: OPENSEA_MARKETS,
      priority: 5,
      streaming: false,
    },
    {
      // `sideEffect` stops the plugin manager re-running a failed placement
      // against a fallback provider. A thrown error does not prove the order
      // was rejected, and an NFT buy that in fact landed must never be retried.
      id: 'trading:orders',
      singleton: false,
      markets: OPENSEA_MARKETS,
      priority: 5,
      streaming: false,
      sideEffect: true,
    },
  ],
  config: {
    apiKey: {
      type: 'secret',
      label: 'OpenSea API Key',
      // Required, unlike the Helius key. There is no keyless OpenSea tier to
      // degrade to, so a connector activated without one would answer every
      // read with the same 401 and look broken rather than unconfigured.
      required: true,
    },
  },
}
