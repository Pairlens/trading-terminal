// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which numbers the pool detail pane draws, and where they came from.
 *
 * The pane has two possible sources for the same six figures. The live pool
 * read is the better one and the one it wants. The map listing that selected
 * the pool is the one it already has, for free, in the same tick as the click
 * — the tile the reader just pressed is drawn from those very numbers.
 *
 * So the rule is: live state when it has landed, the listing row until then,
 * and never a blend of the two. Field-by-field merging looks generous and
 * publishes ratios nobody measured: a fresh volume over a five-minute-old
 * reserve is a turnover figure neither provider would stand behind. Whole
 * object, one source at a time, and `live` says which so the pane can label it.
 */
import type {
  PoolStats,
  PoolTradeCounts,
} from '@pairlens/shared/instrument-types'

import type { SelectedPoolSnapshot } from '@/lib/dex/discovery-store'

export type PoolView = {
  priceUsd: number | null
  change24hPct: number | null
  volume24hUsd: number | null
  reserveUsd: number | null
  trades24h: PoolTradeCounts | null
  /** Only the pool read carries one; a listing row never does. */
  feeTier: number | null
  /** True when these are the pool read rather than the map's snapshot. */
  live: boolean
}

export function poolDetailView(
  stats: PoolStats | null,
  listed: SelectedPoolSnapshot,
): PoolView {
  if (stats) {
    return {
      priceUsd: stats.priceUsd,
      change24hPct: stats.change24hPct,
      volume24hUsd: stats.volume24hUsd,
      reserveUsd: stats.reserveUsd,
      trades24h: stats.trades24h,
      feeTier: stats.feeTier,
      live: true,
    }
  }
  return {
    priceUsd: listed.priceUsd,
    change24hPct: listed.change24hPct,
    volume24hUsd: listed.volume24hUsd,
    reserveUsd: listed.reserveUsd,
    trades24h: listed.trades24h,
    feeTier: null,
    live: false,
  }
}
