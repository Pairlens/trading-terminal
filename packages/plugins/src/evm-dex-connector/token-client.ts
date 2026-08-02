// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  isEvmAddress,
  registerToken,
} from '@pairlens/market-engine/token-directory'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import type { EvmChainConfig } from './chains'
import type { EvmToken } from './types'

// Token discovery is backed by GeckoTerminal (free, no API key, CORS-open) —
// the same source the wildcard chart data providers use, so the token a user
// picks here is the token whose pool gets charted.
const API_BASE = 'https://api.geckoterminal.com/api/v2'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/** GeckoTerminal JSON:API token resource (subset we consume). */
type RawGtToken = {
  id?: string
  attributes?: {
    address?: string
    symbol?: string
    name?: string
    decimals?: number | null
  }
}

type RawGtPoolPage = {
  data?: Array<{
    relationships?: {
      base_token?: { data?: { id?: string } }
      quote_token?: { data?: { id?: string } }
    }
  }>
  included?: Array<RawGtToken>
}

// ── Per-network caches ──────────────────────────────────────────────

const topCache = new Map<string, { tokens: Array<EvmToken>; ts: number }>()

/**
 * Tokens explicitly resolved for trading (searched, or referenced in an
 * order). Kept separate from bulk discovery so balance scans stay small.
 */
const pinned = new Map<string, Map<string, EvmToken>>()

function pinToken(network: string, token: EvmToken): void {
  let byNetwork = pinned.get(network)
  if (!byNetwork) {
    byNetwork = new Map()
    pinned.set(network, byNetwork)
  }
  byNetwork.set(token.symbol.toUpperCase(), token)
  registerToken({
    network,
    symbol: token.symbol,
    address: token.address,
    decimals: token.decimals,
    name: token.name,
  })
}

export function getPinnedTokens(network: string): Array<EvmToken> {
  return [...(pinned.get(network)?.values() ?? [])]
}

function normalize(raw: RawGtToken): EvmToken | null {
  const a = raw.attributes
  if (!a?.address || !a.symbol || typeof a.decimals !== 'number') return null
  return {
    address: a.address,
    symbol: a.symbol,
    name: a.name ?? a.symbol,
    decimals: a.decimals,
  }
}

/**
 * Extract base tokens (in pool order) from a JSON:API pool page with
 * `include=base_token,quote_token`. Deduped by symbol — pools are
 * volume/relevance ranked, so the first hit per symbol is the best one.
 */
function extractBaseTokens(
  page: RawGtPoolPage,
  geckoNetwork: string,
): Array<EvmToken> {
  const byId = new Map<string, RawGtToken>()
  for (const inc of page.included ?? []) {
    if (inc.id) byId.set(inc.id, inc)
  }

  const seen = new Set<string>()
  const tokens: Array<EvmToken> = []
  for (const pool of page.data ?? []) {
    const baseId = pool.relationships?.base_token?.data?.id
    if (!baseId || !baseId.startsWith(`${geckoNetwork}_`)) continue
    const token = normalize(byId.get(baseId) ?? {})
    if (!token) continue
    const key = token.symbol.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    tokens.push(token)
  }
  return tokens
}

// ── Discovery ───────────────────────────────────────────────────────

/**
 * Top tokens on a network, extracted from its highest-volume pools and
 * registered in the shared token directory so charts resolve the same token.
 */
export async function getTopTokens(
  chain: EvmChainConfig,
  limit = 100,
): Promise<Array<EvmToken>> {
  const cached = topCache.get(chain.market)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.tokens.slice(0, limit)
  }

  try {
    const res = await fetch(
      `${API_BASE}/networks/${chain.geckoNetwork}/pools?sort=h24_volume_usd_desc&page=1&include=base_token,quote_token`,
    )
    if (!res.ok) return cached?.tokens.slice(0, limit) ?? []

    const tokens = extractBaseTokens(
      (await res.json()) as RawGtPoolPage,
      chain.geckoNetwork,
    )
    for (const token of tokens) {
      registerToken({
        network: chain.market,
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        name: token.name,
      })
    }

    if (tokens.length > 0) {
      topCache.set(chain.market, { tokens, ts: Date.now() })
    }
    return tokens.slice(0, limit)
  } catch {
    return cached?.tokens.slice(0, limit) ?? []
  }
}

// ── Search ──────────────────────────────────────────────────────────

/**
 * Search tokens by symbol/name/address on one network. Results are pinned —
 * a token surfaced via search is one the user may trade next, and the pin
 * guarantees the order resolves to the exact token they saw.
 */
export async function searchTokens(
  chain: EvmChainConfig,
  query: string,
  limit = 50,
): Promise<Array<EvmToken>> {
  if (!query) return []
  try {
    const res = await fetch(
      `${API_BASE}/search/pools?query=${encodeURIComponent(query)}&network=${chain.geckoNetwork}&page=1&include=base_token,quote_token`,
    )
    if (!res.ok) return []

    const tokens = extractBaseTokens(
      (await res.json()) as RawGtPoolPage,
      chain.geckoNetwork,
    ).slice(0, limit)
    for (const token of tokens) {
      pinToken(chain.market, token)
    }
    return tokens
  } catch {
    return []
  }
}

// ── Resolution (for order execution) ────────────────────────────────

/** Fetch a single token's metadata by contract address. */
async function fetchTokenByAddress(
  chain: EvmChainConfig,
  address: string,
): Promise<EvmToken | null> {
  try {
    const res = await fetch(
      `${API_BASE}/networks/${chain.geckoNetwork}/tokens/${address}`,
    )
    if (!res.ok) return null
    const json = (await res.json()) as { data?: RawGtToken }
    return normalize(json.data ?? {})
  } catch {
    return null
  }
}

/**
 * Resolve a pair leg (symbol or contract address) to a token. Priority:
 * chain quote/native shortcuts → pinned tokens → top-tokens cache →
 * address lookup → network-filtered search.
 */
export async function resolveToken(
  chain: EvmChainConfig,
  symbolOrAddress: string,
): Promise<EvmToken | null> {
  const key = symbolOrAddress.toUpperCase()

  // Chain constants resolve without a network call — by symbol or address
  if (
    key === chain.quote.symbol.toUpperCase() ||
    key === chain.quote.address.toUpperCase()
  ) {
    return {
      address: chain.quote.address,
      symbol: chain.quote.symbol,
      name: chain.quote.symbol,
      decimals: chain.quote.decimals,
    }
  }
  if (
    key === `W${chain.nativeSymbol}`.toUpperCase() ||
    key === chain.wrappedNativeAddress.toUpperCase()
  ) {
    return {
      address: chain.wrappedNativeAddress,
      symbol: `W${chain.nativeSymbol}`,
      name: `Wrapped ${chain.nativeSymbol}`,
      decimals: 18,
    }
  }

  const pinnedHit = pinned.get(chain.market)?.get(key)
  if (pinnedHit) return pinnedHit

  const cachedTop = topCache
    .get(chain.market)
    ?.tokens.find((t) => t.symbol.toUpperCase() === key)
  if (cachedTop) return cachedTop

  if (isEvmAddress(symbolOrAddress)) {
    const token = await fetchTokenByAddress(chain, symbolOrAddress)
    if (token) pinToken(chain.market, token)
    return token
  }

  const results = await searchTokens(chain, symbolOrAddress, 10)
  return (
    results.find((t) => t.symbol.toUpperCase() === key) ?? results[0] ?? null
  )
}

export function clearTokenCaches(): void {
  topCache.clear()
  pinned.clear()
}
