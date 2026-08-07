// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The desktop nudge is an unsolicited popup, which makes its suppression rules
 * the whole feature: every one of them exists because showing the toast in that
 * situation would be an annoyance, and none of them is visible from the
 * component that raises it.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

// Minimal localStorage backing — the module reads it lazily and defensively.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

const {
  DESKTOP_NUDGE_SEEN_KEY,
  hasSeenDesktopCta,
  markNudgeSeen,
  readNudgeSeen,
  shouldShowDesktopNudge,
} = await import('../desktop-nudge')

/** The one arrangement in which the nudge is allowed to appear. */
const ALLOWED = {
  hosted: true,
  ctaSeen: false,
  nudgeSeen: false,
  tourPending: false,
  tipsDisabled: false,
}

describe('shouldShowDesktopNudge', () => {
  test('shows on a browser build that has never been told', () => {
    expect(shouldShowDesktopNudge(ALLOWED)).toBe(true)
  })

  test('never on desktop — there is nothing left to install', () => {
    expect(shouldShowDesktopNudge({ ...ALLOWED, hosted: false })).toBe(false)
  })

  test('not to someone who already opened the desktop dialog', () => {
    expect(shouldShowDesktopNudge({ ...ALLOWED, ctaSeen: true })).toBe(false)
  })

  test('once per surface — a second visit stays quiet', () => {
    expect(shouldShowDesktopNudge({ ...ALLOWED, nudgeSeen: true })).toBe(false)
  })

  test('waits out the section tour rather than talking over it', () => {
    expect(shouldShowDesktopNudge({ ...ALLOWED, tourPending: true })).toBe(
      false,
    )
  })

  test('respects the global "no section tips" opt-out', () => {
    expect(shouldShowDesktopNudge({ ...ALLOWED, tipsDisabled: true })).toBe(
      false,
    )
  })
})

describe('the seen map', () => {
  beforeEach(() => localStorage.clear())

  test('records one surface without silencing the other', () => {
    markNudgeSeen('notifications')
    expect(readNudgeSeen()).toEqual({ notifications: true })
    markNudgeSeen('bots')
    expect(readNudgeSeen()).toEqual({ notifications: true, bots: true })
  })

  test('survives a corrupt value instead of throwing on a page load', () => {
    localStorage.setItem(DESKTOP_NUDGE_SEEN_KEY, '{not json')
    expect(readNudgeSeen()).toEqual({})
  })
})

describe('hasSeenDesktopCta', () => {
  beforeEach(() => localStorage.clear())

  test('reads the JSON-encoded flag usePersistedState writes', () => {
    expect(hasSeenDesktopCta()).toBe(false)
    // Exactly what usePersistedState('desktop-cta-seen') stores.
    localStorage.setItem('pairlens:desktop-cta-seen', JSON.stringify(true))
    expect(hasSeenDesktopCta()).toBe(true)
  })
})
