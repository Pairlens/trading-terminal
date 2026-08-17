// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { OVERLAY_OWNING_TAB, litTab } from '../lib/overlay-tabs'
import type { MobileOverlay } from '../mobile-focus-context'

describe('litTab', () => {
  it('lights the active tab when nothing covers the app', () => {
    expect(litTab('trade', [])).toBe('trade')
    expect(litTab('chart', [])).toBe('chart')
  })

  it('lights nothing while a screen that is not a tab is open', () => {
    const overlays: Array<MobileOverlay> = [{ kind: 'settings' }]
    expect(litTab('watchlist', overlays)).toBeNull()
  })

  it('keeps Trade lit for the order book', () => {
    const overlays: Array<MobileOverlay> = [{ kind: 'orderbook' }]
    expect(litTab('trade', overlays)).toBe('trade')
    // Even reached from somewhere else, the book is a trading screen.
    expect(litTab('chart', overlays)).toBe('trade')
  })

  it('keeps Discover lit across the whole prediction drill-down', () => {
    // Board → event → ladder is one browse, and the tab bar answering "you are
    // nowhere" three screens deep is the lie this table exists to prevent.
    const event = { id: 'evt', market: 'polymarket', title: 'X', markets: [] }
    const stack: Array<MobileOverlay> = [
      { kind: 'events' },
      { kind: 'predictionEvent', venue: 'polymarket', venueLabel: 'P', event },
      { kind: 'predictionLadder', venue: 'polymarket', venueLabel: 'P', event },
    ]
    expect(litTab('chart', stack.slice(0, 1))).toBe('discover')
    expect(litTab('chart', stack.slice(0, 2))).toBe('discover')
    expect(litTab('chart', stack)).toBe('discover')
  })

  it('follows the TOP of the stack', () => {
    const overlays: Array<MobileOverlay> = [
      { kind: 'orderbook' },
      { kind: 'connect', market: 'okx' },
    ]
    expect(litTab('trade', overlays)).toBeNull()
  })

  it('has an answer for every overlay kind', () => {
    // A new overlay that forgets to declare its tab is a tab bar pointing at
    // `undefined`, which renders as "no tab lit" and hides the mistake.
    for (const value of Object.values(OVERLAY_OWNING_TAB)) {
      expect(value === null || typeof value === 'string').toBe(true)
    }
    // The `Record<MobileOverlayKind, …>` type is the real guard; this count
    // only catches a kind deleted from the union and left in the table.
    expect(Object.keys(OVERLAY_OWNING_TAB).length).toBe(13)
  })
})
