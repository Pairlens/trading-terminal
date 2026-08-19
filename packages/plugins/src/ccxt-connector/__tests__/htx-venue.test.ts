// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * HTX's ticker channel is a venue choice, not a ccxt default.
 *
 * ccxt subscribes `market.<id>.detail`, which carries open/high/low/close and
 * volume and NO top of book. Every consumer that ranks on bid and ask — the
 * Venue Ladder, the cross-venue arb edge — therefore read HTX as a venue with
 * no book at all, while the depth pane streamed its spread happily. HTX
 * publishes the same 100 ms aggregate WITH `bid`/`ask` on `market.<id>.ticker`,
 * and ccxt routes both channels through one `handleTicker`/`parseTicker` pair,
 * so this is strictly more data on the same single subscription.
 *
 * ccxt reads the option in `watchTicker` AND `unWatchTicker`. If a bump ever
 * moves or renames it, the failure is silent — a ticker that works and quietly
 * stops quoting — which is what this pins.
 */

import { describe, expect, it } from 'bun:test'
import { htxCcxtVenue } from '../venues/htx'

describe('htx ticker channel', () => {
  const ccxtOptions = (htxCcxtVenue.options?.['options'] ?? {}) as Record<
    string,
    unknown
  >

  it('subscribes the channel that carries top of book', () => {
    expect(ccxtOptions['watchTicker']).toEqual({
      name: 'market.{marketId}.ticker',
    })
  })

  it('keeps the object-form fetchMarkets override alongside it', () => {
    // Same options bag, and dropping it returns ZERO markets — see the venue
    // header. Asserted here so an edit to one cannot quietly delete the other.
    expect(ccxtOptions['fetchMarkets']).toEqual({
      types: { spot: true, linear: false, inverse: false },
    })
  })
})
