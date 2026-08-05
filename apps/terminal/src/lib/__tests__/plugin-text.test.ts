// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { BOOTSTRAP_PLUGINS } from '../plugins/bootstrap-bundle'
import { CATEGORIES } from '../../../../registry/src/catalog'

/**
 * Coverage for the keys `plugin-text.ts` derives from a plugin id, and for the
 * registry category keys the Plugin Store derives from a category id.
 *
 * Neither is visible to the catalog-parity test, which only sees literal
 * `t('...')` call sites. Both fail the same silent way if a key is missing:
 * `defaultValue` hands back the English the manifest or the server supplied,
 * which reads as "this plugin has no translation" rather than "we forgot one".
 *
 * Walks the real bundled plugins, so a plugin added later fails here until its
 * text reaches the catalog.
 */

const en = JSON.parse(
  readFileSync(
    join(import.meta.dir, '..', '..', 'locales', 'en', 'translation.json'),
    'utf8',
  ),
) as Record<string, unknown>

function lookup(key: string): unknown {
  let node: unknown = en
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

describe('derived plugin-text keys resolve in en', () => {
  test('every bundled plugin has a title and description', () => {
    const keys = BOOTSTRAP_PLUGINS.flatMap(({ manifest }) => [
      `pluginStore.manifests.${manifest.id}.title`,
      `pluginStore.manifests.${manifest.id}.description`,
    ])
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((k) => typeof lookup(k) !== 'string')).toEqual([])
  })

  test('every registry category has a label and description', () => {
    const keys = CATEGORIES.flatMap((category) => [
      `registryCategories.${category.id}.label`,
      `registryCategories.${category.id}.description`,
    ])
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((k) => typeof lookup(k) !== 'string')).toEqual([])
  })

  test('plugin ids stay usable as key segments', () => {
    // A dot would silently nest the key one level deeper and never match.
    for (const { manifest } of BOOTSTRAP_PLUGINS) {
      expect(manifest.id).not.toContain('.')
      expect(manifest.id).not.toContain(':')
    }
  })
})
