// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The asset-class table is a promise about colour: one hue per class, the same
 * one on every surface. These tests are what keep that promise checkable —
 * a sixth class added without a colour, or two classes sharing a token, would
 * otherwise only show up as two tabs that look alike.
 *
 * It also walks the translation keys the table names, because they are the
 * kind the i18n orphan audit can see but the static-usage audit cannot prove
 * resolve: they reach `t()` through a field, never as a literal argument.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { ASSET_CLASS_VISUALS, assetClassVisual } from '../visuals'

const EN = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      '..',
      '..',
      '..',
      'locales',
      'en',
      'translation.json',
    ),
    'utf8',
  ),
) as Record<string, unknown>

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      EN,
    )
}

describe('asset-class visuals', () => {
  test('every instrument class has an entry', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      expect(assetClassVisual(cls)).toBeDefined()
    }
    expect(Object.keys(ASSET_CLASS_VISUALS).sort()).toEqual(
      [...INSTRUMENT_CLASSES].sort(),
    )
  })

  test('no two classes share a colour', () => {
    const texts = Object.values(ASSET_CLASS_VISUALS).map((v) => v.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  test('every class paints itself with its own token', () => {
    for (const [cls, visual] of Object.entries(ASSET_CLASS_VISUALS)) {
      const token = `asset-${cls}`
      expect(visual.text).toBe(`text-${token}`)
      expect(visual.bg).toContain(`bg-${token}/`)
      expect(visual.border).toContain(`border-${token}/`)
      expect(visual.activeBg).toContain(`bg-${token}/`)
    }
  })

  test('every class names an icon and three real translation keys', () => {
    for (const visual of Object.values(ASSET_CLASS_VISUALS)) {
      expect(visual.icon.length).toBeGreaterThan(0)
      for (const key of [
        visual.labelKey,
        visual.nameKey,
        visual.descriptionKey,
      ]) {
        expect(typeof lookup(key)).toBe('string')
      }
    }
  })

  test('the detail strings the market badge derives are translated', () => {
    for (const key of [
      'assetClass.binary',
      'assetClass.multiOutcome',
      'session.statePre',
      'session.statePost',
      'session.stateClosed',
    ]) {
      expect(typeof lookup(key)).toBe('string')
    }
  })
})
