// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A network's ranked pools, and the chain-level aggregate derived from them.
 *
 * GeckoTerminal has a `/networks` endpoint, but it publishes names and nothing
 * else — no volume, no value locked. So the chain row's figures are a SUM OVER
 * THE POOLS WE FETCHED, and the aggregate says so (`coverage: 'top-pools'`,
 * `sampledPools`). DexPaprika's `/networks` publishes chain-wide totals and is
 * the better answer wherever CORS lets us reach it; this one keeps the pane
 * populated in a browser without claiming to be the whole chain.
 */
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { numberOrNull, splitPoolName } from './pool-stats-client'
import type {
  ChainPoolStats,
  PoolListingEntry,
} from '@pairlens/shared/instrument-types'

const API_BASE = 'https://api.geckoterminal.com/api/v2'

/** Pools per page on this endpoint. One page is one request against the budget. */
export const POOLS_PER_PAGE = 20

export type RawGeckoPoolRow = {
  id?: string
  attributes?: {
    address?: string
    name?: string
    base_token_price_usd?: string | null
    price_change_percentage?: Record<string, string | null>
    volume_usd?: Record<string, string | null>
    reserve_in_usd?: string | null
  }
  relationships?: {
    dex?: { data?: { id?: string } }
    base_token?: { data?: { id?: string } }
  }
}

/**
 * `solana_So111…112` → `So111…112`.
 *
 * Token ids are network-prefixed on this API, and the address is what a row
 * needs to open the pair by identity instead of by ticker.
 */
export function stripNetworkPrefix(
  id: string | undefined,
  network: string,
): string | null {
  if (!id) return null
  const prefix = `${network}_`
  return id.startsWith(prefix) ? id.slice(prefix.length) : id
}

export function parsePoolListingEntry(
  raw: RawGeckoPoolRow,
  network: string,
): PoolListingEntry | null {
  const attrs = raw.attributes
  const address = attrs?.address
  if (!attrs || !address) return null

  const name = attrs.name ?? ''
  const legs = splitPoolName(name)

  return {
    network,
    address,
    name,
    dexName: raw.relationships?.dex?.data?.id ?? '',
    priceUsd: numberOrNull(attrs.base_token_price_usd),
    change24hPct: numberOrNull(attrs.price_change_percentage?.['h24']),
    volume24hUsd: numberOrNull(attrs.volume_usd?.['h24']),
    reserveUsd: numberOrNull(attrs.reserve_in_usd),
    baseSymbol: legs.base,
    quoteSymbol: legs.quote,
    baseAddress: stripNetworkPrefix(
      raw.relationships?.base_token?.data?.id,
      network,
    ),
  }
}

export function parsePoolListing(
  data: Array<RawGeckoPoolRow> | undefined,
  network: string,
): Array<PoolListingEntry> {
  const out: Array<PoolListingEntry> = []
  for (const raw of data ?? []) {
    const entry = parsePoolListingEntry(raw, network)
    if (entry) out.push(entry)
  }
  return out
}

/**
 * Sum a sampled listing into one chain row.
 *
 * Nulls do not become zeros in the sum: a chain whose pools all reported no
 * value locked leaves `reserveUsd` null, so the row shows a dash rather than
 * "$0" — the difference between "not published" and "empty".
 */
export function aggregateChainStats(
  network: string,
  market: string,
  displayName: string,
  pools: Array<PoolListingEntry>,
): ChainPoolStats {
  let volume: number | null = null
  let reserve: number | null = null
  for (const pool of pools) {
    if (pool.volume24hUsd !== null) volume = (volume ?? 0) + pool.volume24hUsd
    if (pool.reserveUsd !== null) reserve = (reserve ?? 0) + pool.reserveUsd
  }
  return {
    network,
    market,
    displayName,
    volume24hUsd: volume,
    reserveUsd: reserve,
    txns24h: null,
    poolsCount: null,
    coverage: 'top-pools',
    sampledPools: pools.length,
    source: 'geckoterminal',
  }
}

/** Top pools by 24h volume. Throws on a failed request (see fetchPoolStats). */
export async function fetchTopPools(
  network: string,
  page = 1,
): Promise<Array<PoolListingEntry>> {
  const res = await fetch(`${API_BASE}/networks/${network}/pools?page=${page}`)
  if (!res.ok) {
    throw new Error(`GeckoTerminal pools ${network}: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { data?: Array<RawGeckoPoolRow> }
  return parsePoolListing(json.data, network)
}
