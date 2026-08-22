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
import type { InstrumentClass } from '@pairlens/shared/market-ref'

export type VenueKind =
  | 'cex'
  | 'dex'
  | 'equities'
  | 'prediction'
  | 'futures'
  | 'nft'

/**
 * The instrument class a kind trades, which is what the phone paints it with.
 *
 * A fourth spelling of the same axis, and the last one: the two vocabularies
 * are genuinely about different things (a kind is a property of a VENUE, a
 * class is a property of an INSTRUMENT) and this is the one place they meet,
 * so the colour a filter chip wears matches the badge on the pair it finds.
 */
export const VENUE_KIND_CLASS: Record<VenueKind, InstrumentClass> = {
  cex: 'spot',
  dex: 'dex',
  equities: 'stocks',
  prediction: 'prediction',
  futures: 'perp',
  nft: 'nft',
}

/** i18n key per kind. Static keys — the catalog audit cannot follow a template. */
export const VENUE_KIND_KEY: Record<VenueKind, string> = {
  cex: 'mobile.pickers.spot',
  dex: 'mobile.pickers.onChain',
  equities: 'mobile.pickers.equities',
  prediction: 'mobile.pickers.predictions',
  futures: 'mobile.pickers.futures',
  nft: 'mobile.pickers.nfts',
}

/**
 * Asset class first, wallet second. Polymarket signs with an EVM key and so
 * declares a `walletChain`, but it is an event exchange, not a DEX — testing
 * the wallet first would have labelled it "on-chain" and filed it with
 * Jupiter. `walletChain` answers "what unlocks trading here", never "what is
 * this venue".
 *
 * After that: equities is whatever declares the stocks asset class, futures is
 * whatever declares the perp one, a DEX is whatever else needs a wallet, and
 * everything else is a centralized spot venue. An unknown market reads as
 * `cex`, which is what most connectors are.
 *
 * NFTs sit above the wallet test for that same reason: OpenSea signs with an
 * EVM key and declares a `walletChain`, so the wallet test would have filed a
 * marketplace next to Jupiter and painted a collection as an on-chain token.
 *
 * Futures sits above the wallet test for the same reason predictions does, and
 * above the spot fallback because a perp venue IS a centralized exchange —
 * "Binance Futures spot · trading" is the line the fallback would have
 * written.
 */
export function venueKindFor(info: MarketAdapterInfo | undefined): VenueKind {
  if (!info) return 'cex'
  if (info.assetClasses.includes('prediction')) return 'prediction'
  if (info.assetClasses.includes('nft')) return 'nft'
  if (info.assetClasses.includes('stocks')) return 'equities'
  if (info.assetClasses.includes('crypto-perp')) return 'futures'
  if (info.walletChain) return 'dex'
  return 'cex'
}

/** Same answer from a market id plus the adapter list the caller already has. */
export function venueKindOf(
  market: string,
  adapters: Array<MarketAdapterInfo>,
): VenueKind {
  return venueKindFor(adapters.find((m) => m.marketId === market))
}
