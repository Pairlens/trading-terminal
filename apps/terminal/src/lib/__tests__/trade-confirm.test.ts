// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { TIER1_KEYS, isBlocked } from '@/lib/sync/sync-domains'
import {
  TRADE_CONFIRM_MODES,
  TRADE_CONFIRM_MODE_DEFAULT,
  TRADE_CONFIRM_MODE_KEY,
  isTradeConfirmMode,
  normalizeTradeConfirmMode,
  resolveConfirmGesture,
  tradeHoldMs,
} from '@/lib/settings/trade-confirm'

/**
 * The confirm gesture decides how much stands between a stray press and a
 * filled order, so the safe end of it is worth pinning down: hold is the
 * default, anything unrecognised resolves to hold, and only an explicit
 * `click` gives up the wait.
 */
describe('trade confirm mode', () => {
  test('press & hold is the default', () => {
    expect(TRADE_CONFIRM_MODE_DEFAULT).toBe('hold')
  })

  test('only the two known gestures are valid', () => {
    expect(isTradeConfirmMode('hold')).toBe(true)
    expect(isTradeConfirmMode('click')).toBe(true)
    expect(isTradeConfirmMode('tap')).toBe(false)
    expect(isTradeConfirmMode(undefined)).toBe(false)
  })

  test('a corrupted stored preference falls back to hold, never click', () => {
    for (const stored of [null, undefined, '', 'Click', 0, {}, ['click']]) {
      expect(normalizeTradeConfirmMode(stored)).toBe('hold')
    }
    expect(normalizeTradeConfirmMode('click')).toBe('click')
  })

  test('every option carries label + description keys', () => {
    expect(TRADE_CONFIRM_MODES.map((m) => m.value)).toEqual(['hold', 'click'])
    for (const mode of TRADE_CONFIRM_MODES) {
      expect(mode.labelKey.startsWith('settings.risk.')).toBe(true)
      expect(mode.descKey.startsWith('settings.risk.')).toBe(true)
    }
  })
})

describe('resolveConfirmGesture', () => {
  test('hold mode holds', () => {
    expect(resolveConfirmGesture('hold', { reducedMotion: false })).toBe('hold')
  })

  test('click mode fires immediately', () => {
    expect(resolveConfirmGesture('click', { reducedMotion: false })).toBe(
      'immediate',
    )
  })

  test('reduced motion never gets a hold it cannot see fill', () => {
    expect(resolveConfirmGesture('hold', { reducedMotion: true })).toBe(
      'immediate',
    )
    expect(resolveConfirmGesture('click', { reducedMotion: true })).toBe(
      'immediate',
    )
  })
})

describe('hold duration', () => {
  test('live funds hold longer than paper', () => {
    expect(tradeHoldMs(true)).toBeGreaterThan(tradeHoldMs(false))
  })
})

describe('persistence contract', () => {
  test('the setting syncs as a preference and is not blocked', () => {
    expect(TIER1_KEYS.has(TRADE_CONFIRM_MODE_KEY)).toBe(true)
    expect(isBlocked(TRADE_CONFIRM_MODE_KEY)).toBe(false)
  })
})
