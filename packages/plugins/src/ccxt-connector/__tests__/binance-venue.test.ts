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
})
