// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { planVenueSwitch } from '@/lib/venue-switch'

const CHART = '/spot/okx/BTC-USDT'

describe('planVenueSwitch', () => {
  test('on the chart route the venue is a navigation, not a preference alone', () => {
    const plan = planVenueSwitch({
      market: 'kraken',
      pairSource: 'global',
      panePair: { pairKey: 'BTC-USDT', market: 'okx' },
      pathname: CHART,
    })

    expect(plan.scope).toBe('chart')
    expect(plan.navigateTo).toEqual({
      cls: 'spot',
      market: 'kraken',
      id: 'BTC-USDT',
    })
    expect(plan.writePreference).toBe(true)
    expect(plan.setPair).toBeNull()
  })

  test('the class and the instrument survive the switch', () => {
    const plan = planVenueSwitch({
      market: 'bybit',
      pairSource: null,
      panePair: null,
      pathname: '/perp/binance/BTC-USDT-USDT',
    })

    expect(plan.navigateTo).toEqual({
      cls: 'perp',
      market: 'bybit',
      id: 'BTC-USDT-USDT',
    })
  })

  test('clicking the venue already charted navigates nowhere', () => {
    const plan = planVenueSwitch({
      market: 'okx',
      pairSource: 'global',
      panePair: { pairKey: 'BTC-USDT', market: 'okx' },
      pathname: CHART,
    })

    expect(plan.scope).toBe('chart')
    expect(plan.navigateTo).toBeNull()
    expect(plan.writePreference).toBe(true)
  })

  test('off the chart route there is nothing to move but the preference', () => {
    const plan = planVenueSwitch({
      market: 'kraken',
      pairSource: null,
      panePair: null,
      pathname: '/accounts',
    })

    expect(plan.scope).toBe('preference')
    expect(plan.navigateTo).toBeNull()
    expect(plan.writePreference).toBe(true)
  })

  test('a pane holding its own pair moves that pane, not the page', () => {
    const plan = planVenueSwitch({
      market: 'kraken',
      pairSource: 'override',
      panePair: { pairKey: 'BTC-USDT', market: 'okx' },
      pathname: CHART,
    })

    expect(plan.scope).toBe('override')
    expect(plan.setPair).toEqual({ pairKey: 'BTC-USDT', market: 'kraken' })
    expect(plan.navigateTo).toBeNull()
    // The pane's own venue is not the user's venue preference.
    expect(plan.writePreference).toBe(false)
  })

  test('a bound pane writes the variable, so every pane on it follows', () => {
    const plan = planVenueSwitch({
      market: 'kraken',
      pairSource: 'variable',
      panePair: { pairKey: 'BTC-USDT', market: 'okx' },
      pathname: '/workspace/desk',
    })

    expect(plan.scope).toBe('variable')
    expect(plan.setPair).toEqual({ pairKey: 'BTC-USDT', market: 'kraken' })
    expect(plan.writePreference).toBe(false)
  })

  test('a pane already on the clicked venue stays put and moves nothing else', () => {
    const plan = planVenueSwitch({
      market: 'okx',
      pairSource: 'override',
      panePair: { pairKey: 'BTC-USDT', market: 'okx' },
      pathname: CHART,
    })

    expect(plan.scope).toBe('override')
    expect(plan.setPair).toBeNull()
    expect(plan.navigateTo).toBeNull()
    expect(plan.writePreference).toBe(false)
  })

  // ── Crossing asset classes ────────────────────────────────────────
  //
  // The omni search lists every connected venue under one heading, so a perp
  // venue is one keystroke away from a spot chart. Before these, the venue
  // swapped into the address and the class did not.

  test('a perp venue takes the spot pair with it, settle leg and all', () => {
    const plan = planVenueSwitch({
      market: 'binance-futures',
      venueClasses: ['crypto-perp'],
      pairSource: null,
      panePair: null,
      pathname: '/spot/binance/BTC-USDT',
    })

    expect(plan.scope).toBe('cross-class')
    expect(plan.navigateTo).toEqual({
      cls: 'perp',
      market: 'binance-futures',
      id: 'BTC-USDT-USDT',
    })
    expect(plan.writePreference).toBe(true)
    expect(plan.stranded).toBeNull()
  })

  test('and a spot venue takes the contract back the other way', () => {
    const plan = planVenueSwitch({
      market: 'binance',
      venueClasses: ['crypto-spot'],
      pairSource: null,
      panePair: null,
      pathname: '/perp/binance-futures/BTC-USDT-USDT',
    })

    expect(plan.scope).toBe('cross-class')
    expect(plan.navigateTo).toEqual({
      cls: 'spot',
      market: 'binance',
      id: 'BTC-USDT',
    })
  })

  test('a stock venue cannot take a crypto pair, and says so instead', () => {
    // The arm that matters: Alpaca's own 'BTC' is a spot-bitcoin ETF, so
    // navigating there would price a ~$28 equity under a crypto pair's label.
    const plan = planVenueSwitch({
      market: 'alpaca',
      venueClasses: ['stocks'],
      pairSource: null,
      panePair: null,
      pathname: CHART,
    })

    expect(plan.scope).toBe('unavailable')
    expect(plan.navigateTo).toBeNull()
    expect(plan.stranded).toEqual({
      cls: 'spot',
      market: 'okx',
      id: 'BTC-USDT',
    })
    // The user still named a venue; the classes it does trade open there next.
    expect(plan.writePreference).toBe(true)
  })

  test('a venue-bound instrument has no other venue to be on', () => {
    // The same mint on another venue is another asset, or nothing at all.
    const plan = planVenueSwitch({
      market: 'okx',
      venueClasses: ['crypto-spot'],
      pairSource: null,
      panePair: null,
      pathname: '/dex/solana/So11111111111111111111111111111111111111112-USDC',
    })

    expect(plan.scope).toBe('unavailable')
    expect(plan.navigateTo).toBeNull()
  })

  test('the venue already charted is never a refusal, whatever it trades', () => {
    const plan = planVenueSwitch({
      market: 'solana',
      venueClasses: ['dex'],
      pairSource: null,
      panePair: null,
      pathname: '/dex/solana/So11111111111111111111111111111111111111112-USDC',
    })

    expect(plan.scope).toBe('chart')
    expect(plan.navigateTo).toBeNull()
  })

  test('a venue serving the class charted is believed, extra classes and all', () => {
    const plan = planVenueSwitch({
      market: 'kraken',
      venueClasses: ['crypto-spot', 'crypto-perp'],
      pairSource: null,
      panePair: null,
      pathname: CHART,
    })

    expect(plan.scope).toBe('chart')
    expect(plan.navigateTo).toEqual({
      cls: 'spot',
      market: 'kraken',
      id: 'BTC-USDT',
    })
  })

  test('a caller that cannot name the venue class keeps the plain switch', () => {
    // The pane pickers narrow their own lists to the class on screen, so a
    // switch arriving from one of them is same-class by construction.
    const plan = planVenueSwitch({
      market: 'alpaca',
      pairSource: null,
      panePair: null,
      pathname: CHART,
    })

    expect(plan.scope).toBe('chart')
    expect(plan.navigateTo).toEqual({
      cls: 'spot',
      market: 'alpaca',
      id: 'BTC-USDT',
    })
  })
})
