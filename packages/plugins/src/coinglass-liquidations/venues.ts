// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which venues this plugin claims, and what each venue's stream is worth.
 *
 * Two separate facts live in one table on purpose. The first is a translation:
 * the terminal names a venue `binance-futures` and Coinglass names it
 * `Binance`, and nothing else in the codebase knows both. The second is the
 * honesty flag: the plugin re-serves a venue's own liquidation feed, so what
 * that feed carries upstream is what our numbers can mean. Binance publishes
 * at most one force-order per symbol per second, which undercounts exactly
 * during a cascade; Bybit publishes every one.
 *
 * The exchange name here is a CANDIDATE, not a constant. Coinglass's own
 * casing has moved (`Kucoin` vs `KuCoin` appear in different doc pages), so
 * the client resolves the live spelling from `/liquidation/exchange-list` —
 * an endpoint every plan can call — and matches case-insensitively. A venue
 * the live list does not carry is refused rather than guessed at.
 */
import type { LiquidationCompleteness } from '@pairlens/shared/instrument-types'

export type CoinglassVenue = {
  /** Terminal market id, as the liquidation pane asks with. */
  venue: string
  /** Coinglass `exchange` parameter, expected casing. */
  exchange: string
  /**
   * What the UPSTREAM venue stream carries. A per-request threshold or a
   * truncated page can only ever make an answer less complete than this, never
   * more, so `resolveCompleteness` treats this as the ceiling.
   */
  streamCompleteness: LiquidationCompleteness
}

/**
 * The four perpetual venues the terminal has market ids for.
 *
 * `bybit-futures` is here even though no Bybit perps connector ships yet: the
 * liquidation pane resolves a provider by venue string, and the App Server's
 * own Bybit collector uses the same id. A venue nobody can chart simply never
 * gets asked.
 *
 * Deliberately NOT wildcarded. `markets: ['*']` would let this plugin win a
 * resolution for a venue Coinglass does not carry, and "no aggregate feed for
 * this venue" is a fact the pane must be able to state without spending a
 * paid request to discover it.
 */
export const COINGLASS_VENUES: ReadonlyArray<CoinglassVenue> = [
  {
    venue: 'binance-futures',
    exchange: 'Binance',
    // Binance's !forceOrder stream pushes "only the latest one liquidation
    // order within 1000ms" per symbol. Coinglass consumes that same public
    // stream, so a vendor in front of it cannot restore what it never sent.
    streamCompleteness: 'sampled',
  },
  {
    venue: 'bybit-futures',
    exchange: 'Bybit',
    // allLiquidation pushes every liquidation, sub-$100 prints included.
    streamCompleteness: 'complete',
  },
  {
    venue: 'kucoin-futures',
    exchange: 'Kucoin',
    // No published statement either way. 'sampled' is the answer that cannot
    // overstate the data, and overstating is the failure that matters here.
    streamCompleteness: 'sampled',
  },
  {
    venue: 'kraken-futures',
    exchange: 'Kraken',
    streamCompleteness: 'sampled',
  },
]

export const COINGLASS_VENUE_IDS: ReadonlyArray<string> = COINGLASS_VENUES.map(
  (v) => v.venue,
)

export function coinglassVenue(venue: string): CoinglassVenue | null {
  return COINGLASS_VENUES.find((v) => v.venue === venue) ?? null
}

/** Coinglass keeps liquidation orders for 7 days. Stated, never implied. */
export const COINGLASS_RETENTION_MS = 7 * 24 * 3_600_000
