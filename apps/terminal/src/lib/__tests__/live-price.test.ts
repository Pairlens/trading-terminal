// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The live price, and the one frame it has to refuse.
 *
 * The failure this pins: on 2026-08-19 a Polymarket race showed JD Vance at
 * 55.9¢, then 33.4¢, then 2.0¢ on the event header, the tab strip and the
 * right edge of the probability chart, while the order book beside them held
 * 21.6 / 21.7 the whole time. Each of those was a single resting level in his
 * own book, read as a mid before the other side of the book had streamed in.
 */
import { describe, expect, it } from 'bun:test'

import { liveQuotePrice } from '../live-price'

describe('liveQuotePrice', () => {
  it('trusts the venue price when the book has both sides', () => {
    expect(
      liveQuotePrice({
        lastTradePrice: 0.216,
        bestBid: 0.205,
        bestAsk: 0.227,
        midPrice: 0.216,
      }),
    ).toBe(0.216)
  })

  it('refuses a price that is exactly the only side the book has', () => {
    // The observed frame: one 1-cent bid, no asks, and ccxt reporting that
    // bid as the outcome's price.
    expect(
      liveQuotePrice({
        lastTradePrice: 0.01,
        bestBid: 0.01,
        bestAsk: null,
        midPrice: null,
      }),
    ).toBeNull()
  })

  it('refuses it on the ask side too', () => {
    expect(
      liveQuotePrice({ lastTradePrice: 0.94, bestBid: null, bestAsk: 0.94 }),
    ).toBeNull()
  })

  it('keeps a real last trade that disagrees with a one-sided book', () => {
    // Kalshi's `last` is a print, not a derived mid, so it is allowed to sit
    // away from the book — including when only one side is quoted.
    expect(
      liveQuotePrice({ lastTradePrice: 0.62, bestBid: 0.58, bestAsk: null }),
    ).toBe(0.62)
  })

  it('keeps a last trade that sits outside a two-sided spread', () => {
    // The market moved since the print. Normal, and not this rule's business.
    expect(
      liveQuotePrice({
        lastTradePrice: 0.4,
        bestBid: 0.51,
        bestAsk: 0.53,
        midPrice: 0.52,
      }),
    ).toBe(0.4)
  })

  it('falls back to the mid when the venue publishes no price', () => {
    expect(
      liveQuotePrice({ bestBid: 0.2, bestAsk: 0.24, midPrice: 0.22 }),
    ).toBe(0.22)
  })

  it('answers null for an empty or absent quote rather than throwing', () => {
    expect(liveQuotePrice(null)).toBeNull()
    expect(liveQuotePrice({})).toBeNull()
    expect(liveQuotePrice({ lastTradePrice: Number.NaN })).toBeNull()
  })
})
