// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Does this venue's ticker carry a book, and if not, is one still coming?
 *
 * A ticker channel is supposed to report top of book, and most do. Four of the
 * bundled venues do not: ByBit and Upbit send 24h statistics with no quote at
 * all, MEXC's `miniTicker` is statistics by construction (its book rides a
 * second channel the bridge does not subscribe), and HTX only started carrying
 * one when its venue spec moved off ccxt's default `market.<id>.detail`. Every
 * consumer that ranks on bid and ask therefore saw those venues as bookless,
 * while the depth pane one column over streamed their spread happily.
 *
 * `useVenueQuotes` closes that by opening the venue's own order book and taking
 * level 0 — but only for a venue that has PROVEN it will not quote, which is
 * what this decides. The proof is a stream that keeps TICKING while it stops
 * QUOTING, and it has to be measured that way in both directions:
 *
 *  - not "has it ever quoted", because a REST seed can quote once and the
 *    socket never again. Binance did exactly that until its venue spec moved
 *    the batched ticker off `miniTicker`, and a latch on the first frame would
 *    have read that one seeded quote as proof for the rest of the session;
 *  - not "did the last frame quote", because a thin pair can go a minute
 *    between ticks and every one of them quotes fine. Comparing the last tick
 *    against the last quote leaves a slow venue alone and catches only the
 *    stream that has genuinely gone quiet on top of book.
 *
 * The wait is bounded on the other end too. A venue that never quotes and whose
 * book never paints has an ANSWER — it quotes no book here — and a pane that
 * keeps pulsing a skeleton at it is promising a number that is not coming.
 */

/** A venue may tick this long without quoting before its book is opened. */
export const BOOKLESS_AFTER_MS = 4_000
/**
 * How long past the first tick the fallback is still considered in flight.
 * Past this the venue has an answer, whichever way it went.
 */
export const BOOK_RESOLVE_MS = 20_000

export type TopOfBookState =
  /** The ticker quotes a book; nothing else to open. */
  | 'quoted'
  /** Too early to say — no tick yet, or one that a REST seed explains. */
  | 'unknown'
  /** No quote on the ticker; the fallback book is open and still awaited. */
  | 'chasing'
  /** No quote on the ticker, and the wait is over. */
  | 'absent'

export function topOfBookState(input: {
  /** Epoch ms of this venue's first tick, null before one arrives. */
  firstTickAt: number | null
  /** Epoch ms of its most recent tick, null before one arrives. */
  lastTickAt: number | null
  /** Epoch ms of the most recent tick that carried a bid or an ask. */
  lastQuotedAt: number | null
  now: number
}): TopOfBookState {
  const { firstTickAt, lastTickAt, lastQuotedAt, now } = input
  if (firstTickAt === null || lastTickAt === null) return 'unknown'
  // Still quoting: no meaningful run of ticks has gone by without one.
  if (lastQuotedAt !== null && lastTickAt - lastQuotedAt <= BOOKLESS_AFTER_MS) {
    return 'quoted'
  }
  // Time the chase from the last quote when there was one — a venue that
  // quoted its seed and then stopped is bookless from the seed, not from
  // whenever the pane happened to notice.
  const since = lastQuotedAt ?? firstTickAt
  const age = now - since
  if (age <= BOOKLESS_AFTER_MS) return 'unknown'
  return age < BOOK_RESOLVE_MS ? 'chasing' : 'absent'
}

/**
 * Whether the fallback book should be held open.
 *
 * `absent` keeps it: the state only means the WAIT is over, and dropping the
 * subscription there would throw away the quotes of every venue the fallback
 * successfully answered for.
 */
export function wantsFallbackBook(state: TopOfBookState): boolean {
  return state === 'chasing' || state === 'absent'
}
