// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Rows captured from the live DexScreener API on 2026-08-17, trimmed to the
 * fields this provider reads plus the ones it deliberately ignores.
 *
 * Captured rather than invented because the parser's whole job is to agree with
 * a shape nobody here controls: which fields are strings, which are numbers,
 * which simply are not there on a pool the index barely knows. Two of the four
 * rows below exist only to carry an absence.
 */
import type { RawDexScreenerPair } from '../pool-stats-client'

/**
 * `/latest/dex/pairs/solana/Czfq3xZZ…` — Orca's SOL/USDC whirlpool.
 * The reference row: reserves on both sides, and they reconcile against the
 * row's own prices (208666 SOL + 9.86M USDC = the $25.68M it reports).
 */
export const ORCA_SOL_USDC: RawDexScreenerPair = {
  chainId: 'solana',
  dexId: 'orca',
  pairAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  labels: ['wp'],
  baseToken: {
    address: 'So11111111111111111111111111111111111111112',
    name: 'Wrapped SOL',
    symbol: 'SOL',
  },
  quoteToken: {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    name: 'USD Coin',
    symbol: 'USDC',
  },
  priceNative: '75.8114',
  priceUsd: '75.81',
  txns: {
    m5: { buys: 167, sells: 185 },
    h1: { buys: 905, sells: 899 },
    h24: { buys: 13769, sells: 13437 },
  },
  volume: { h24: 49101263.35, h6: 13759647.59, h1: 3648410.5, m5: 468286.18 },
  priceChange: { m5: -0.02, h1: 0.32, h6: 0.66, h24: 0.66 },
  liquidity: { usd: 25683220.42, base: 208666, quote: 9863877 },
  pairCreatedAt: 1688106058000,
}

/**
 * `/latest/dex/pairs/ethereum/0xE0554a47…` — a Uniswap v3 WETH/USDC pool.
 * Carries `labels: ['v3']` (a pool VERSION, never a fee tier) and the
 * checksummed address the endpoint echoes back whatever case it was asked in.
 */
export const UNISWAP_V3_WETH_USDC: RawDexScreenerPair = {
  chainId: 'ethereum',
  dexId: 'uniswap',
  pairAddress: '0xE0554a476A092703abdB3Ef35c80e0D76d32939F',
  labels: ['v3'],
  baseToken: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  quoteToken: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    name: 'USD Coin',
    symbol: 'USDC',
  },
  priceNative: '1905.6059',
  priceUsd: '1905.60',
  txns: { h1: { buys: 418, sells: 406 }, h24: { buys: 7589, sells: 8227 } },
  volume: { h24: 34930431.94, h1: 2117941.88 },
  priceChange: { h1: 0.21, h24: 1.28 },
  liquidity: { usd: 5294840.12, base: 1580.575, quote: 2282886 },
  fdv: 4245833882,
  marketCap: 4228703520,
  pairCreatedAt: 1636926269000,
}

/**
 * A pump.fun row from `/latest/dex/search`. No `liquidity` object at all, and
 * that absence is the fixture: every reserve cell has to collapse rather than
 * read zero.
 */
export const PUMPFUN_NO_LIQUIDITY: RawDexScreenerPair = {
  chainId: 'solana',
  dexId: 'pumpfun',
  pairAddress: 'DcPptWhgopTPAVuBg48nf81C651WkmrfCSqEM82y8iae',
  baseToken: {
    address: '8cmK4vWFRPMttT49MuDG5p6c2zMnr4xg9eVE8DgMpump',
    name: 'United States Dog Coin',
    symbol: 'USDC',
  },
  quoteToken: {
    address: 'So11111111111111111111111111111111111111112',
    name: 'Wrapped SOL',
    symbol: 'SOL',
  },
  priceNative: '0.00000005693',
  priceUsd: '0.000004319',
  txns: { h24: { buys: 32, sells: 7 } },
  volume: { h24: 2420.9 },
  priceChange: { h24: 90.74 },
  fdv: 4319.77,
  marketCap: 4319.77,
  pairCreatedAt: 1786979281000,
}

/**
 * An Aerodrome row with no `pairCreatedAt`. Whole venues omit it, so pool age
 * has to be unknown rather than 1970.
 */
export const AERODROME_NO_CREATED_AT: RawDexScreenerPair = {
  chainId: 'base',
  dexId: 'aerodrome',
  pairAddress: '0x1131DB5977242a03eBeaD1aCD18F80A9A29e5922',
  baseToken: {
    address: '0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82',
    name: 'Solana',
    symbol: 'SOL',
  },
  quoteToken: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    name: 'USD Coin',
    symbol: 'USDC',
  },
  priceNative: '75.7804',
  priceUsd: '75.78',
  txns: { h24: { buys: 5824, sells: 5544 } },
  volume: { h24: 5983573.09, h1: 355891.81 },
  priceChange: { h24: 0.49, h1: 0.36 },
  liquidity: { usd: 363076.13, base: 2332.5344, quote: 186315 },
  fdv: 16351778,
}

/**
 * `/token-pairs/v1/base/0x4200…0006` — WETH's pools on Base, in the order the
 * endpoint returned them. The deepest arrives FOURTH, which is the whole reason
 * the resolver ranks rather than taking `[0]`.
 */
export const BASE_WETH_TOKEN_PAIRS: Array<RawDexScreenerPair> = [
  {
    chainId: 'base',
    dexId: 'uniswap',
    pairAddress: '0xb4CB800910B228ED3d0834cF79D697127BBB00e5',
    labels: ['v3'],
    baseToken: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
    },
    quoteToken: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
    },
    priceUsd: '1905.84',
    priceNative: '1905.8410',
    volume: { h24: 5765090.8 },
    liquidity: { usd: 321292.28, base: 84.2513, quote: 160865 },
  },
  {
    chainId: 'base',
    dexId: 'pancakeswap',
    pairAddress: '0x0f8B4C8f1a8b52C6C0BdD70e0D2Db4Dc1d4F0dE1',
    baseToken: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
    },
    quoteToken: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
    },
    priceUsd: '1905.71',
    priceNative: '1905.7100',
    volume: { h24: 1_186_000 },
    liquidity: { usd: 4030035.25, base: 1000, quote: 2100000 },
  },
  {
    chainId: 'base',
    dexId: 'aerodrome',
    pairAddress: '0x3FE04A5901CBb9Bd23a4E1E9Bd1e05Fb3d21F0F2',
    baseToken: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
    },
    quoteToken: {
      address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
      symbol: 'DEGEN',
    },
    priceUsd: '1905.10',
    priceNative: '540000',
    volume: { h24: 6_200_000 },
    liquidity: { usd: 6202172.09, base: 1600, quote: 900000 },
  },
  {
    chainId: 'base',
    dexId: 'uniswap',
    pairAddress: '0xd0b53D9277642d899DF5C87A3966A349A798F224',
    labels: ['v3'],
    baseToken: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
    },
    quoteToken: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
    },
    priceUsd: '1905.90',
    priceNative: '1905.9000',
    volume: { h24: 58_000_000 },
    liquidity: { usd: 111667578.19, base: 29000, quote: 56000000 },
  },
]

/**
 * Three rows the live `/latest/dex/search?q=SOL USDC` returns for Solana, each
 * reporting over a billion dollars of liquidity against forty-odd trades a day,
 * while Orca's and Raydium's actual SOL/USDC markets appear nowhere in the
 * result. They are here as the evidence behind the resolver refusing to rank a
 * text search at all.
 */
export const HOSTILE_SEARCH_ROWS: Array<RawDexScreenerPair> = [
  {
    chainId: 'solana',
    dexId: 'raydium',
    pairAddress: '7DYVdkbhQ5ZgeJNhVBBDnvhbfoJeGrF46EGeDaohT6Hu',
    labels: ['CLMM'],
    baseToken: { symbol: 'SOL' },
    quoteToken: { symbol: 'USDC' },
    volume: { h24: 365284 },
    txns: { h24: { buys: 24, sells: 25 } },
    liquidity: { usd: 1597170088.69, base: 20997412, quote: 7035.92 },
  },
  {
    chainId: 'solana',
    dexId: 'raydium',
    pairAddress: 'CDmkyLDvCxNGvZ8bLh8xhoBLZ1PGCkkNqQxsw4Uv6nQF',
    baseToken: { symbol: 'SOL' },
    quoteToken: { symbol: 'USDC' },
    volume: { h24: 360814 },
    txns: { h24: { buys: 22, sells: 22 } },
    liquidity: { usd: 1632045898, base: 21400000, quote: 6800 },
  },
  {
    chainId: 'solana',
    dexId: 'raydium',
    pairAddress: 'FqQKCJYCa1Zt3PjD5c8QhkPqTKPPqM1eKMcgnHsD1oZG',
    baseToken: { symbol: 'SOL' },
    quoteToken: { symbol: 'USDC' },
    volume: { h24: 360814 },
    txns: { h24: { buys: 22, sells: 22 } },
    liquidity: { usd: 1627150174, base: 21300000, quote: 6700 },
  },
]
