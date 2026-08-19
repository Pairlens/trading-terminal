// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one number a surface shows for "what is this worth right now", and the
 * one case where the streams cannot answer.
 *
 * Four surfaces derive it the same way — the probability chart's live point,
 * the event header's reading, the phone's hero price, and the ticket's default
 * limit — so it is derived once, here.
 *
 * The case that made this a function rather than a `??` chain: a venue whose
 * ticker price IS the mid of its own book, streaming a book that is BUILT
 * incrementally. Polymarket's CLOB socket delivers the book as a run of
 * `price_changes` rather than as one snapshot, so for the first frames after
 * every subscribe and every reconnect the book is half there. ccxt's
 * `watchTicker` computes mid = (bestBid + bestAsk) / 2 and, when only one side
 * exists, falls back to that side — so the ticker publishes a lone resting
 * 1-cent bid as the price of a contract whose real book is 0.203 / 0.231.
 *
 * That number reached everything downstream: the header's live probability,
 * the ticket's prefilled limit, the phone's headline, and the probability
 * chart, which wrote it into the newest bucket and bent the right edge of the
 * runner's band. The order book pane sat beside all of them showing the
 * correct quote the whole time, because a half-built book is obvious when you
 * draw both sides of it and invisible once it has been reduced to one number.
 *
 * So: **a price that is exactly the only side its book has is that side, not a
 * price.** Refuse it and let the caller fall back to what it had — every one
 * of the four already has a fallback, because a stream can always be late.
 *
 * Deliberately narrow. A last trade that merely sits outside the current
 * spread is NOT refused: a market that moved since the last print is the
 * normal state of a market, and Kalshi's `last` is a real trade rather than a
 * derived mid, so it has every right to disagree with the book. Only the exact
 * equality is a tell, and only when the other side is missing.
 */

/** What the ticker and book streams can offer, all of it optional. */
export type LiveQuote = {
  /** The venue's own price. A last trade on some venues, a book mid on others. */
  lastTradePrice?: number | null
  bestBid?: number | null
  bestAsk?: number | null
  /** (bid + ask) / 2, null unless the book has both sides. */
  midPrice?: number | null
}

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * The live price, or null when the streams cannot honestly give one.
 *
 * Null is a real answer here and callers must treat it as one: it means "hold
 * what you have", not "this instrument has no price".
 */
export function liveQuotePrice(
  quote: LiveQuote | null | undefined,
): number | null {
  const last = finite(quote?.lastTradePrice)
  const bid = finite(quote?.bestBid)
  const ask = finite(quote?.bestAsk)
  const mid = finite(quote?.midPrice)

  // A two-sided book vouches for whatever the venue reported.
  if (bid !== null && ask !== null) return last ?? mid

  // One side, and the price is that side: a mid read off half a book.
  const onlySide = bid ?? ask
  if (onlySide !== null && last !== null && last === onlySide) return null

  return last ?? mid
}
