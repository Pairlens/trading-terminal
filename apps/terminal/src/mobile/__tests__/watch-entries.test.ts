// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Watchlist rows are stored as qualified refs, and the mobile panel used to
 * render them raw.
 *
 * The symptom was visible on a first run with nobody's help: the starter list
 * seeds `spot:BTC-USDT`, the avatar lettered the first three characters of it
 * and the title printed the rest, so every row read `spospot:BTC-USDT`. The
 * quieter half was the prediction directory, which is keyed by pair key and
 * therefore matched nothing for `prediction:polymarket:KX…` — a watched
 * outcome kept the mono routing key and lost its question.
 */
import { describe, expect, it } from 'bun:test'

import { watchEntriesFrom } from '../lib/watch-entries'

describe('watchEntriesFrom', () => {
  it('unwraps a class-qualified spot entry', () => {
    expect(watchEntriesFrom(['spot:BTC-USDT'])).toEqual([
      {
        key: 'spot:BTC-USDT',
        ref: { cls: 'spot', id: 'BTC-USDT' },
        symbol: 'BTC-USDT',
      },
    ])
  })

  it('unwraps a venue-bound prediction entry and keeps its venue', () => {
    // The venue is the half that cannot be recovered from the symbol: a
    // Polymarket key charted "on kalshi" is not the same contract, it is
    // nothing.
    const [entry] = watchEntriesFrom(['prediction:polymarket:SOME-EVENT-YES'])
    expect(entry?.symbol).toBe('SOME-EVENT-YES')
    expect(entry?.ref).toEqual({
      cls: 'prediction',
      market: 'polymarket',
      id: 'SOME-EVENT-YES',
    })
  })

  it('keeps a stocks ticker as a bare symbol', () => {
    const [entry] = watchEntriesFrom(['stocks:AAPL'])
    expect(entry?.symbol).toBe('AAPL')
    expect(entry?.ref?.cls).toBe('stocks')
  })

  it('keeps a legacy bare symbol rather than dropping the row', () => {
    expect(watchEntriesFrom(['BTC-USDT'])).toEqual([
      { key: 'BTC-USDT', ref: null, symbol: 'BTC-USDT' },
    ])
  })

  it('preserves stored order and gives every row a unique key', () => {
    const entries = watchEntriesFrom([
      'spot:ETH-USDT',
      'spot:BTC-USDT',
      'stocks:AAPL',
    ])
    expect(entries.map((e) => e.symbol)).toEqual([
      'ETH-USDT',
      'BTC-USDT',
      'AAPL',
    ])
    expect(new Set(entries.map((e) => e.key)).size).toBe(3)
  })
})
