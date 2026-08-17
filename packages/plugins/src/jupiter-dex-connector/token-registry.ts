// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  isSolanaAddress,
  registerToken,
} from '@pairlens/market-engine/token-directory'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import type { JupiterToken } from './types'

// Jupiter Token API v2 (free "lite" tier — no API key required).
// The legacy token.jup.ag/strict list was deprecated and its host no longer
// resolves; v2 exposes dedicated search + top-traded endpoints instead of one
// monolithic list. https://dev.jup.ag/docs/token-api
const BASE_URL = 'https://lite-api.jup.ag/tokens/v2'
const TOP_TRADED_URL = `${BASE_URL}/toptraded/24h`
const searchUrl = (query: string) =>
  `${BASE_URL}/search?query=${encodeURIComponent(query)}`

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/** Raw v2 token shape (subset we consume). `id` is the mint address. */
type RawV2Token = {
  id: string
  symbol: string
  name: string
  decimals: number
  icon?: string
  tags?: Array<string>
}

function normalize(raw: RawV2Token): JupiterToken {
  return {
    address: raw.id,
    symbol: raw.symbol,
    name: raw.name,
    decimals: raw.decimals,
    logoURI: raw.icon,
    tags: raw.tags,
  }
}

async function fetchTokens(url: string): Promise<Array<JupiterToken>> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const raw = (await res.json()) as Array<RawV2Token>
    return Array.isArray(raw) ? raw.map(normalize) : []
  } catch {
    return []
  }
}

// ── Top-traded cache (discovery) ────────────────────────────────────

let topTokens: Array<JupiterToken> = []
let topFetchTs = 0
let topLoading: Promise<void> | null = null

async function ensureTopLoaded(): Promise<void> {
  if (topTokens.length > 0 && Date.now() - topFetchTs < CACHE_TTL) return
  if (topLoading) return topLoading

  topLoading = (async () => {
    const tokens = await fetchTokens(TOP_TRADED_URL)
    if (tokens.length > 0) {
      topTokens = tokens
      topFetchTs = Date.now()
    }
    // On failure keep the existing cache (possibly empty — discovery degrades
    // to an empty page rather than throwing).
  })().finally(() => {
    topLoading = null
  })

  return topLoading
}

// ── Symbol resolution cache (swaps) ─────────────────────────────────

const symbolIndex = new Map<string, JupiterToken>()

/**
 * Pin a symbol → mint binding for this session. Also published to the shared
 * token directory so the chart data providers resolve pools for the SAME
 * mint the user is trading — memecoin symbols collide constantly.
 */
function pinToken(token: JupiterToken): void {
  symbolIndex.set(token.symbol.toUpperCase(), token)
  registerToken({
    network: 'solana',
    symbol: token.symbol,
    address: token.address,
    decimals: token.decimals,
    name: token.name,
  })
}

/**
 * Resolve a symbol (e.g. "SOL") or a raw mint address to a Jupiter token via
 * the search endpoint.
 */
export async function resolveToken(
  symbol: string,
): Promise<JupiterToken | null> {
  const key = symbol.toUpperCase()
  const cached = symbolIndex.get(key)
  if (cached) return cached

  const results = await fetchTokens(searchUrl(symbol))
  // Mint address queries match by address; symbol queries prefer an exact
  // symbol match. The API ranks by relevance/liquidity, so the first result
  // is the best fallback.
  const match = isSolanaAddress(symbol)
    ? (results.find((t) => t.address === symbol) ?? results[0] ?? null)
    : (results.find((t) => t.symbol.toUpperCase() === key) ??
      results[0] ??
      null)
  if (match) {
    symbolIndex.set(key, match)
    pinToken(match)
  }
  return match
}

/**
 * Mint → token, or a cached null. Separate from `symbolIndex` on purpose: this
 * one is never consulted by symbol and never pins anything.
 */
const mintIndex = new Map<string, JupiterToken | null>()

/**
 * Resolve a MINT to its metadata WITHOUT pinning anything.
 *
 * `resolveToken` is the trading path: it pins (symbol → mint) for the session
 * and publishes to the shared token directory, which is last-write-wins. That
 * is right when the user picked the token. It is dangerous when the mint came
 * from somewhere the user did not choose: an LP position's pool can hold a
 * token calling itself USDC, and labelling that row through the trading path
 * would re-point USDC for every later swap, chart and pool lookup in the
 * session.
 *
 * So this reads only, and only accepts an EXACT address match. A search that
 * does not return the mint asked about answers null rather than the closest
 * thing, and the null is cached so a scam mint is not re-queried per refresh.
 */
export async function lookupTokenByMint(
  mint: string,
): Promise<JupiterToken | null> {
  if (!isSolanaAddress(mint)) return null
  const known = getKnownTokenByMint(mint)
  if (known) return known
  const cached = mintIndex.get(mint)
  if (cached !== undefined) return cached
  const results = await fetchTokens(searchUrl(mint))
  const match = results.find((t) => t.address === mint) ?? null
  mintIndex.set(mint, match)
  return match
}

/** Look up an already-seen token by its mint (for balance labelling). */
export function getKnownTokenByMint(mint: string): JupiterToken | null {
  for (const t of symbolIndex.values()) {
    if (t.address === mint) return t
  }
  for (const t of topTokens) {
    if (t.address === mint) return t
  }
  return null
}

/** Resolve a pair (e.g. "SOL-USDC") to input/output mints. */
export async function resolvePairMints(
  pair: string,
): Promise<{ inputMint: string; outputMint: string } | null> {
  const [base, quote] = pair.split('-')
  if (!base || !quote) return null

  const baseToken = await resolveToken(base)
  const quoteToken = await resolveToken(quote)
  if (!baseToken || !quoteToken) return null

  return { inputMint: baseToken.address, outputMint: quoteToken.address }
}

/** Search tokens by symbol or name (server-side via the v2 search endpoint). */
export async function searchTokens(
  query: string,
  limit = 50,
): Promise<Array<JupiterToken>> {
  if (!query) return []
  const results = await fetchTokens(searchUrl(query))
  const sliced = results.slice(0, limit)
  // Pin first-seen-per-symbol (results are relevance/liquidity ranked) so a
  // trade placed on a searched pair resolves to the token the user saw.
  const seen = new Set<string>()
  for (const t of sliced) {
    const key = t.symbol.toUpperCase()
    if (seen.has(key) || symbolIndex.has(key)) continue
    seen.add(key)
    pinToken(t)
  }
  return sliced
}

/** Get top-traded tokens for discovery. */
export async function getTopTokens(limit = 100): Promise<Array<JupiterToken>> {
  await ensureTopLoaded()
  const tokens = topTokens.slice(0, limit)
  // Publish to the shared directory (first-seen-per-symbol wins) so charts
  // resolve the same mints discovery showed. Symbols already pinned via
  // search/trade are skipped — the user's selection stays authoritative.
  const seen = new Set<string>()
  for (const t of tokens) {
    const key = t.symbol.toUpperCase()
    if (seen.has(key) || symbolIndex.has(key)) continue
    seen.add(key)
    registerToken({
      network: 'solana',
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      name: t.name,
    })
  }
  return tokens
}

export function clearTokenCache(): void {
  topTokens = []
  topFetchTs = 0
  symbolIndex.clear()
  mintIndex.clear()
}
