// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { shouldAutoFocusFields } from '@/components/sign-in-focus'

const matchMediaReturning = (matches: boolean) => (query: string) => {
  expect(query).toBe('(pointer: coarse)')
  return { matches }
}

describe('shouldAutoFocusFields', () => {
  it('leaves a coarse pointer to do its own focusing', () => {
    // The whole point: on iOS a mount-time focus produces a focused field with
    // no keyboard, and the tap that should fix it is a no-op.
    expect(shouldAutoFocusFields(matchMediaReturning(true))).toBe(false)
  })

  it('keeps the courtesy for mice and trackpads', () => {
    expect(shouldAutoFocusFields(matchMediaReturning(false))).toBe(true)
  })

  it('assumes a pointer device when there is no matchMedia to ask', () => {
    // Server render or a stripped environment — desktop behaviour is the safe
    // default, because the failure it avoids only exists on touch.
    expect(shouldAutoFocusFields(null)).toBe(true)
    expect(shouldAutoFocusFields(undefined)).toBe(true)
  })
})
