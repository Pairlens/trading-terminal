// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two properties a chip has to have to be worth drawing: the same name
 * always gets the same mark, and names that look alike do not.
 */
import { describe, expect, it } from 'bun:test'

import {
  hashSeed,
  identityGradient,
  identityInitials,
} from '../identity-gradient'

describe('identityGradient', () => {
  it('is stable for a seed', () => {
    expect(identityGradient('BONK')).toEqual(identityGradient('BONK'))
  })

  it('ignores case and surrounding space, because the reader does', () => {
    expect(identityGradient(' bonk ')).toEqual(identityGradient('BONK'))
  })

  it('separates names that share a prefix', () => {
    // The reason for FNV-1a over the `hash * 31 + c` loop next door: launchpad
    // tickers share prefixes constantly, and a hash that avalanches only on
    // the head would give all three of these the same chip.
    const marks = ['MEME', 'MEMECOIN', 'MEMEKING'].map(
      (name) => identityGradient(name).backgroundImage,
    )
    expect(new Set(marks).size).toBe(3)
  })

  it('reads its lightness and chroma from the theme, never from the hash', () => {
    // The whole point of hashing only the hue: a palette baked into JS cannot
    // follow a colour mode, let alone eighteen themes.
    const { backgroundImage, color } = identityGradient('WIF')
    for (const token of [
      '--identity-from-l',
      '--identity-from-c',
      '--identity-to-l',
      '--identity-to-c',
    ]) {
      expect(backgroundImage).toContain(`var(${token})`)
    }
    expect(color).toContain('var(--identity-fg-l)')
    expect(backgroundImage).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('spreads a realistic column across many hues', () => {
    const names = [
      'DOGE',
      'SHIB',
      'PEPE',
      'BONK',
      'WIF',
      'TRUMP',
      'PENGU',
      'SPX',
      'FLOKI',
      'APEPE',
      'TIBBIR',
      'COCO',
      'CASHCAT',
      'CHEEMS',
      'ANSEM',
      'MELANIA',
      'FARTCOIN',
      'PUMP',
    ]
    const marks = new Set(names.map((n) => identityGradient(n).backgroundImage))
    // Collisions are allowed — twenty slots and a jitter, not a guarantee —
    // but a column of eighteen should not look like a column of five.
    expect(marks.size).toBeGreaterThanOrEqual(names.length - 2)
  })

  it('answers for an empty seed rather than special-casing it', () => {
    expect(identityGradient('').backgroundImage).toContain('linear-gradient')
  })
})

describe('hashSeed', () => {
  it('is an unsigned 32-bit value', () => {
    for (const seed of ['', 'a', 'BONK', '🐕', 'x'.repeat(200)]) {
      const hash = hashSeed(seed)
      expect(Number.isInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThan(2 ** 32)
    }
  })
})

describe('identityInitials', () => {
  it('takes the first word, upper-cased', () => {
    expect(identityInitials('Fartcoin')).toBe('FA')
    expect(identityInitials('pump fun')).toBe('PU')
  })

  it('does not cut a surrogate pair in half', () => {
    // A fair share of launchpad tickers are emoji, and `slice(0, 2)` on one
    // renders a replacement glyph.
    expect(identityInitials('🐕‍🦺x', 1)).toBe('🐕')
    expect(identityInitials('币安人生')).toBe('币安')
  })

  it('is empty for an empty name', () => {
    expect(identityInitials('   ')).toBe('')
  })
})
