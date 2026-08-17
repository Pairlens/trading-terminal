// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pool state from DexScreener, and the reason this provider exists at all:
 * `liquidity.base` and `liquidity.quote` are BOTH-SIDE reserves in token units,
 * published keyless and with `access-control-allow-origin: *`.
 *
 * Before this, both-side reserves came only from DexPaprika, whose API sends no
 * CORS header and is therefore unreachable from the hosted web terminal and the
 * phone. The pool pane said "Both sides only on desktop" and meant it. The
 * numbers reconcile against the same row's own price, which is what makes them
 * safe to show next to a figure another provider measured: for the live
 * Uniswap v3 WETH/USDC pool, 1588 WETH plus 2.27M USDC came to the same $5.29M
 * the row reported as `liquidity.usd`.
 *
 * What DexScreener does NOT publish, and this module therefore leaves null: a
 * fee tier (`labels: ['v3']` is a pool version, not a fee), the 24h buy/sell
 * notional split, and per-window trader counts. A field the API omits becomes
 * null, never a derived stand-in, for the same reason the sibling providers do
 * it: a number the user could size against has to be one somebody measured.
 */
import { chainIdForMarket } from './chains'
import { resolvePool } from './pool-resolver'
import { dexscreenerFetch as fetch } from './rate-limiter'
import type { PoolStats } from '@pairlens/shared/instrument-types'

export const API_BASE = 'https://api.dexscreener.com'

/** A window's counts, as DexScreener reports them. */
export type RawDexScreenerTxns = { buys?: number; sells?: number }

/**
 * The subset of a DexScreener pair row this provider reads. Everything is
 * optional: the same shape comes back from three endpoints and the thinner
 * rows (a brand-new pump.fun pair) carry neither `liquidity` nor `fdv`.
 */
export type RawDexScreenerPair = {
  chainId?: string
  dexId?: string
  pairAddress?: string
  labels?: Array<string>
  baseToken?: { address?: string; name?: string; symbol?: string }
  quoteToken?: { address?: string; name?: string; symbol?: string }
  /** Base price in QUOTE units, as a string. */
  priceNative?: string
  /** Base price in USD, as a string. */
  priceUsd?: string
  txns?: Record<string, RawDexScreenerTxns>
  volume?: Record<string, number>
  priceChange?: Record<string, number>
  liquidity?: { usd?: number; base?: number; quote?: number }
  fdv?: number
  marketCap?: number
  /** Epoch milliseconds. */
  pairCreatedAt?: number
}

/** `/latest/dex/pairs/{chainId}/{pairAddress}` and `/latest/dex/search`. */
export type RawDexScreenerPairsResponse = {
  pairs?: Array<RawDexScreenerPair> | null
  pair?: RawDexScreenerPair | null
}

/** Parse a numeric string the API sends as a string, or omits entirely. */
export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The venue label, with the pool version the row carries.
 *
 * `dexId` alone collapses every Uniswap generation into "uniswap", and the
 * difference between a v2 and a v3 pool is the difference between reserves that
 * describe the whole curve and reserves that describe one range. `labels` is
 * where DexScreener writes it, so the label reads `uniswap v3`.
 */
export function dexLabel(
  dexId: string | undefined,
  labels: Array<string> | undefined,
): string {
  const base = (dexId ?? '').trim()
  const extra = (labels ?? [])
    .map((l) => String(l).trim())
    .filter((l) => l.length > 0)
  return [base, ...extra].filter((part) => part.length > 0).join(' ')
}

/**
 * Pool creation as an ISO timestamp, which is the shape `PoolStats.createdAt`
 * carries and what the pane's age cell parses. DexScreener sends epoch
 * milliseconds, and omits the field for pools whose deployment it never saw.
 */
export function createdAtIso(pairCreatedAt: unknown): string | null {
  if (typeof pairCreatedAt !== 'number' || !Number.isFinite(pairCreatedAt)) {
    return null
  }
  if (pairCreatedAt <= 0) return null
  const date = new Date(pairCreatedAt)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parsePoolStats(
  raw: RawDexScreenerPair,
  chainId: string,
): PoolStats | null {
  const address = raw.pairAddress
  if (!address) return null

  const baseSymbol = raw.baseToken?.symbol ?? null
  const quoteSymbol = raw.quoteToken?.symbol ?? null
  const priceUsd = numberOrNull(raw.priceUsd)
  const priceInQuote = numberOrNull(raw.priceNative)
  const tx24 = raw.txns?.['h24']

  return {
    // The row's own chainId when it has one: a search result may answer for a
    // different chain than the one asked, and the caller filters on this.
    network: raw.chainId ?? chainId,
    address,
    name:
      baseSymbol && quoteSymbol ? `${baseSymbol} / ${quoteSymbol}` : address,
    dexName: dexLabel(raw.dexId, raw.labels),
    baseSymbol,
    quoteSymbol,
    priceUsd,
    // Not published. It follows from the two prices that are, and only when
    // both are usable (same derivation the DexPaprika parser makes).
    quotePriceUsd:
      priceUsd !== null && priceInQuote !== null && priceInQuote !== 0
        ? priceUsd / priceInQuote
        : null,
    priceInQuote,
    change1hPct: finiteOrNull(raw.priceChange?.['h1']),
    change24hPct: finiteOrNull(raw.priceChange?.['h24']),
    volume1hUsd: finiteOrNull(raw.volume?.['h1']),
    volume24hUsd: finiteOrNull(raw.volume?.['h24']),
    reserveUsd: finiteOrNull(raw.liquidity?.usd),
    // The whole point of this provider. Token units, not raw on-chain units:
    // DexScreener has already applied each token's decimals.
    baseReserve: finiteOrNull(raw.liquidity?.base),
    quoteReserve: finiteOrNull(raw.liquidity?.quote),
    // No fee field, and `labels` carries a pool version rather than a tier.
    feeTier: null,
    trades24h:
      tx24 && (tx24.buys !== undefined || tx24.sells !== undefined)
        ? {
            buys: tx24.buys ?? 0,
            sells: tx24.sells ?? 0,
            // Counted per transaction, not per signer.
            buyers: null,
            sellers: null,
          }
        : null,
    // Not published: the counts are there, the notionals behind them are not.
    buyVolume24hUsd: null,
    sellVolume24hUsd: null,
    createdAt: createdAtIso(raw.pairCreatedAt),
    fdvUsd: finiteOrNull(raw.fdv),
    source: 'dexscreener',
  }
}

/**
 * Read ONE pool by its own address, skipping resolution entirely.
 *
 * This is the path the terminal's reserve supplement takes, and the reason it
 * can merge two providers' numbers safely: the primary already decided WHICH
 * pool the pane is about, so asking about anything else would describe a
 * different pool's depth. The endpoint is case-insensitive on both EVM hex and
 * Solana base58, verified live, so a GeckoTerminal address (lowercased) resolves
 * without normalization.
 *
 * Returns null when the pool is unknown to DexScreener, which is a real answer:
 * the response is `200` with `pair: null`.
 */
export async function fetchPoolByAddress(
  chainId: string,
  poolAddress: string,
): Promise<PoolStats | null> {
  const res = await fetch(
    `${API_BASE}/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(poolAddress)}`,
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`DexScreener pool ${poolAddress}: HTTP ${res.status}`)
  }
  const json = (await res.json()) as RawDexScreenerPairsResponse
  const row = json.pair ?? json.pairs?.[0] ?? null
  if (!row) return null
  return parsePoolStats(row, chainId)
}

/**
 * Resolve the pair's pool and read its state.
 *
 * Returns null when nothing resolves, which the pane renders as "no pool here".
 * THROWS when the request itself fails, so a throttle stays distinguishable
 * from an absence.
 */
export async function fetchPoolStats(
  pair: string,
  market: string,
): Promise<PoolStats | null> {
  const chainId = chainIdForMarket(market)
  if (!chainId) return null
  const pool = await resolvePool(pair, chainId)
  if (!pool) return null
  return fetchPoolByAddress(chainId, pool.pairAddress)
}
