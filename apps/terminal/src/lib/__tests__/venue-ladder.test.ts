// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import type { VenueQuote, VenueQuoteStatus } from '@/hooks/use-venue-quotes'
import { buildVenueLadder, spreadBps } from '@/lib/venue-ladder'

function quote(
  market: string,
  bid: number | null,
  ask: number | null,
  status: VenueQuoteStatus = 'live',
): VenueQuote {
  return {
    market,
    status,
    last: bid !== null && ask !== null ? (bid + ask) / 2 : null,
    bid,
    ask,
    change24h: null,
    volume24h: null,
    ts: 1,
    fromSnapshot: false,
    bookPending: false,
  }
}

describe('spreadBps', () => {
  test('measures the book against its own mid', () => {
    // 318.41 / 318.47 is 6 cents on a 318.44 mid — 1.88 bps.
    expect(spreadBps(318.41, 318.47)).toBeCloseTo(1.884, 2)
  })

  test('buying and selling the same book report the same width', () => {
    expect(spreadBps(100, 101)).toBeCloseTo((1 / 100.5) * 10_000, 10)
  })

  test('refuses a crossed, locked-negative or half-empty book', () => {
    expect(spreadBps(101, 100)).toBeNull()
    expect(spreadBps(null, 100)).toBeNull()
    expect(spreadBps(100, null)).toBeNull()
    expect(spreadBps(0, 100)).toBeNull()
  })
})

describe('buildVenueLadder', () => {
  test('carries the top-of-book chase through to the row', () => {
    // The row draws a skeleton only while this is true, which is what stopped
    // ByBit pulsing forever on a ticker channel that quotes no book.
    const [chasing, settled] = buildVenueLadder(
      [
        { ...quote('bybit', null, null), bookPending: true },
        { ...quote('upbit', null, null), bookPending: false },
      ],
      'buy',
    )
    expect(chasing?.bookPending).toBe(true)
    expect(settled?.bookPending).toBe(false)
  })

  test('a venue quoted off its order book ranks like any other', () => {
    // ByBit's bid/ask reach the quote from the depth stream rather than the
    // ticker; nothing downstream may treat that as a lesser quote.
    const rows = buildVenueLadder(
      [quote('okx', 100.0, 100.4), quote('bybit', 100.05, 100.1)],
      'buy',
    )
    expect(rows[0]?.market).toBe('bybit')
    expect(rows[0]?.isBest).toBe(true)
    expect(rows[0]?.ranked).toBe(true)
    expect(rows[0]?.spreadBps).not.toBeNull()
  })

  test('the cheapest ask leads the buy side and carries the badge', () => {
    const rows = buildVenueLadder(
      [
        quote('kraken', 318.18, 318.71),
        quote('binance', 318.41, 318.47),
        quote('okx', 318.36, 318.52),
      ],
      'buy',
    )
    expect(rows.map((r) => r.market)).toEqual(['binance', 'okx', 'kraken'])
    expect(rows[0]!.isBest).toBe(true)
    expect(rows.filter((r) => r.isBest)).toHaveLength(1)
  })

  test('the sell side reverses both the order and the badge', () => {
    const rows = buildVenueLadder(
      [
        quote('binance', 318.41, 318.47),
        // Pays more to a seller, charges more to a buyer.
        quote('thin', 318.6, 319.4),
      ],
      'sell',
    )
    expect(rows[0]!.market).toBe('thin')
    expect(rows[0]!.isBest).toBe(true)
  })

  test('a stale quote renders but never ranks', () => {
    const rows = buildVenueLadder(
      [
        quote('stale', 300, 300.1, 'stale'),
        quote('binance', 318.41, 318.47),
        quote('okx', 318.36, 318.52),
      ],
      'buy',
    )
    expect(rows.map((r) => r.market)).toEqual(['binance', 'okx', 'stale'])
    expect(rows.find((r) => r.market === 'stale')!.ranked).toBe(false)
    expect(rows.find((r) => r.market === 'stale')!.isBest).toBe(false)
  })

  test('a fabricated book is not a book', () => {
    // The AMM data providers publish last × 0.999 / last × 1.001.
    const synthetic: VenueQuote = {
      ...quote('gecko', 99.9, 100.1),
      last: 100,
    }
    const rows = buildVenueLadder(
      [synthetic, quote('binance', 100.02, 100.03)],
      'buy',
    )
    expect(rows.find((r) => r.market === 'gecko')!.ranked).toBe(false)
    expect(rows.find((r) => r.market === 'gecko')!.spreadBps).toBeNull()
    expect(rows[0]!.market).toBe('binance')
    // One real book left: nothing to be best against.
    expect(rows[0]!.isBest).toBe(false)
  })

  test('best of one is not a comparison', () => {
    const rows = buildVenueLadder([quote('binance', 100, 100.1)], 'buy')
    expect(rows[0]!.ranked).toBe(true)
    expect(rows[0]!.isBest).toBe(false)
  })

  test('settled answers sink below the venues still connecting', () => {
    const rows = buildVenueLadder(
      [
        quote('coinbase', null, null, 'unlisted'),
        quote('kalshi', null, null, 'desktop-only'),
        quote('mexc', null, null, 'pending'),
        quote('bitfinex', null, null, 'no-data'),
        quote('binance', 100, 100.1),
        quote('okx', 100.01, 100.12),
      ],
      'buy',
    )
    expect(rows.map((r) => r.market)).toEqual([
      'binance',
      'okx',
      'mexc',
      'bitfinex',
      'coinbase',
      'kalshi',
    ])
  })

  test('equal asks fall back to venue id, so a re-rank does not shuffle', () => {
    const rows = buildVenueLadder(
      [quote('zeta', 99.9, 100.1), quote('alpha', 99.9, 100.1)],
      'buy',
    )
    expect(rows.map((r) => r.market)).toEqual(['alpha', 'zeta'])
  })
})
