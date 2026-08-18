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
import { geckoFetch as fetch } from './rate-limiter'
import { numberOrNull, splitPoolName } from './pool-stats-client'
import type {
  ChainPoolStats,
  PoolListingEntry,
  PoolTradeCounts,
} from '@pairlens/shared/instrument-types'

const API_BASE = 'https://api.geckoterminal.com/api/v2'

/**
 * Pools per page on this endpoint. One page is one request against the budget,
 * which the chain rail spends once per chain — see `rate-limiter.ts`.
 */
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
    /** ISO 8601. Published by `/new_pools`; absent from the ranked listing. */
    pool_created_at?: string | null
    /**
     * Trade counts per window (`m5`, `h1`, `h6`, `h24`). Numbers here, not the
     * strings the money fields use, which is why they go through
     * `numberOrNull` rather than being trusted as-is.
     */
    transactions?: Record<
      string,
      | {
          buys?: number | string | null
          sells?: number | string | null
          buyers?: number | string | null
          sellers?: number | string | null
        }
      | null
      | undefined
    >
    fdv_usd?: string | null
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

/**
 * `2026-08-14T09:12:03Z` → epoch ms, or undefined.
 *
 * Undefined rather than null, and rather than a fallback to "now": a "new
 * pools" row whose age is unknown must not be drawn as freshly minted, and the
 * optional field is what lets a consumer drop it instead.
 */
export function parsePoolCreatedAt(
  raw: string | null | undefined,
): number | undefined {
  if (!raw) return undefined
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : undefined
}

/**
 * A window's trade counts, or null when the provider published none.
 *
 * Null rather than `{buys: 0, sells: 0}`: a pool map that sizes tiles by trade
 * count has to tell "nobody traded this" from "this listing does not carry
 * counts", and a zeroed object collapses the two into a tile of no area.
 * Buyers and sellers stay nullable because only the wallet-aware windows
 * publish them.
 */
export function parseTradeCounts(
  window:
    | {
        buys?: number | string | null
        sells?: number | string | null
        buyers?: number | string | null
        sellers?: number | string | null
      }
    | null
    | undefined,
): PoolTradeCounts | null {
  if (!window) return null
  const buys = numberOrNull(window.buys)
  const sells = numberOrNull(window.sells)
  if (buys === null && sells === null) return null
  return {
    buys: buys ?? 0,
    sells: sells ?? 0,
    buyers: numberOrNull(window.buyers),
    sellers: numberOrNull(window.sellers),
  }
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
  const createdAtMs = parsePoolCreatedAt(attrs.pool_created_at)

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
    trades24h: parseTradeCounts(attrs.transactions?.['h24']),
    fdvUsd: numberOrNull(attrs.fdv_usd),
    // Only `/new_pools` publishes it. Spread so a ranked-pool row keeps the
    // key absent rather than carrying an explicit undefined into a store.
    ...(createdAtMs === undefined ? {} : { createdAtMs }),
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

/**
 * Short-lived cache of a network's page, and an in-flight map beside it.
 *
 * Two independent surfaces read this endpoint for the same chain: the pool map
 * asks for the selected chain's listing, and the chain rail asks for every
 * connected chain to sum its aggregate row. They are separate queries with
 * separate cadences on the terminal side and no way to see each other, so
 * opening a board on six chains spent seven requests where six would do, and
 * every rail refresh repeated the overlap.
 *
 * The TTL is deliberately far shorter than either caller's own stale window
 * (five minutes), so this only ever collapses duplicates and never makes a pane
 * show older data than it asked for. The in-flight map does the same for
 * requests that overlap rather than repeat, which is what a board opening from
 * cold actually looks like.
 */
const LISTING_TTL_MS = 60_000
const listingCache = new Map<
  string,
  { pools: Array<PoolListingEntry>; ts: number }
>()
const listingInFlight = new Map<string, Promise<Array<PoolListingEntry>>>()

/** How a listing page is ordered by the provider. */
export type PoolListingSort = 'trending' | 'volume'

/**
 * Top pools on a network, one page per request.
 *
 * The provider's default order is its trending feed, which on chains with
 * cheap blockspace is dominated by bot-painted pools; `sort: 'volume'` asks
 * for the volume ranking instead, which is where the real top pools live once
 * the map's quality bar strips the fakes. Distinct cache key per order, so a
 * trending consumer and a volume consumer never poison each other's page.
 * Throws on a failed request (see fetchPoolStats).
 */
export function fetchTopPools(
  network: string,
  page = 1,
  sort: PoolListingSort = 'trending',
): Promise<Array<PoolListingEntry>> {
  const sortParam = sort === 'volume' ? '&sort=h24_volume_usd_desc' : ''
  return cachedListing(`${network}:${sort}:${page}`, () =>
    requestPoolPage(
      `${API_BASE}/networks/${network}/pools?page=${page}${sortParam}`,
      {
        network,
        label: 'pools',
      },
    ),
  )
}

/**
 * Several listing pages as one deduped list, first appearance wins.
 *
 * The volume ranking repeats a pool across page boundaries when the ranking
 * shifts mid-walk, and a treemap keyed by address would render the duplicate
 * as a phantom tile.
 */
export function mergePoolPages(
  pages: ReadonlyArray<ReadonlyArray<PoolListingEntry>>,
): Array<PoolListingEntry> {
  const seen = new Set<string>()
  const merged: Array<PoolListingEntry> = []
  for (const page of pages) {
    for (const pool of page) {
      const key = `${pool.network}:${pool.address}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(pool)
    }
  }
  return merged
}

/**
 * The chain's most recently created pools, newest first as the provider orders
 * them, each row carrying `createdAtMs`.
 *
 * Same rows as `fetchTopPools` plus the creation time, and a DISTINCT cache key
 * prefix: the two endpoints answer different questions about the same chain and
 * collapsing them would serve a ranked page as a listing feed. The shared cache
 * still does its job — two panes asking the same chain for new pools spend one
 * request.
 */
export function fetchNewPools(
  network: string,
  page = 1,
): Promise<Array<PoolListingEntry>> {
  return cachedListing(`new:${network}:${page}`, () =>
    requestPoolPage(`${API_BASE}/networks/${network}/new_pools?page=${page}`, {
      network,
      label: 'new_pools',
    }),
  )
}

/** Cache + in-flight collapse, shared by both listing endpoints. */
function cachedListing(
  key: string,
  request: () => Promise<Array<PoolListingEntry>>,
): Promise<Array<PoolListingEntry>> {
  const cached = listingCache.get(key)
  if (cached && Date.now() - cached.ts < LISTING_TTL_MS) {
    return Promise.resolve(cached.pools)
  }
  const existing = listingInFlight.get(key)
  if (existing) return existing

  const pending = request()
    .then((pools) => {
      listingCache.set(key, { pools, ts: Date.now() })
      return pools
    })
    .finally(() => {
      // A throttle must not be cached as an answer: the entry is only written
      // on success, and the slot is freed either way so the next caller retries.
      listingInFlight.delete(key)
    })
  listingInFlight.set(key, pending)
  return pending
}

async function requestPoolPage(
  url: string,
  meta: { network: string; label: string },
): Promise<Array<PoolListingEntry>> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `GeckoTerminal ${meta.label} ${meta.network}: HTTP ${res.status}`,
    )
  }
  const json = (await res.json()) as { data?: Array<RawGeckoPoolRow> }
  return parsePoolListing(json.data, meta.network)
}

/** Drop every cached page. Called when the plugin is torn down. */
export function clearListingCache(): void {
  listingCache.clear()
  listingInFlight.clear()
}
