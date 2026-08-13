// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { binanceCcxtVenue } from '../venues/binance'

describe('binance venue options', () => {
  // ccxt's binance is the only pro class that shards subscriptions across
  // numbered stream URLs, one per distinct subscription hash — and the
  // ticker/book/trades hashes embed the symbol. Left at the default
  // `streamLimits.spot: 50` that is four sockets for one pair and three fresh
  // TLS handshakes per pair switch. The venue pins everything onto one stream,
  // and raises the per-stream subscription guard to Binance's own 1024 cap so
  // a long session of switches cannot trip ccxt's 200 default.
  it('collapses every subscription hash onto a single spot stream', () => {
    const options = binanceCcxtVenue.options?.['options'] as Record<
      string,
      Record<string, number>
    >
    expect(options['streamLimits']).toEqual({ spot: 1, margin: 1 })
    expect(options['subscriptionLimitByStream']).toEqual({
      spot: 1024,
      margin: 1024,
    })
  })
})
