// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  availabilityKey,
  usePairAvailabilityStore,
} from '../pair-availability-store'

const report = (market: string, pair: string) =>
  usePairAvailabilityStore.getState().report(market, pair)
const clear = (market: string, pair: string) =>
  usePairAvailabilityStore.getState().clear(market, pair)
const isUnavailable = (market: string, pair: string) =>
  usePairAvailabilityStore.getState().unavailable[
    availabilityKey(market, pair)
  ] === true

beforeEach(() => {
  usePairAvailabilityStore.setState({ unavailable: {} })
})

describe('pair availability verdicts', () => {
  it('records a verdict per venue, not per pair', () => {
    report('bitvavo', 'BTC-USDT')

    expect(isUnavailable('bitvavo', 'BTC-USDT')).toBe(true)
    // The same pair on another venue is a different question.
    expect(isUnavailable('okx', 'BTC-USDT')).toBe(false)
    // And another pair on the same venue is untouched.
    expect(isUnavailable('bitvavo', 'BTC-EUR')).toBe(false)
  })

  it('normalizes the pair, so BTC/USDT and btc-usdt are one key', () => {
    report('bitvavo', 'btc/usdt')

    expect(isUnavailable('bitvavo', 'BTC-USDT')).toBe(true)
    expect(isUnavailable('bitvavo', 'BTC_USDT')).toBe(true)
  })

  it('forgets a verdict once data arrives for that key', () => {
    report('bitvavo', 'BTC-EUR')
    clear('bitvavo', 'BTC-EUR')

    expect(isUnavailable('bitvavo', 'BTC-EUR')).toBe(false)
  })

  it('keeps a stable state object on no-op writes', () => {
    report('bitvavo', 'BTC-USDT')
    const afterFirst = usePairAvailabilityStore.getState().unavailable

    // Repeating a verdict, or clearing a key that was never reported, must not
    // hand subscribed panes a new object to re-render on.
    report('bitvavo', 'BTC-USDT')
    expect(usePairAvailabilityStore.getState().unavailable).toBe(afterFirst)

    clear('okx', 'ETH-USDT')
    expect(usePairAvailabilityStore.getState().unavailable).toBe(afterFirst)
  })
})
