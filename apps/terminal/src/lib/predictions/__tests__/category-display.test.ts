// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The taxonomy is owned by the connector and drawn by the terminal, so the two
 * halves can drift: a category added to `PREDICTION_CATEGORY_RULES` renders as
 * a grey tag with an English name until someone notices.
 *
 * These tests are the join. One walks the connector's ids against the display
 * table, the other walks them against the English catalog — which the i18n
 * audit cannot do for itself, because the label key is built from a template
 * literal and everything under that prefix is invisible to it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { PREDICTION_CATEGORY_IDS } from '@pairlens/plugins/prediction-connector/categories'

import {
  PREDICTION_CATEGORY_DISPLAY_IDS,
  predictionCategoryIcon,
  predictionCategoryLabel,
} from '../category-display'

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
) as { predictionCategories: { names: Record<string, string> } }

/** A `t` that resolves against the real catalog, defaultValue and all. */
const t = ((key: string, opts?: { defaultValue?: string }) => {
  const leaf = key.split('.').pop() ?? ''
  return EN.predictionCategories.names[leaf] ?? opts?.defaultValue ?? key
}) as never

describe('prediction category display', () => {
  test('every canonical category has a glyph and a key', () => {
    expect([...PREDICTION_CATEGORY_DISPLAY_IDS].sort()).toEqual(
      [...PREDICTION_CATEGORY_IDS].sort(),
    )
  })

  test('every canonical category resolves to a real English label', () => {
    // Not just "non-empty": the label has to come OUT of the catalog. A
    // missing entry falls back to the id, which reads fine in English and
    // reads as English in the other sixteen locales — the failure mode this
    // test exists to catch.
    const catalog = new Set(Object.values(EN.predictionCategories.names))
    const fallenBack = PREDICTION_CATEGORY_IDS.filter(
      (id) => !catalog.has(predictionCategoryLabel(t, id)),
    )
    expect(fallenBack).toEqual([])
    expect(catalog.size).toBe(PREDICTION_CATEGORY_IDS.length)
  })

  test('a venue category the taxonomy has not absorbed renders as itself', () => {
    // Kalshi can list a new category any day. It draws the fallback tag glyph
    // and the venue's own word, rather than a blank row.
    expect(predictionCategoryLabel(t, 'Underwater Basket Weaving')).toBe(
      'Underwater Basket Weaving',
    )
    expect(predictionCategoryIcon('Underwater Basket Weaving')).toBeDefined()
  })
})
