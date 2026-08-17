// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pool state from GeckoTerminal's pool endpoint — the numbers an AMM has that
 * an order book does not.
 *
 * The parse is deliberately lossy in one direction only: a field the API omits
 * becomes `null`, never a derived stand-in. GeckoTerminal publishes
 * `reserve_in_usd` and no per-token reserves, so `baseReserve`/`quoteReserve`
 * stay null here and DexPaprika fills them on desktop. Halving the USD figure
 * would be right for a constant-product pool and wrong for every
 * concentrated-liquidity one, which is most of the volume.
 */
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolvePool } from './pool-resolver'
import type { PoolStats } from '@pairlens/shared/instrument-types'

const API_BASE = 'https://api.geckoterminal.com/api/v2'

/** The subset of the pool endpoint this reads. Everything is optional. */
export type RawGeckoPool = {
  id?: string
  attributes?: {
    address?: string
    name?: string
    base_token_price_usd?: string | null
    quote_token_price_usd?: string | null
    base_token_price_quote_token?: string | null
    pool_created_at?: string | null
    fdv_usd?: string | null
    price_change_percentage?: Record<string, string | null>
    volume_usd?: Record<string, string | null>
    reserve_in_usd?: string | null
    transactions?: Record<
      string,
      { buys?: number; sells?: number; buyers?: number; sellers?: number }
    >
  }
  relationships?: {
    dex?: { data?: { id?: string } }
  }
}

/** Parse a numeric string the API may send as null, '', or 'NaN'. */
export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Split a pool label into its two legs.
 *
 * GeckoTerminal names pools `BASE / QUOTE` and EVM venues append the fee tier
 * (`BRETT / WETH 1%`), so the quote leg is the first word after the slash.
 */
export function splitPoolName(name: string): {
  base: string | null
  quote: string | null
} {
  const parts = name.split(' / ')
  if (parts.length < 2) return { base: null, quote: null }
  const base = parts[0]?.trim() || null
  const quote = parts[1]?.trim().split(/\s+/)[0] || null
  return { base, quote }
}

/**
 * The fee tier the pool NAME carries, as a fraction.
 *
 * GeckoTerminal has no fee field; EVM pool labels carry it as a percentage
 * suffix, and Solana labels usually carry nothing. Read it where the venue
 * wrote it and return null everywhere else — a default fee tier would be a
 * number the user could act on and we did not measure.
 */
export function feeTierFromName(name: string): number | null {
  const match = name.match(/(\d+(?:\.\d+)?)\s*%\s*$/)
  if (!match) return null
  const pct = Number(match[1])
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? pct / 100 : null
}

export function parsePoolStats(
  raw: RawGeckoPool,
  network: string,
): PoolStats | null {
  const attrs = raw.attributes
  const address = attrs?.address
  if (!attrs || !address) return null

  const name = attrs.name ?? ''
  const legs = splitPoolName(name)
  const tx24 = attrs.transactions?.['h24']

  return {
    network,
    address,
    name,
    dexName: raw.relationships?.dex?.data?.id ?? '',
    baseSymbol: legs.base,
    quoteSymbol: legs.quote,
    priceUsd: numberOrNull(attrs.base_token_price_usd),
    quotePriceUsd: numberOrNull(attrs.quote_token_price_usd),
    priceInQuote: numberOrNull(attrs.base_token_price_quote_token),
    change1hPct: numberOrNull(attrs.price_change_percentage?.['h1']),
    change24hPct: numberOrNull(attrs.price_change_percentage?.['h24']),
    volume1hUsd: numberOrNull(attrs.volume_usd?.['h1']),
    volume24hUsd: numberOrNull(attrs.volume_usd?.['h24']),
    reserveUsd: numberOrNull(attrs.reserve_in_usd),
    // Not published by this API. See the module doc.
    baseReserve: null,
    quoteReserve: null,
    feeTier: feeTierFromName(name),
    trades24h: tx24
      ? {
          buys: tx24.buys ?? 0,
          sells: tx24.sells ?? 0,
          buyers: tx24.buyers ?? null,
          sellers: tx24.sellers ?? null,
        }
      : null,
    buyVolume24hUsd: null,
    sellVolume24hUsd: null,
    createdAt: attrs.pool_created_at ?? null,
    fdvUsd: numberOrNull(attrs.fdv_usd),
    source: 'geckoterminal',
  }
}

/**
 * Resolve the pair's pool and read its state.
 *
 * Returns null when no pool resolves — a real answer the pane renders as "no
 * pool here". THROWS when the request itself fails, which is what lets the
 * plugin manager walk to DexPaprika instead of latching an empty pane.
 */
export async function fetchPoolStats(
  pair: string,
  network: string,
): Promise<PoolStats | null> {
  const pool = await resolvePool(pair, network)
  if (!pool) return null

  const res = await fetch(
    `${API_BASE}/networks/${pool.network}/pools/${pool.address}`,
  )
  if (!res.ok) {
    throw new Error(`GeckoTerminal pool ${pool.address}: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { data?: RawGeckoPool }
  if (!json.data) return null
  return parsePoolStats(json.data, pool.network)
}
