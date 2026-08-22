// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { rankItems } from './fuzzy'
import type { MarketResult } from './omni-search-types'
import type { MarketOption } from '@/hooks/use-available-markets'

/**
 * Venue results for the omni search palette.
 *
 * The input is whatever `useAvailableMarkets()` reports, which is derived from
 * the ACTIVE connector plugins — so a venue whose connector is uninstalled or
 * disabled never reaches this function, and a third-party connector installed
 * from the store shows up with no change here.
 */

/** Aliases every venue answers to, so "exchange" lists the whole lot. */
const VENUE_KEYWORDS = ['venue', 'exchange', 'market', 'connector']

/** Aliases per asset class — "dex" or "stocks" narrows to those venues. */
const ASSET_CLASS_KEYWORDS: Record<string, Array<string>> = {
  'crypto-spot': ['cex', 'spot', 'crypto'],
  'crypto-perp': ['cex', 'perp', 'perpetual', 'futures'],
  dex: ['dex', 'onchain', 'swap', 'wallet'],
  stocks: ['stocks', 'equities', 'shares', 'broker'],
  prediction: ['prediction', 'predictions', 'events'],
  nft: ['nft', 'nfts', 'collection', 'collections', 'marketplace'],
}

/**
 * Shortest query that may match an alias rather than a venue's own name.
 * One or two characters substring-match inside words like "exchange", which
 * would push every installed connector above the pair the user is typing.
 */
const MIN_ALIAS_QUERY = 3

function toResult(option: MarketOption, activeMarket: string): MarketResult {
  return {
    type: 'market',
    marketId: option.value,
    label: option.label,
    iconUrl: option.iconUrl,
    assetClass: option.assetClasses[0],
    isActive: option.value === activeMarket,
    desktopOnly: option.desktopOnly,
  }
}

export type MarketResults = {
  items: Array<MarketResult>
  topScore: number
  /**
   * The query names a venue outright ("okx", "gate.io"). Ambiguity is gone at
   * that point, so the caller lifts venues above the pair results — every
   * exchange has memecoins carrying its own name, and those should not stand
   * between "okx" and OKX.
   */
  namesVenue: boolean
}

export function buildMarketResults(
  query: string,
  markets: Array<MarketOption>,
  activeMarket: string,
): MarketResults {
  const items = markets.map((m) => toResult(m, activeMarket))
  const q = query.trim()

  // Browse mode: the venue in use leads, the rest keep connector order.
  if (!q) {
    return {
      items: [...items].sort((a, b) => Number(b.isActive) - Number(a.isActive)),
      topScore: 0,
      namesVenue: false,
    }
  }

  const withAliases = q.length >= MIN_ALIAS_QUERY
  const ranked = rankItems(q, items, {
    // The market id is a keyword rather than the primary label so highlight
    // ranges always index into the label the row renders ("Gate.io" vs "gate").
    primary: (m) => m.label,
    keywords: (m) => [
      m.marketId,
      ...(withAliases
        ? [
            ...(ASSET_CLASS_KEYWORDS[m.assetClass ?? ''] ?? []),
            ...VENUE_KEYWORDS,
          ]
        : []),
    ],
  })

  const needle = q.toLowerCase()
  return {
    items: ranked.map(({ item, ranges }) => ({ ...item, matchRanges: ranges })),
    topScore: ranked[0]?.score ?? 0,
    namesVenue: items.some(
      (m) =>
        m.marketId.toLowerCase() === needle || m.label.toLowerCase() === needle,
    ),
  }
}
