// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  ASSISTANT_BAR,
  ASSISTANT_PLACEMENT_VALUES,
  ASSISTANT_WINDOW_ANCHOR,
  DEFAULT_ASSISTANT_PLACEMENT,
  normalizeAssistantPlacement,
} from '../placement'

describe('assistant placement', () => {
  test('defaults to the rail, the one placement that covers nothing', () => {
    // Not a taste call: floating parks a pill over the bottom-right of
    // whatever pane is there, and the default should never do that to
    // someone who has not asked for it.
    expect(DEFAULT_ASSISTANT_PLACEMENT).toBe('sidebar')
  })

  test('a stored value this build cannot render falls back', () => {
    // A downgrade, or a hand-edited localStorage entry. Either way the
    // orb has to appear somewhere.
    expect(normalizeAssistantPlacement('dock-left')).toBe(
      DEFAULT_ASSISTANT_PLACEMENT,
    )
    expect(normalizeAssistantPlacement(undefined)).toBe(
      DEFAULT_ASSISTANT_PLACEMENT,
    )
    expect(normalizeAssistantPlacement(null)).toBe(DEFAULT_ASSISTANT_PLACEMENT)
  })

  test('every placement it does know is kept', () => {
    for (const value of ASSISTANT_PLACEMENT_VALUES) {
      expect(normalizeAssistantPlacement(value)).toBe(value)
    }
  })

  test('every placement anchors the chat window somewhere', () => {
    for (const value of ASSISTANT_PLACEMENT_VALUES) {
      expect(ASSISTANT_WINDOW_ANCHOR[value]).toBeTruthy()
    }
  })
})

describe('the bottom strip', () => {
  test('the shell reserves exactly the height the bar occupies', () => {
    // The bar is `fixed`, so it only stays clear of the panes because
    // the shell pads itself by the same amount. Drift here is invisible
    // in code review and obvious on screen: the orb starts sitting on
    // the status bar, which is the one thing this placement exists to
    // prevent.
    const height = ASSISTANT_BAR.height.replace(/^h-/, '')
    expect(ASSISTANT_BAR.reserve).toBe(`pb-${height}`)
  })
})
