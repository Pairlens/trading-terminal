// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { shouldProbe } from '../use-latency-probe'

const BASE = {
  measured: false,
  supported: true,
  pairKey: 'BTC-USD',
  connected: true,
}

describe('shouldProbe', () => {
  it('holds the tape open for a venue with no measured round trip', () => {
    // Coinbase, HTX, Crypto.com: the estimate is the only number they get.
    expect(shouldProbe(BASE)).toBe(true)
  })

  it('releases as soon as a round trip is measured', () => {
    // The whole point of the transient probe: it calibrates the clock on a
    // measurable venue and then gets out of the way. A bug here turns it into
    // a permanent trade subscription on every venue, and the readout would
    // look exactly the same.
    expect(shouldProbe({ ...BASE, measured: true })).toBe(false)
  })

  it('stays out of the way of a venue with no trade feed', () => {
    // Alpaca and the DEX connectors — nothing to sample, so nothing to open.
    expect(shouldProbe({ ...BASE, supported: false })).toBe(false)
  })

  it('waits for a connection rather than subscribing into a dead provider', () => {
    expect(shouldProbe({ ...BASE, connected: false })).toBe(false)
  })

  it('waits for a pair', () => {
    expect(shouldProbe({ ...BASE, pairKey: '' })).toBe(false)
  })

  it('keeps measured venues released even when everything else is ready', () => {
    expect(
      shouldProbe({
        measured: true,
        supported: true,
        pairKey: 'BTC-USDT',
        connected: true,
      }),
    ).toBe(false)
  })
})
