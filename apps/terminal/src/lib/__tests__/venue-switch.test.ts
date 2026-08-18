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
})
