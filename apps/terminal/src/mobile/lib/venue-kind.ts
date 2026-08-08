// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What KIND of venue a market is — the middle word in every "venue · what it
 * trades · what you may do" line on the phone.
 *
 * The design writes that line three ways (`OKX spot · trading`,
 * `Jupiter on-chain`, `Alpaca equities · trading`), so the watchlist rows, the
 * pair-picker results and the venue picker all need the same answer. One
 * derivation, three callers — a copy in each would drift the first time a
 * connector declares a new asset class.
 *
 * Pure and hook-free on purpose: callers already hold the adapter list, and a
 * hook here would drag `useMarketData` into a list row that has it in scope.
 */
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'

export type VenueKind = 'cex' | 'dex' | 'equities'

/** i18n key per kind. Static keys — the catalog audit cannot follow a template. */
export const VENUE_KIND_KEY: Record<VenueKind, string> = {
  cex: 'mobile.pickers.spot',
  dex: 'mobile.pickers.onChain',
  equities: 'mobile.pickers.equities',
}

/**
 * A DEX is whatever needs a wallet; equities is whatever declares the stocks
 * asset class; everything else is a centralized spot venue. An unknown market
 * reads as `cex`, which is what fourteen of the fifteen connectors are.
 */
export function venueKindFor(info: MarketAdapterInfo | undefined): VenueKind {
  if (!info) return 'cex'
  if (info.walletChain) return 'dex'
  if (info.assetClasses.includes('stocks')) return 'equities'
  return 'cex'
}

/** Same answer from a market id plus the adapter list the caller already has. */
export function venueKindOf(
  market: string,
  adapters: Array<MarketAdapterInfo>,
): VenueKind {
  return venueKindFor(adapters.find((m) => m.marketId === market))
}
