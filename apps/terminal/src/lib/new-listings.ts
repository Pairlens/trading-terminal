// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What started trading recently, from two sources that agree on nothing except
 * a timestamp.
 *
 * A CEX listing is a fact about OUR sweeper: the App Server stamps the first
 * time it saw a venue list a pair, so the age is accurate to the sweep interval
 * and never earlier than the day tracking began. A DEX pool publishes its own
 * creation block, which is exact. Merging them into one feed is the point of
 * the tab, and the only field both can answer honestly is "when", so that is
 * what the list is ordered by and the only thing the two row shapes share.
 *
 * The liquidity floor is the other half of the design. GeckoTerminal's new-pools
 * page is mostly deployments: pools created minutes ago with a few dollars in
 * them, dozens per chain per hour. Listing those beside a real venue listing
 * would bury the two or three rows a reader came for, so a pool has to publish
 * a measurable reserve above the floor to appear at all. A CEX row has no
 * liquidity figure and is never filtered by one.
 */
import type {
  NewListingEntry,
  PoolListingEntry,
} from '@pairlens/shared/instrument-types'
import type { NewPoolRow } from '@/hooks/use-pool-stats'
import { measurableReserveUsd } from '@/lib/dex/pool-math'

/**
 * A pool below this is a deployment, not a market: nobody can trade a thousand
 * dollars of depth without moving it double digits. Low enough that a genuine
 * small launch still appears, high enough that the feed is readable.
 */
export const MIN_NEW_POOL_LIQUIDITY_USD = 1_000

export type NewListingRowKind = 'cex' | 'dex'

/**
 * One row of the merged feed.
 *
 * `key` is what keeps a memoized row from remounting across refetches, so it
 * is built from identity (venue + pair, chain + pool address) and never from
 * the row's position or its timestamp.
 */
export type NewListingRow = {
  key: string
  kind: NewListingRowKind
  /** Epoch ms. First-seen for a CEX pair, creation time for a pool. */
  listedAt: number
  /** `BTC-USDT` for a venue listing, the pool's own label for a pool. */
  label: string
  /** Venue id for a CEX row, Pairlens market id for a DEX row. Routes the click. */
  market: string
  base: string | null
  quote: string | null
  /** USD, when the source publishes one. DEX rows always do; CEX rows never. */
  priceUsd: number | null
  /** Measurable pool reserves in USD. Always null on a CEX row. */
  liquidityUsd: number | null
  /** The provider's own pool row, for identity-keyed routing. Null on CEX. */
  pool: PoolListingEntry | null
}

export function cexListingRow(entry: NewListingEntry): NewListingRow {
  return {
    key: `cex:${entry.venue}:${entry.pairKey}`,
    kind: 'cex',
    listedAt: entry.firstSeenAt,
    label: entry.pairKey,
    market: entry.venue,
    base: entry.base,
    quote: entry.quote,
    // The endpoint carries no price, and inventing one from a different pair's
    // quote would be worse than the dash. The pane fills it from the snapshot
    // it already holds when the coin happens to be in it.
    priceUsd: null,
    liquidityUsd: null,
    pool: null,
  }
}

export function dexListingRow(row: NewPoolRow): NewListingRow | null {
  const { market, pool } = row
  // No creation time means no place in a list ordered by age. GeckoTerminal
  // publishes it on this endpoint, so a missing one is a malformed row.
  if (pool.createdAtMs === undefined) return null
  const liquidityUsd = measurableReserveUsd(pool.reserveUsd)
  if (liquidityUsd === null || liquidityUsd < MIN_NEW_POOL_LIQUIDITY_USD) {
    return null
  }
  return {
    key: `dex:${pool.network}:${pool.address}`,
    kind: 'dex',
    listedAt: pool.createdAtMs,
    label:
      pool.name || `${pool.baseSymbol ?? '?'} / ${pool.quoteSymbol ?? '?'}`,
    market,
    base: pool.baseSymbol,
    quote: pool.quoteSymbol,
    priceUsd: pool.priceUsd,
    liquidityUsd,
    pool,
  }
}

/**
 * Both sources into one list, newest first.
 *
 * Ties break on kind then key rather than being left to the input order: two
 * pools created in the same block, or a sweep that saw a listing wave in one
 * pass, must not swap places between refetches under a reader's cursor.
 */
export function mergeNewListings(
  cex: ReadonlyArray<NewListingEntry>,
  dex: ReadonlyArray<NewPoolRow>,
  limit = 60,
): Array<NewListingRow> {
  const rows: Array<NewListingRow> = cex.map(cexListingRow)
  for (const entry of dex) {
    const row = dexListingRow(entry)
    if (row) rows.push(row)
  }
  rows.sort(
    (a, b) =>
      b.listedAt - a.listedAt ||
      a.kind.localeCompare(b.kind) ||
      a.key.localeCompare(b.key),
  )
  return rows.slice(0, limit)
}
