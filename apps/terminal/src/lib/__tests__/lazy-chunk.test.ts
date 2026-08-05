// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { isChunkLoadError } from '@/lib/lazy-chunk'

describe('isChunkLoadError', () => {
  test('recognises every engine wording for a chunk that went missing', () => {
    // The one the deployed terminal actually reported.
    expect(
      isChunkLoadError(
        new Error(
          'Failed to fetch dynamically imported module: https://terminal.pairlens.finance/assets/user-settings-sections-BdfaNQFD.js',
        ),
      ),
    ).toBe(true)
    expect(
      isChunkLoadError(new Error('error loading dynamically imported module')),
    ).toBe(true)
    expect(
      isChunkLoadError(new Error('Importing a module script failed.')),
    ).toBe(true)
    // The SPA fallback answering a missing asset with the shell HTML.
    expect(
      isChunkLoadError(
        new Error(
          'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
        ),
      ),
    ).toBe(true)
    expect(
      isChunkLoadError(new Error('Unable to preload CSS for /a.css')),
    ).toBe(true)
  })

  test('accepts a bare string as well as an Error', () => {
    expect(
      isChunkLoadError('Failed to fetch dynamically imported module'),
    ).toBe(true)
  })

  test('a module that throws while evaluating is not a chunk error', () => {
    // These must reach the error boundary: reloading would loop on a real bug.
    expect(
      isChunkLoadError(new Error('Cannot read properties of undefined')),
    ).toBe(false)
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false)
    expect(isChunkLoadError(new Error('NetworkError when fetching /api'))).toBe(
      false,
    )
  })

  test('non-errors never match', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({})).toBe(false)
    expect(isChunkLoadError(new Error(''))).toBe(false)
  })
})
