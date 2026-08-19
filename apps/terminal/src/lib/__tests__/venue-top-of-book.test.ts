// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The reproduced defect: ByBit charted, its bid and ask on the header off the
 * depth stream, and the Venue Ladder's ByBit row pulsing an empty skeleton for
 * as long as the pane stayed open. ByBit's ticker channel carries 24h
 * statistics and no quote, so the ladder — which read top of book from the
 * ticker alone — had nothing to draw and no way to stop waiting for it.
 */
import { describe, expect, test } from 'bun:test'

import {
  BOOKLESS_AFTER_MS,
  BOOK_RESOLVE_MS,
  topOfBookState,
  wantsFallbackBook,
} from '@/lib/venue-top-of-book'

const NOW = 1_700_000_000_000
const ago = (ms: number) => NOW - ms

/** A venue that never quotes, first seen `age` ms ago and ticking since. */
const neverQuoted = (age: number) =>
  topOfBookState({
    firstTickAt: ago(age),
    lastTickAt: NOW,
    lastQuotedAt: null,
    now: NOW,
  })

describe('topOfBookState', () => {
  test('a venue that keeps quoting is never chased', () => {
    expect(
      topOfBookState({
        firstTickAt: ago(BOOK_RESOLVE_MS * 10),
        lastTickAt: NOW,
        lastQuotedAt: NOW,
        now: NOW,
      }),
    ).toBe('quoted')
    expect(wantsFallbackBook('quoted')).toBe(false)
  })

  test('a slow venue that quotes whenever it ticks is left alone', () => {
    // A thin pair can go a minute between prints. What matters is that no run
    // of ticks went by WITHOUT a quote, not how long ago the last one was.
    expect(
      topOfBookState({
        firstTickAt: ago(600_000),
        lastTickAt: ago(90_000),
        lastQuotedAt: ago(90_000),
        now: NOW,
      }),
    ).toBe('quoted')
  })

  test('says nothing before the first tick', () => {
    expect(
      topOfBookState({
        firstTickAt: null,
        lastTickAt: null,
        lastQuotedAt: null,
        now: NOW,
      }),
    ).toBe('unknown')
    expect(wantsFallbackBook('unknown')).toBe(false)
  })

  test('a REST-seeded first frame does not open a book', () => {
    // MEXC seeds `avgPrice` and Binance a snapshot: a price with no quote,
    // followed within a second or two by a socket frame that has both. Acting
    // on the seed alone would open a book on a venue that was about to quote.
    expect(neverQuoted(0)).toBe('unknown')
    expect(neverQuoted(BOOKLESS_AFTER_MS)).toBe('unknown')
  })

  test('one quoting seed is not proof, when the socket then goes quiet', () => {
    // Binance's batched ticker did exactly this: the REST seed quoted, every
    // `miniTicker` frame after it came back 0. A latch on "has ever quoted"
    // reads that as a venue with a book and never chases one.
    expect(
      topOfBookState({
        firstTickAt: ago(30_000),
        lastTickAt: NOW,
        lastQuotedAt: ago(30_000),
        now: NOW,
      }),
    ).toBe('absent')
    expect(
      topOfBookState({
        firstTickAt: ago(10_000),
        lastTickAt: NOW,
        lastQuotedAt: ago(10_000),
        now: NOW,
      }),
    ).toBe('chasing')
  })

  test('past the settle window the fallback book opens', () => {
    expect(neverQuoted(BOOKLESS_AFTER_MS + 1)).toBe('chasing')
    expect(wantsFallbackBook('chasing')).toBe(true)
  })

  test('the wait ends, so the row can say so instead of pulsing forever', () => {
    expect(neverQuoted(BOOK_RESOLVE_MS - 1)).toBe('chasing')
    expect(neverQuoted(BOOK_RESOLVE_MS)).toBe('absent')
    expect(neverQuoted(BOOK_RESOLVE_MS * 3)).toBe('absent')
  })

  test('a settled wait keeps the book open', () => {
    // `absent` means the WAIT is over, not that the stream is unwanted:
    // dropping it would blank every venue the fallback did answer for.
    expect(wantsFallbackBook('absent')).toBe(true)
  })

  test('the settle window opens before the wait closes', () => {
    // Otherwise there is no window in which a book is ever opened at all.
    expect(BOOKLESS_AFTER_MS).toBeLessThan(BOOK_RESOLVE_MS)
  })
})
