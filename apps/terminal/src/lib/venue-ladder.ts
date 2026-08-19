// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which venue to send the order to, ordered so the answer is the top row.
 *
 * The ladder is a buy-side board by default: the venue with the lowest ask is
 * where the next market buy fills best, so that row is first and carries the
 * badge. Flipping to the sell side reverses both. Nothing here is about the
 * mid — a trader crossing a spread pays the far side, and ranking on last
 * price (which is what a cross-venue price table does) would recommend a venue
 * whose book is nowhere near it.
 *
 * Three exclusions from ranking, each for a different reason:
 *  - a quote that is not `live` (stale, snapshot-only, unlisted, unreachable)
 *    still renders, because a real number from ninety seconds ago is worth
 *    seeing, but crowning it points at a fill that may not exist;
 *  - a venue with no real book — several data providers fabricate bid/ask by
 *    nudging `last`, which `hasRealBook` recognises by its exact shape. This
 *    is about fabricated quotes, not about where a real one came from: for
 *    the venues that publish no top of book on their ticker channel, the
 *    quote arrives from the venue's own order book (see `useVenueQuotes`'s
 *    `topOfBook`) and ranks like any other;
 *  - a locked or crossed book, which `hasRealBook` also refuses.
 *
 * Ranking needs at least two qualifying venues. "Best of one" is not a
 * comparison, and badging a lone venue as best is the kind of statement that
 * reads as verified when it is merely unopposed.
 */
import type { VenueQuote, VenueQuoteStatus } from '@/hooks/use-venue-quotes'
import { hasRealBook } from '@/lib/venue-spread'

export type LadderSide = 'buy' | 'sell'

export type LadderRow = {
  market: string
  bid: number | null
  ask: number | null
  /** Top-of-book spread in basis points; null without a real two-sided book. */
  spreadBps: number | null
  status: VenueQuoteStatus
  /** Top of book is still being chased — see `VenueQuote.bookPending`. */
  bookPending: boolean
  /** Took part in the ranking — a live, real, two-sided book. */
  ranked: boolean
  /** Best price on the active side, among at least two ranked venues. */
  isBest: boolean
}

/**
 * (ask − bid) / mid, in basis points.
 *
 * Against the mid rather than the bid, so buying and selling the same book
 * report the same width. Null when either side is missing or the book is
 * crossed, which is stale data rather than a negative spread.
 */
export function spreadBps(
  bid: number | null,
  ask: number | null,
): number | null {
  if (bid === null || ask === null) return null
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null
  if (bid <= 0 || ask <= 0 || ask < bid) return null
  const mid = (ask + bid) / 2
  if (mid <= 0) return null
  return ((ask - bid) / mid) * 10_000
}

/**
 * Where a venue sits once it is out of the ranking: still-connecting first,
 * then settled answers, so the bottom of the ladder is the part that will not
 * change.
 */
function unrankedOrder(status: VenueQuoteStatus): number {
  switch (status) {
    case 'live':
      return 0
    case 'stale':
      return 1
    case 'pending':
      return 2
    case 'no-data':
      return 3
    case 'unlisted':
      return 4
    case 'desktop-only':
      return 5
    default:
      return 6
  }
}

export function buildVenueLadder(
  quotes: ReadonlyArray<VenueQuote>,
  side: LadderSide,
): Array<LadderRow> {
  const rows = quotes.map((quote): LadderRow => {
    const ranked = quote.status === 'live' && hasRealBook(quote)
    return {
      market: quote.market,
      bid: quote.bid,
      ask: quote.ask,
      spreadBps: ranked ? spreadBps(quote.bid, quote.ask) : null,
      status: quote.status,
      bookPending: quote.bookPending,
      ranked,
      isBest: false,
    }
  })

  const priceOf = (row: LadderRow): number | null =>
    side === 'buy' ? row.ask : row.bid

  rows.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1
    if (a.ranked && b.ranked) {
      const left = priceOf(a)
      const right = priceOf(b)
      if (left !== null && right !== null && left !== right) {
        return side === 'buy' ? left - right : right - left
      }
      return a.market.localeCompare(b.market)
    }
    return (
      unrankedOrder(a.status) - unrankedOrder(b.status) ||
      a.market.localeCompare(b.market)
    )
  })

  const rankedCount = rows.filter((r) => r.ranked).length
  if (rankedCount > 1 && rows[0]) rows[0].isBest = true

  return rows
}
