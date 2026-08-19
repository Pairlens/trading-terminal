// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  isTokenAddress,
  lookupToken,
} from '@pairlens/market-engine/token-directory'
import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import { geckoFetch as fetch } from './rate-limiter'

const API_BASE = 'https://api.geckoterminal.com/api/v2'

type PoolInfo = {
  id: string
  address: string
  network: string
  dexName: string
  volume24h: number
}

/**
 * Map a Pairlens market id to a GeckoTerminal network slug. GeckoTerminal
 * uses its own slugs for some chains (eth, polygon_pos, avax).
 */
const MARKET_NETWORKS: Record<string, string> = {
  jupiter: 'solana',
  solana: 'solana',
  ethereum: 'eth',
  base: 'base',
  arbitrum: 'arbitrum',
  bsc: 'bsc',
  polygon: 'polygon_pos',
  optimism: 'optimism',
  avalanche: 'avax',
}

export function networkForMarket(market: string | undefined): string {
  return (market && MARKET_NETWORKS[market]) ?? 'solana'
}

/**
 * The shared token directory is keyed by Pairlens network names (which match
 * DexPaprika slugs); map GeckoTerminal slugs back for lookups.
 */
const DIRECTORY_NETWORKS: Record<string, string> = {
  eth: 'ethereum',
  polygon_pos: 'polygon',
  avax: 'avalanche',
}

function directoryNetwork(geckoNetwork: string): string {
  return DIRECTORY_NETWORKS[geckoNetwork] ?? geckoNetwork
}

const poolCache = new Map<string, { pool: PoolInfo; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

type RawPool = {
  id: string
  attributes: {
    address: string
    name: string
    volume_usd: { h24: string }
  }
  relationships?: {
    dex?: { data?: { id?: string } }
  }
}

function toPoolInfo(raw: RawPool, network: string): PoolInfo {
  return {
    id: raw.id,
    address: raw.attributes.address,
    network,
    dexName: raw.relationships?.dex?.data?.id ?? '',
    volume24h: parseFloat(raw.attributes.volume_usd.h24) || 0,
  }
}

/** Extract the quote symbol from a pool name like "BRETT / WETH 1%". */
function poolQuoteSymbol(name: string): string {
  const parts = name.split(' / ')
  if (parts.length < 2) return ''
  return (parts[1] ?? '').trim().split(/\s+/)[0]?.toUpperCase() ?? ''
}

/**
 * Pick the best pool for a base token address: the deepest pool quoted in
 * the requested currency, else the deepest pool overall (USDC/USDT/wrapped-
 * native quotes all track the same price).
 */
async function resolvePoolByTokenAddress(
  address: string,
  quote: string,
  network: string,
): Promise<PoolInfo | null> {
  try {
    const res = await fetch(
      `${API_BASE}/networks/${network}/tokens/${address}/pools?sort=h24_volume_usd_desc&page=1`,
    )
    if (!res.ok) return null
    const json = (await res.json()) as { data?: Array<RawPool> }
    const pools = json.data ?? []
    if (pools.length === 0) return null

    const wantQuote = quote.toUpperCase()
    const quoteMatch = pools.find(
      (p) => poolQuoteSymbol(p.attributes.name) === wantQuote,
    )
    return toPoolInfo(quoteMatch ?? pools[0], network)
  } catch (err) {
    if (isProviderThrottledError(err)) throw err
    return null
  }
}

/**
 * Resolve a trading pair (e.g. "SOL-USDC", or "<address>-USDC" for memecoins)
 * to the most liquid GeckoTerminal pool on the given network (GeckoTerminal
 * slug, see networkForMarket). Caches results for 1 hour.
 *
 * null means the provider answered and there is no pool. A throttle THROWS:
 * this resolver sits in front of every other read, so swallowing a 429 here
 * would tell the pool panes "no pool on this chain" and the chart "this venue
 * does not list the pair", for the whole minute the limit lasts.
 */
export async function resolvePool(
  pair: string,
  network = 'solana',
): Promise<PoolInfo | null> {
  const cacheKey = `${network}:${pair}`
  const cached = poolCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.pool

  const [base, quote] = pair.split('-')
  if (!base || !quote) return null

  try {
    // Address-pinned path (memecoins): the base is an address, or a DEX
    // connector pinned the exact token the user selected — resolve pools for
    // that address so the chart follows the token being traded.
    const pinned = lookupToken(directoryNetwork(network), base)
    const baseAddress = isTokenAddress(base) ? base : pinned?.address
    if (baseAddress) {
      const pool = await resolvePoolByTokenAddress(baseAddress, quote, network)
      if (pool) {
        poolCache.set(cacheKey, { pool, ts: Date.now() })
        return pool
      }
      return null
    }

    // Symbol path: search pools by pair text, deepest volume wins.
    const res = await fetch(
      `${API_BASE}/search/pools?query=${encodeURIComponent(`${base} ${quote}`)}&network=${network}&page=1`,
    )
    if (!res.ok) return null

    const json = (await res.json()) as { data?: Array<RawPool> }
    const candidates = (json.data ?? [])
      .filter((p) => p.id.startsWith(`${network}_`))
      .sort(
        (a, b) =>
          (parseFloat(b.attributes.volume_usd.h24) || 0) -
          (parseFloat(a.attributes.volume_usd.h24) || 0),
      )

    if (candidates.length === 0) return null

    const pool = toPoolInfo(candidates[0], network)
    poolCache.set(cacheKey, { pool, ts: Date.now() })
    return pool
  } catch (err) {
    if (isProviderThrottledError(err)) throw err
    return null
  }
}

/**
 * Record a pool a caller already knew, so the next reader of the same pair
 * does not spend a request re-deriving it.
 *
 * Only ever called with an address that just answered successfully, which is
 * what makes it safe to treat as resolved. The point is not only the saved
 * request: a board that pinned a pool wants every pane describing THAT pool,
 * candles included, rather than the deepest one the search would have picked.
 */
export function notePool(
  pair: string,
  network: string,
  pool: { address: string; dexName?: string; volume24hUsd?: number | null },
): void {
  if (!pair || !pool.address) return
  poolCache.set(`${network}:${pair}`, {
    pool: {
      id: `${network}_${pool.address}`,
      address: pool.address,
      network,
      dexName: pool.dexName ?? '',
      volume24h: pool.volume24hUsd ?? 0,
    },
    ts: Date.now(),
  })
}

export function clearPoolCache(): void {
  poolCache.clear()
}
