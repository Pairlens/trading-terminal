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
  /**
   * The eight figures below are the pool read's alone. A listing row publishes
   * none of them except `fdvUsd`, so they collapse rather than resolve to the
   * snapshot: the same whole-object rule, read the other way round.
   */
  change1hPct: number | null
  volume1hUsd: number | null
  /** Base priced in the quote token, and what a unit of that quote is worth. */
  priceInQuote: number | null
  quotePriceUsd: number | null
  /** Both sides in token units, where a provider published them. */
  baseReserve: number | null
  quoteReserve: number | null
  /** 24h buy/sell notionals. DexPaprika publishes these; GeckoTerminal doesn't. */
  buyVolume24hUsd: number | null
  sellVolume24hUsd: number | null
  createdAt: string | null
  fdvUsd: number | null
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
      change1hPct: stats.change1hPct,
      volume1hUsd: stats.volume1hUsd,
      priceInQuote: stats.priceInQuote,
      quotePriceUsd: stats.quotePriceUsd,
      baseReserve: stats.baseReserve,
      quoteReserve: stats.quoteReserve,
      buyVolume24hUsd: stats.buyVolume24hUsd,
      sellVolume24hUsd: stats.sellVolume24hUsd,
      createdAt: stats.createdAt,
      fdvUsd: stats.fdvUsd,
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
    change1hPct: null,
    volume1hUsd: null,
    priceInQuote: null,
    quotePriceUsd: null,
    baseReserve: null,
    quoteReserve: null,
    buyVolume24hUsd: null,
    sellVolume24hUsd: null,
    createdAt: null,
    // The one figure of the eight a listing row does carry. It is the map's
    // own measurement of the same thing, taken in the same tick as price and
    // volume, so it is not a blend.
    fdvUsd: listed.fdvUsd,
    live: false,
  }
}
