// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pair key → the DexScreener pool that pair means.
 *
 * Resolution here is by TOKEN ADDRESS and nothing else, which is a narrower
 * contract than the sibling resolvers offer and a deliberate one.
 * `/latest/dex/search` was measured before it was trusted: asked for
 * `WETH USDC` it returns thirty rows and not one of them is on Ethereum, and
 * asked for `SOL USDC` it returns three Solana pools, each reporting over a
 * billion dollars of liquidity against forty-odd trades a day, while the actual
 * SOL/USDC market on Orca and Raydium appears nowhere. It is a fuzzy text index
 * over long-tail tokens, not a market index. Ranking those rows by volume, or by
 * liquidity, or by anything, would be picking a pool and calling it the market.
 *
 * So: a pair whose base leg is an address, or whose base symbol the shared token
 * directory has already pinned to one (which is what every DEX connector and the
 * pair picker do as the user navigates), resolves through
 * `/token-pairs/v1/{chainId}/{tokenAddress}`. Anything else resolves to null,
 * and the pane says there is no pool this provider will vouch for.
 *
 * Worth knowing where this is NOT on the path at all: the terminal's reserve
 * supplement pins the pool by the address the primary provider already resolved,
 * so it never resolves anything and never depends on any of the above.
 */
import {
  isTokenAddress,
  lookupToken,
} from '@pairlens/market-engine/token-directory'
import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import { dexscreenerFetch as fetch } from './rate-limiter'
import { API_BASE, numberOrNull } from './pool-stats-client'
import type { RawDexScreenerPair } from './pool-stats-client'

export type DexScreenerPool = {
  chainId: string
  pairAddress: string
  dexId: string
  volume24hUsd: number
  liquidityUsd: number
}

const poolCache = new Map<string, { pool: DexScreenerPool; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour, matching the sibling resolvers

function toPool(raw: RawDexScreenerPair, chainId: string): DexScreenerPool {
  return {
    chainId: raw.chainId ?? chainId,
    pairAddress: raw.pairAddress ?? '',
    dexId: raw.dexId ?? '',
    volume24hUsd: numberOrNull(raw.volume?.['h24']) ?? 0,
    liquidityUsd: numberOrNull(raw.liquidity?.usd) ?? 0,
  }
}

const sameSymbol = (a: string | undefined, b: string): boolean =>
  (a ?? '').trim().toUpperCase() === b.trim().toUpperCase()

const sameAddress = (a: string | undefined, b: string): boolean =>
  (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Deepest by TRADED volume, then by reported liquidity as a tie-break.
 *
 * Volume first because liquidity is a number a worthless quote token inflates
 * for free, while volume has to be paid for in fees. Within one token's own
 * pools that ordering picks the pool the token actually trades in.
 */
function byActivity(a: RawDexScreenerPair, b: RawDexScreenerPair): number {
  const volA = numberOrNull(a.volume?.['h24']) ?? 0
  const volB = numberOrNull(b.volume?.['h24']) ?? 0
  if (volA !== volB) return volB - volA
  return (
    (numberOrNull(b.liquidity?.usd) ?? 0) -
    (numberOrNull(a.liquidity?.usd) ?? 0)
  )
}

/**
 * Pick the best row for a pair from a set of candidates.
 *
 * Exported because this, not the fetching, is where a resolver goes wrong, and
 * the ordering rule is only worth stating if a test pins it against rows the
 * live API actually returns.
 */
export function selectPool(
  rows: Array<RawDexScreenerPair>,
  options: { chainId: string; quote?: string },
): RawDexScreenerPair | null {
  const candidates = rows.filter(
    (row) =>
      Boolean(row.pairAddress) &&
      (row.chainId === undefined || row.chainId === options.chainId),
  )
  if (candidates.length === 0) return null

  if (options.quote) {
    const quoted = candidates.filter((row) =>
      sameSymbol(row.quoteToken?.symbol, options.quote!),
    )
    // Prefer the requested quote leg. A pair quoted in any liquid stable or
    // wrapped native tracks the same price, so the deepest pool overall is the
    // fallback rather than nothing.
    if (quoted.length > 0) return quoted.slice().sort(byActivity)[0] ?? null
  }
  return candidates.slice().sort(byActivity)[0] ?? null
}

/**
 * Every pool DexScreener lists for one token, filtered to the pools where that
 * token really is a leg, ranked by volume.
 *
 * `/token-pairs/v1` returns up to 30 rows in NO particular order (verified live:
 * the deepest WETH pool on Base arrives fourth), so the ranking is not
 * decoration. The address filter is not either: the endpoint is keyed by token,
 * but a row's own legs are what prove the pool contains it.
 */
async function resolveByTokenAddress(
  address: string,
  quote: string,
  chainId: string,
): Promise<DexScreenerPool | null> {
  const res = await fetch(
    `${API_BASE}/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}`,
  )
  if (!res.ok) return null
  const json = (await res.json()) as Array<RawDexScreenerPair> | null
  const rows = (Array.isArray(json) ? json : []).filter(
    (row) =>
      sameAddress(row.baseToken?.address, address) ||
      sameAddress(row.quoteToken?.address, address),
  )
  if (rows.length === 0) return null

  const picked = selectPool(rows, { chainId, quote })
  return picked ? toPool(picked, chainId) : null
}

/**
 * Resolve a pair key (`SOL-USDC`, or `<address>-USDC` for a memecoin) to the
 * most active DexScreener pool on the given chain. Caches for an hour.
 *
 * null means there is no pool this provider will vouch for, which the pane reads
 * as "no pool here". A throttle THROWS: this sits in front of the pool read, so
 * swallowing a 429 would report "no pool on this chain" for as long as the limit
 * lasts.
 */
export async function resolvePool(
  pair: string,
  chainId: string,
): Promise<DexScreenerPool | null> {
  const cacheKey = `${chainId}:${pair}`
  const cached = poolCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.pool

  const [base, quote] = pair.split('-')
  if (!base || !quote) return null

  // The directory is keyed by Pairlens network slug, and DexScreener's chain ids
  // are the same strings for every chain we ship (see ./chains), so the chain id
  // is the directory key.
  const pinned = lookupToken(chainId, base)
  const baseAddress = isTokenAddress(base) ? base : pinned?.address
  if (!baseAddress) return null

  try {
    const pool = await resolveByTokenAddress(baseAddress, quote, chainId)
    if (pool) poolCache.set(cacheKey, { pool, ts: Date.now() })
    return pool
  } catch (err) {
    if (isProviderThrottledError(err)) throw err
    return null
  }
}

export function clearPoolCache(): void {
  poolCache.clear()
}
