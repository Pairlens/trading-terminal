// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  isTokenAddress,
  lookupToken,
} from '@pairlens/market-engine/token-directory'
import { restFetch as fetch } from '@pairlens/market-engine/http'

const API_BASE = 'https://api.dexpaprika.com'

type PoolInfo = {
  id: string
  network: string
  dexName: string
  volume24h: number
}

/** Map a Pairlens market id to a DexPaprika network slug. */
const MARKET_NETWORKS: Record<string, string> = {
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

export function networkForMarket(market: string | undefined): string {
  return (market && MARKET_NETWORKS[market]) ?? 'solana'
}

const poolCache = new Map<string, { pool: PoolInfo; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

type RawPool = {
  id: string
  chain?: string
  dex_name?: string
  volume_usd?: number
  tokens?: Array<{ id?: string; symbol?: string }>
}

function toPoolInfo(raw: RawPool, network: string): PoolInfo {
  return {
    id: raw.id,
    network: raw.chain ?? network,
    dexName: raw.dex_name ?? '',
    volume24h: raw.volume_usd ?? 0,
  }
}

/**
 * Resolve the base token's address for a pair. Priority:
 * 1. The base IS an address (memecoin pairs can carry the address directly)
 * 2. The shared token directory (populated by DEX connectors on search/
 *    discovery, so charts follow the exact token the user selected)
 * 3. DexPaprika token search, filtered to this network + exact symbol
 */
async function resolveBaseAddress(
  base: string,
  network: string,
): Promise<string | null> {
  if (isTokenAddress(base)) return base

  const pinned = lookupToken(network, base)
  if (pinned) return pinned.address

  try {
    const res = await fetch(
      `${API_BASE}/search?query=${encodeURIComponent(base)}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      tokens?: Array<{ id?: string; symbol?: string; chain?: string }>
    }
    const match = (data.tokens ?? []).find(
      (t) =>
        t.chain === network &&
        (t.symbol ?? '').toUpperCase() === base.toUpperCase() &&
        t.id,
    )
    return match?.id ?? null
  } catch {
    return null
  }
}

/**
 * Pick the best pool for a base token: prefer the deepest pool quoted in the
 * requested quote currency; fall back to the deepest pool overall (DEX quotes
 * are fungible enough — USDC/USDT/wrapped-native all track the same price).
 */
async function resolvePoolByTokenAddress(
  address: string,
  quote: string,
  network: string,
): Promise<PoolInfo | null> {
  try {
    const res = await fetch(
      `${API_BASE}/networks/${network}/tokens/${address}/pools?limit=10&order_by=volume_usd&sort=desc`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as { pools?: Array<RawPool> }
    const pools = data.pools ?? []
    if (pools.length === 0) return null

    const wantQuote = quote.toUpperCase()
    const quoteMatch = pools.find((p) =>
      (p.tokens ?? []).some(
        (t) => (t.symbol ?? '').toUpperCase() === wantQuote,
      ),
    )
    return toPoolInfo(quoteMatch ?? pools[0], network)
  } catch {
    return null
  }
}

/**
 * Resolve a trading pair (e.g. "SOL-USDC", or "<address>-USDC" for memecoins)
 * to the most liquid DexPaprika pool on the given network. Caches for 1 hour.
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
  const wantBase = base.toUpperCase()
  const wantQuote = quote.toUpperCase()

  try {
    // Fast path for majors: scan the network's highest-volume pools and match
    // token symbols. Pools come pre-sorted by volume, so the first match is
    // the deepest pool for the pair. Skipped when the base is an address or a
    // connector pinned the token — those must resolve by address.
    if (!isTokenAddress(base) && !lookupToken(network, base)) {
      const res = await fetch(
        `${API_BASE}/networks/${network}/pools?limit=100&order_by=volume_usd&sort=desc`,
      )
      if (res.ok) {
        const data = (await res.json()) as { pools?: Array<RawPool> }
        const match = (data.pools ?? []).find((p) => {
          const symbols = (p.tokens ?? []).map((t) =>
            (t.symbol ?? '').toUpperCase(),
          )
          return symbols.includes(wantBase) && symbols.includes(wantQuote)
        })
        if (match) {
          const pool = toPoolInfo(match, network)
          poolCache.set(cacheKey, { pool, ts: Date.now() })
          return pool
        }
      }
    }

    // Long-tail path (memecoins): resolve the base token's address, then pick
    // the deepest pool for that exact token.
    const address = await resolveBaseAddress(base, network)
    if (!address) return null

    const pool = await resolvePoolByTokenAddress(address, wantQuote, network)
    if (!pool) return null

    poolCache.set(cacheKey, { pool, ts: Date.now() })
    return pool
  } catch {
    return null
  }
}

export function clearPoolCache(): void {
  poolCache.clear()
}
