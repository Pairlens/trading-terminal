// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  FearGreedResponse,
  HeatmapResponse,
  TopCoin,
  TopCoinsResponse,
} from '@pairlens/shared/instrument-types'

/**
 * Keyless public fallbacks for the market-context panes.
 *
 * The App Server stays the primary source (shared cache, no per-user rate
 * limits); these direct fetches keep Top Coins, Heatmap, and Fear & Greed
 * alive when no App Server is reachable — standalone installs, self-hosts
 * without a backend, or an outage. Both hosts are free, keyless, and send
 * `access-control-allow-origin: *`. Limits are per client IP, and callers
 * cache for 5 minutes, so a single terminal stays far under them.
 */

export const COINGECKO_MARKETS_URL =
  'https://api.coingecko.com/api/v3/coins/markets' +
  '?vs_currency=usd&order=market_cap_desc&per_page=100&page=1' +
  '&sparkline=false&price_change_percentage=1h,24h,7d'

export const ALTERNATIVE_FNG_URL = 'https://api.alternative.me/fng/?limit=30'

// ── CoinGecko → TopCoinsResponse / HeatmapResponse ──────────────────

export type CoinGeckoMarket = {
  id: string
  symbol: string
  name: string
  image: string | null
  current_price: number | null
  market_cap: number | null
  market_cap_rank: number | null
  total_volume: number | null
  price_change_percentage_1h_in_currency?: number | null
  price_change_percentage_24h_in_currency?: number | null
  price_change_percentage_7d_in_currency?: number | null
  price_change_percentage_24h?: number | null
}

export function normalizeCoinGeckoMarkets(
  rows: Array<CoinGeckoMarket>,
): TopCoinsResponse {
  const coins: Array<TopCoin> = rows
    .filter((r) => r.current_price !== null && r.market_cap_rank !== null)
    .map((r) => ({
      rank: r.market_cap_rank ?? 0,
      symbol: r.symbol.toUpperCase(),
      name: r.name,
      slug: r.id,
      price: r.current_price ?? 0,
      marketCap: r.market_cap ?? 0,
      volume24h: r.total_volume ?? 0,
      percentChange1h: r.price_change_percentage_1h_in_currency ?? 0,
      percentChange24h:
        r.price_change_percentage_24h_in_currency ??
        r.price_change_percentage_24h ??
        0,
      percentChange7d: r.price_change_percentage_7d_in_currency ?? 0,
      logoUrl: r.image,
    }))
  return { coins, updatedAt: new Date().toISOString() }
}

export function topCoinsToHeatmap(top: TopCoinsResponse): HeatmapResponse {
  return {
    items: top.coins.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      price: c.price,
      marketCap: c.marketCap,
      volume24h: c.volume24h,
      percentChange1h: c.percentChange1h,
      percentChange24h: c.percentChange24h,
      percentChange7d: c.percentChange7d,
      logoUrl: c.logoUrl,
    })),
    updatedAt: top.updatedAt,
  }
}

// ── alternative.me → FearGreedResponse ──────────────────────────────

export type AlternativeFngEntry = {
  value: string
  value_classification: string
  timestamp: string
}

export function normalizeAlternativeFng(
  entries: Array<AlternativeFngEntry>,
): FearGreedResponse {
  const points = entries
    .map((e) => ({
      value: Number(e.value),
      valueClassification: e.value_classification,
      timestamp: e.timestamp,
    }))
    .filter((p) => Number.isFinite(p.value))
  const latest = points[0]
  if (!latest) throw new Error('fear-greed fallback: empty response')
  return {
    latest,
    historical: points,
    fetchedAt: new Date().toISOString(),
  }
}

// ── Fetch-with-fallback helpers ──────────────────────────────────────

type ApiFetch = (path: string) => Promise<Response>

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed (${res.status})`)
  return (await res.json()) as T
}

async function fetchCoinGeckoTopCoins(): Promise<TopCoinsResponse> {
  const res = await fetch(COINGECKO_MARKETS_URL)
  const rows = await jsonOrThrow<Array<CoinGeckoMarket>>(res, 'coingecko')
  return normalizeCoinGeckoMarkets(rows)
}

/** App Server first; CoinGecko when it's unreachable. */
export async function fetchTopCoinsWithFallback(
  apiFetch: ApiFetch,
): Promise<TopCoinsResponse> {
  try {
    const res = await apiFetch('/api/top-coins')
    return await jsonOrThrow<TopCoinsResponse>(res, 'top-coins')
  } catch {
    return fetchCoinGeckoTopCoins()
  }
}

/** App Server first; derived from the CoinGecko top-coins on fallback. */
export async function fetchHeatmapWithFallback(
  apiFetch: ApiFetch,
): Promise<HeatmapResponse> {
  try {
    const res = await apiFetch('/api/heatmap')
    return await jsonOrThrow<HeatmapResponse>(res, 'heatmap')
  } catch {
    return topCoinsToHeatmap(await fetchCoinGeckoTopCoins())
  }
}

/** App Server first; alternative.me when it's unreachable. */
export async function fetchFearGreedWithFallback(
  apiFetch: ApiFetch,
): Promise<FearGreedResponse> {
  try {
    const res = await apiFetch('/api/fear-greed')
    return await jsonOrThrow<FearGreedResponse>(res, 'fear-greed')
  } catch {
    const res = await fetch(ALTERNATIVE_FNG_URL)
    const body = await jsonOrThrow<{ data: Array<AlternativeFngEntry> }>(
      res,
      'alternative.me',
    )
    return normalizeAlternativeFng(body.data ?? [])
  }
}
