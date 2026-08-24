// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { shouldShowEquitiesConnectPrompt } from '@/lib/equities/connect-prompt'

const ELIGIBLE = {
  section: 'stocks',
  gate: 'missing',
  seen: false,
  onboardingDone: true,
  tourPending: false,
  tipsDisabled: false,
} as const

describe('shouldShowEquitiesConnectPrompt', () => {
  test('opens on the stocks board with no broker key', () => {
    expect(shouldShowEquitiesConnectPrompt(ELIGIBLE)).toBe(true)
  })

  test('never on another asset class', () => {
    for (const section of [
      'spot',
      'perp',
      'dex',
      'memecoin',
      'prediction',
      'nft',
    ] as const) {
      expect(shouldShowEquitiesConnectPrompt({ ...ELIGIBLE, section })).toBe(
        false,
      )
    }
  })

  test("stays shut while the credential store is still reading ('ok')", () => {
    expect(shouldShowEquitiesConnectPrompt({ ...ELIGIBLE, gate: 'ok' })).toBe(
      false,
    )
  })

  test('a sealed vault is the panes’ job, not this one', () => {
    expect(
      shouldShowEquitiesConnectPrompt({ ...ELIGIBLE, gate: 'sealed' }),
    ).toBe(false)
  })

  test('asks once per device', () => {
    expect(shouldShowEquitiesConnectPrompt({ ...ELIGIBLE, seen: true })).toBe(
      false,
    )
  })

  test('waits out onboarding and the section tour, and respects the opt-out', () => {
    expect(
      shouldShowEquitiesConnectPrompt({ ...ELIGIBLE, onboardingDone: false }),
    ).toBe(false)
    expect(
      shouldShowEquitiesConnectPrompt({ ...ELIGIBLE, tourPending: true }),
    ).toBe(false)
    expect(
      shouldShowEquitiesConnectPrompt({ ...ELIGIBLE, tipsDisabled: true }),
    ).toBe(false)
  })
})
