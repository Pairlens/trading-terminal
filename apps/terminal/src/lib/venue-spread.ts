// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Cross-venue price arithmetic for the multi-price pane — pure functions over
 * a list of venue quotes, no React and no I/O, so the numbers a trader would
 * act on are testable in isolation.
 *
 * Two different questions live here, and mixing them is what makes a
 * cross-exchange panel lie:
 *
 * 1. "Where is this pair cheap and where is it dear?" — answered from `last`,
 *    the only field every venue reports honestly. That is `summarizeQuotes`.
 * 2. "Is there an executable spread?" — answered from top-of-book, buying the
 *    lowest ask and selling the highest bid. That is `findArbEdge`, and it
 *    only ever looks at venues that publish a real book (several connectors
 *    synthesize bid/ask from `last`, and one sends zeroes), because a spread
 *    computed against a made-up quote is worse than no spread at all.
 */

export type VenuePrice = {
  market: string
  /** Last traded price, or null when the venue hasn't reported one. */
  last: number | null
  /** Top-of-book bid, when the venue publishes a real one. */
  bid: number | null
  /** Top-of-book ask, when the venue publishes a real one. */
  ask: number | null
}

export type VenueExtreme = { market: string; price: number }

export type SpreadSummary = {
  /** Cheapest venue by last price — where you would buy. */
  low: VenueExtreme | null
  /** Dearest venue by last price — where you would sell. */
  high: VenueExtreme | null
  /** Midpoint of the priced venues, the reference every row's premium uses. */
  median: number | null
  /** high − low, in quote currency. */
  spreadAbs: number
  /** (high − low) / low, in percent. */
  spreadPct: number
  /** How many venues contributed a price. */
  pricedCount: number
}

export type ArbEdge = {
  buyMarket: string
  buyAsk: number
  sellMarket: string
  sellBid: number
  /** (bid − ask) / ask, in percent. Positive means the books cross. */
  edgePct: number
}

const isPositive = (v: number | null): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

/** Multiplier the AMM data providers use to fabricate a book around `last`. */
const SYNTHETIC_BID_FACTOR = 0.999
const SYNTHETIC_ASK_FACTOR = 1.001
/** Float tolerance for recognising that fabrication after a JSON round trip. */
const SYNTHETIC_EPSILON = 1e-6

/**
 * A quote whose bid/ask can be traded against rather than inferred.
 *
 * Connectors with no book to report either leave bid/ask at zero (MEXC) or
 * fabricate one by nudging `last` — GeckoTerminal and DexPaprika both publish
 * `last * 0.999` / `last * 1.001`, which is an AMM mid dressed as a book.
 *
 * The fabrication is detected by its exact shape rather than by how wide it
 * is: a width test would also throw away the genuinely illiquid venues, and
 * those are precisely where a cross-venue edge tends to live.
 */
export function hasRealBook(q: VenuePrice): q is VenuePrice & {
  bid: number
  ask: number
} {
  if (!isPositive(q.bid) || !isPositive(q.ask)) return false
  // A crossed or locked book from a single venue is stale data, not an edge.
  if (q.ask <= q.bid) return false
  if (isPositive(q.last)) {
    const bidOff = Math.abs(q.bid / q.last - SYNTHETIC_BID_FACTOR)
    const askOff = Math.abs(q.ask / q.last - SYNTHETIC_ASK_FACTOR)
    if (bidOff < SYNTHETIC_EPSILON && askOff < SYNTHETIC_EPSILON) return false
  }
  return true
}

/**
 * Rank the priced venues and measure how far apart they are.
 *
 * Venues with no price yet are skipped rather than treated as zero — an
 * unlisted venue must not become the "cheapest" one.
 */
export function summarizeQuotes(
  quotes: ReadonlyArray<VenuePrice>,
): SpreadSummary {
  const priced = quotes.filter((q): q is VenuePrice & { last: number } =>
    isPositive(q.last),
  )

  if (priced.length === 0) {
    return {
      low: null,
      high: null,
      median: null,
      spreadAbs: 0,
      spreadPct: 0,
      pricedCount: 0,
    }
  }

  let low = priced[0]
  let high = priced[0]
  for (const q of priced) {
    if (q.last < low.last) low = q
    if (q.last > high.last) high = q
  }

  const sorted = priced.map((q) => q.last).sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2

  const spreadAbs = high.last - low.last

  return {
    low: { market: low.market, price: low.last },
    high: { market: high.market, price: high.last },
    median,
    spreadAbs,
    spreadPct: (spreadAbs / low.last) * 100,
    pricedCount: priced.length,
  }
}

/**
 * Percentage a venue's price sits above (+) or below (−) a reference.
 *
 * Returns null rather than 0 when either side is missing, so the UI can leave
 * the cell blank instead of claiming parity it hasn't measured.
 */
export function premiumPct(
  price: number | null,
  reference: number | null,
): number | null {
  if (!isPositive(price) || !isPositive(reference)) return null
  return ((price - reference) / reference) * 100
}

/**
 * The best executable round trip across venues: buy the lowest ask, sell the
 * highest bid, both from venues that publish a real book.
 *
 * Returns null when fewer than two venues qualify, or when the best pair is
 * the same venue (an intra-venue spread is a cost, not an edge). The edge is
 * gross — before fees, withdrawal time and slippage past the top level — so
 * the pane presents it as a signal to look at, never as realised profit.
 */
export function findArbEdge(quotes: ReadonlyArray<VenuePrice>): ArbEdge | null {
  const book = quotes.filter(hasRealBook)
  if (book.length < 2) return null

  let cheapestAsk = book[0]
  let richestBid = book[0]
  for (const q of book) {
    if (q.ask < cheapestAsk.ask) cheapestAsk = q
    if (q.bid > richestBid.bid) richestBid = q
  }

  if (cheapestAsk.market === richestBid.market) return null

  return {
    buyMarket: cheapestAsk.market,
    buyAsk: cheapestAsk.ask,
    sellMarket: richestBid.market,
    sellBid: richestBid.bid,
    edgePct: ((richestBid.bid - cheapestAsk.ask) / cheapestAsk.ask) * 100,
  }
}
