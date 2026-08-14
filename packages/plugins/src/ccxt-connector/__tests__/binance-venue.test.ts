// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { binanceCcxtVenue } from '../venues/binance'

describe('binance venue options', () => {
  // Binance enforces ~5 inbound messages per second PER CONNECTION, and ccxt
  // sends one SUBSCRIBE frame per watch call. A low `streamLimits` cap (this
  // venue briefly shipped `spot: 1`) concentrates a pair switch's
  // unsubscribe+subscribe burst onto one socket, which Binance closes with
  // code 1008 — killing every live channel at once and stalling real-time
  // data for tens of seconds (measured 2026-08-14). ccxt's default sharding
  // gives each hash its own connection carrying exactly one SUBSCRIBE, so the
  // burst limit is unreachable. This test pins the ABSENCE of the override.
  it('leaves stream sharding at the ccxt default — a low cap trips the 1008 message limit', () => {
    const options = binanceCcxtVenue.options?.['options'] as
      | Record<string, unknown>
      | undefined
    expect(options?.['streamLimits']).toBeUndefined()
    expect(options?.['subscriptionLimitByStream']).toBeUndefined()
  })

  it('keeps ccxt keepalive off — no app-level ping exists to send', () => {
    const streaming = binanceCcxtVenue.options?.['streaming'] as Record<
      string,
      number
    >
    expect(streaming['keepAlive']).toBe(0)
  })

  // The safe replacement for the reverted cap above: tickers batch through
  // ONE watchTickers call — a single socket whose single SUBSCRIBE frame
  // cannot trip the per-connection message limit — while candles, book and
  // trades keep ccxt's burst-proof default sharding.
  it('batches tickers through watchTickers', () => {
    expect(binanceCcxtVenue.batchTickers).toBe(true)
  })

  // ccxt ships 50 ms per weight unit — a 1200/min budget against Binance's
  // real 6000/min. The conservative default queues the reload's REST burst
  // (bulk tickers weight 40 + depth-500 snapshot weight 25) into seconds of
  // self-inflicted delay before the order book can seed.
  it('paces REST at the venue’s real weight budget (10 ms/unit)', () => {
    expect(binanceCcxtVenue.options?.['rateLimit']).toBe(10)
  })

  // rateLimit 10 under a ROLLING WINDOW is Binance's actual limit semantics
  // (6000 weight per rolling minute, bursts free) — the leaky bucket would
  // still serialize a reload's burst one call at a time.
  it('uses the rolling-window rate limiter, matching the venue’s own semantics', () => {
    expect(binanceCcxtVenue.options?.['rateLimiterAlgorithm']).toBe(
      'rollingWindow',
    )
  })

  // The book is diff-stream + REST snapshot here — the slowest first paint
  // of the fleet without the parallel REST seed.
  it('seeds the order book’s first paint over REST', () => {
    expect(binanceCcxtVenue.seedOrderBook).toBe(true)
  })

  // The trade stream sends only new prints — an empty tape until the market
  // moves. Safe to seed: Binance candles come from watchOHLCV, never folded
  // from the tape.
  it('seeds the tape over REST', () => {
    expect(binanceCcxtVenue.seedTrades).toBe(true)
  })
})
