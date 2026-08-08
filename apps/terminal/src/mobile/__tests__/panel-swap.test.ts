// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  PANEL_FADE_OUT_MS,
  SHEET_EXIT_MS,
  planPanelSwap,
} from '../lib/panel-swap'

type Panel = 'watchlist' | 'trade' | 'copilot' | 'discover'

describe('planPanelSwap', () => {
  it('does nothing when the sheet already holds what was asked for', () => {
    expect(planPanelSwap<Panel>('trade', 'trade')).toEqual({ kind: 'none' })
    expect(planPanelSwap<Panel>(null, null)).toEqual({ kind: 'none' })
  })

  it('adopts immediately when the sheet is empty', () => {
    expect(planPanelSwap<Panel>(null, 'watchlist')).toEqual({
      kind: 'show',
      panel: 'watchlist',
    })
  })

  it('fades the outgoing panel out before adopting the next', () => {
    expect(planPanelSwap<Panel>('watchlist', 'trade')).toEqual({
      kind: 'fadeThenShow',
      panel: 'trade',
      delay: PANEL_FADE_OUT_MS,
    })
  })

  it('holds the last panel until the sheet has slid away', () => {
    expect(planPanelSwap<Panel>('copilot', null)).toEqual({
      kind: 'clearAfter',
      delay: SHEET_EXIT_MS,
    })
  })

  it('settles: replanning after a fade lands on "none"', () => {
    const first = planPanelSwap<Panel>('watchlist', 'trade')
    expect(first.kind).toBe('fadeThenShow')
    // The caller adopts `trade`; the next plan for the same request is a no-op,
    // which is what stops the swap from looping through its own timer.
    expect(planPanelSwap<Panel>('trade', 'trade')).toEqual({ kind: 'none' })
  })

  it('keeps the content on screen for at least the sheet exit', () => {
    // A shorter hold would empty the sheet while it is still visible, which is
    // the "page navigation" tell this whole module exists to remove.
    expect(SHEET_EXIT_MS).toBeGreaterThanOrEqual(400)
    expect(PANEL_FADE_OUT_MS).toBeLessThan(SHEET_EXIT_MS)
  })
})
