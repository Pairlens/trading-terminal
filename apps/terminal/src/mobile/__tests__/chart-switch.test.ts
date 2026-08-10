// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  advanceChartSwitch,
  initialChartSwitchState,
} from '../lib/chart-switch'

describe('advanceChartSwitch', () => {
  it('starts at rest on the venue it mounted with', () => {
    expect(initialChartSwitchState('kraken')).toEqual({
      market: 'kraken',
      venueChanged: false,
    })
  })

  it('does not name a venue for a pair switch inside one venue', () => {
    // The buffer clears on a pair switch too, so `hasSnapshot` goes false
    // without the venue moving — the badge must stay on the generic wording.
    const state = advanceChartSwitch(
      initialChartSwitchState('kraken'),
      'kraken',
      false,
    )
    expect(state.venueChanged).toBe(false)
  })

  it('names the venue once the venue is what changed', () => {
    const state = advanceChartSwitch(
      initialChartSwitchState('kraken'),
      'okx',
      false,
    )
    expect(state).toEqual({ market: 'okx', venueChanged: true })
  })

  it('keeps naming the venue for every render of that same episode', () => {
    let state = advanceChartSwitch(
      initialChartSwitchState('kraken'),
      'okx',
      false,
    )
    state = advanceChartSwitch(state, 'okx', false)
    state = advanceChartSwitch(state, 'okx', false)
    expect(state.venueChanged).toBe(true)
  })

  it('is idempotent — safe to fold during render', () => {
    const first = advanceChartSwitch(
      initialChartSwitchState('kraken'),
      'okx',
      false,
    )
    expect(advanceChartSwitch(first, 'okx', false)).toBe(first)
  })

  it('ends the episode when the new venue answers', () => {
    const switching = advanceChartSwitch(
      initialChartSwitchState('kraken'),
      'okx',
      false,
    )
    const live = advanceChartSwitch(switching, 'okx', true)
    expect(live).toEqual({ market: 'okx', venueChanged: false })
  })

  it('does not let a finished venue switch colour the next pair switch', () => {
    let state = advanceChartSwitch(
      initialChartSwitchState('kraken'),
      'okx',
      false,
    )
    state = advanceChartSwitch(state, 'okx', true)
    // Same venue, snapshot cleared again: a pair switch, and it must read as
    // one rather than inheriting "Switching to OKX…" from the switch before.
    state = advanceChartSwitch(state, 'okx', false)
    expect(state.venueChanged).toBe(false)
  })
})
