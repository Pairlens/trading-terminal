// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Filling one provider's gaps from another, without either one lying about the
 * other's numbers.
 *
 * The problem this solves is narrow and old: GeckoTerminal publishes value
 * locked in USD and nothing per side, so the pool pane's reserves cell has been
 * a dash and the words "only on desktop" for as long as DexPaprika (which does
 * publish both sides, behind no CORS header) was the only alternative. The
 * capability resolver picks ONE provider per capability, and the primary answers
 * successfully, so a lower-priority provider is never consulted. A supplement
 * has to be a second, explicit read.
 *
 * Three rules make that safe, and each one is a way this goes wrong:
 *
 *  1. **Same pool, or no merge.** Two providers resolve pools independently and
 *     do not agree: for SOL/USDC, GeckoTerminal picks a Raydium pool and
 *     DexScreener an Orca whirlpool. Reserves from one pool beside value locked
 *     from another would be a depth the user could size against that no pool
 *     has. The supplement is therefore fetched BY the primary's own pool
 *     address, and `samePool` is the assertion that it was.
 *  2. **Fill, never overwrite.** A field the primary published stays the
 *     primary's, always. The merged row is the primary's answer plus what it did
 *     not have.
 *  3. **Identity is never filled.** `network`, `address`, `name`, `dexName` and
 *     `source` stay the primary's even when null-ish, because those are what the
 *     row claims to BE. A merged row that reported DexScreener's `source` would
 *     make every other number look like DexScreener measured it.
 *
 * The one honest wrinkle: the two providers sampled at slightly different
 * moments, so a filled window figure can be a few seconds out of step with its
 * neighbours. That is a smaller distortion than a dash, and provenance is
 * reported so the pane can say where a cell came from.
 */
import type {
  PoolStats,
  PoolStatsSource,
} from '@pairlens/shared/instrument-types'

/**
 * What the row claims to be, as opposed to what it measured. Never filled from a
 * supplement. Everything else in `PoolStats` is fair game when it is null.
 */
const IDENTITY_FIELDS = new Set<keyof PoolStats>([
  'network',
  'address',
  'name',
  'dexName',
  'source',
])

export type PoolStatsMerge = {
  stats: PoolStats | null
  /** Provider that filled at least one field. null when nothing was filled. */
  filledBy: PoolStatsSource | null
  /** The fields it filled, in `PoolStats` declaration order. */
  filled: Array<keyof PoolStats>
}

const NOTHING_MERGED: PoolStatsMerge = {
  stats: null,
  filledBy: null,
  filled: [],
}

/**
 * Whether two rows are about the same pool.
 *
 * Address only, case-insensitively. NOT the network: providers use different
 * slugs for the same chain (`eth` here, `ethereum` there), so comparing them
 * would refuse every EVM merge. A pool address is unique on its chain, and the
 * supplement was asked for that address on the chain the same market resolved.
 */
export function samePool(a: PoolStats, b: PoolStats): boolean {
  const left = a.address.trim().toLowerCase()
  const right = b.address.trim().toLowerCase()
  return left.length > 0 && left === right
}

/** Does this row still owe the pane both-side reserves? */
export function needsReserves(stats: PoolStats | null): boolean {
  if (!stats) return false
  return stats.baseReserve === null && stats.quoteReserve === null
}

/**
 * The primary's row with its null fields filled from the supplement.
 *
 * Returns the primary untouched (and `filledBy: null`) when there is no
 * supplement, when it describes a different pool, or when it had nothing the
 * primary was missing. Object identity is preserved in that case, so a pane
 * memoized on `stats` does not re-render because a supplement arrived empty.
 */
export function mergePoolStats(
  primary: PoolStats | null,
  supplement: PoolStats | null,
): PoolStatsMerge {
  if (!primary) return NOTHING_MERGED
  if (!supplement || !samePool(primary, supplement)) {
    return { stats: primary, filledBy: null, filled: [] }
  }

  const filled: Array<keyof PoolStats> = []
  const merged = { ...primary }
  // The cast is the price of a generic fill over a wide record type. It is the
  // same key on both sides, so the value's type is too.
  const sink = merged as Record<string, unknown>
  for (const key of Object.keys(primary) as Array<keyof PoolStats>) {
    if (IDENTITY_FIELDS.has(key)) continue
    if (primary[key] !== null && primary[key] !== undefined) continue
    const value = supplement[key]
    if (value === null || value === undefined) continue
    sink[key] = value
    filled.push(key)
  }

  if (filled.length === 0) {
    return { stats: primary, filledBy: null, filled: [] }
  }
  return { stats: merged, filledBy: supplement.source, filled }
}

/** Human-readable provider label for a source id, for a provenance line. */
export function providerLabel(source: PoolStatsSource): string {
  switch (source) {
    case 'geckoterminal':
      return 'GeckoTerminal'
    case 'dexpaprika':
      return 'DexPaprika'
    case 'dexscreener':
      return 'DexScreener'
  }
}
