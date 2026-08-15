// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  ASSET_CLASS_META,
  BUILTIN_WORKSPACE_TEMPLATES,
  SCREEN_SIZE_META,
  TRADER_TYPE_META,
} from '@/lib/workspace-store/catalog'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'

/**
 * Coverage for the derived keys in `lib/workspace-store/template-labels.ts`.
 *
 * The catalog-parity test only sees `t('literal')` call sites, so keys built
 * from a template's `id` or a facet value are invisible to it. They are also
 * the keys most likely to go missing: a new template renders fine in English
 * via its `defaultValue` fallback and silently stays English everywhere else.
 *
 * This walks the real catalog and facet META records — not a fixture — so a
 * new template or facet value fails here until the catalog catches up.
 */

const LOCALES_DIR = join(import.meta.dir, '..', '..', 'locales')

type Node = Record<string, unknown>

const en = JSON.parse(
  readFileSync(join(LOCALES_DIR, 'en', 'translation.json'), 'utf8'),
) as Node

function lookup(key: string): unknown {
  let node: unknown = en
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Node)[part]
  }
  return node
}

/** Mirrors `templateSlug()` in `template-labels.ts`: strip the `template:` id prefix. */
function templateSlug(id: string): string {
  return id.startsWith('template:') ? id.slice('template:'.length) : id
}

/**
 * Bundled plugins ship workspace presets of their own (`contributes.
 * workspaces`), and the store renders them through the same derived keys. They
 * are exactly as easy to forget as a catalog entry, and easier: the plugin
 * lives in another package.
 */
const CONTRIBUTED = BOOTSTRAP_PLUGINS.flatMap(
  ({ manifest }) => manifest.contributes?.workspaces ?? [],
)

const ALL_TEMPLATES = [...BUILTIN_WORKSPACE_TEMPLATES, ...CONTRIBUTED]

describe('derived catalog keys resolve in en', () => {
  test('workspace templates', () => {
    expect(BUILTIN_WORKSPACE_TEMPLATES.length).toBeGreaterThan(0)
    expect(CONTRIBUTED.length).toBeGreaterThan(0)
    const keys = ALL_TEMPLATES.flatMap((tpl) => {
      const base = `workspaceStore.templates.${templateSlug(tpl.id)}`
      const fieldKeys = [
        `${base}.name`,
        `${base}.tagline`,
        `${base}.description`,
      ]
      if (tpl.menuLabel) fieldKeys.push(`${base}.menuLabel`)
      return fieldKeys
    })
    const missing = keys.filter((k) => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })

  test('template ids are unique across the catalog and the plugins', () => {
    // A plugin id that collided with a catalog id would share translations and
    // fight for the same store card.
    const ids = ALL_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('template ids are namespace-safe once slugged', () => {
    // i18next reads ':' as its namespace separator by default — a raw
    // `template:foo` id embedded in a key would silently fail to resolve.
    for (const tpl of ALL_TEMPLATES) {
      expect(templateSlug(tpl.id)).not.toContain(':')
    }
  })

  test('trader type facets', () => {
    const types = Object.keys(TRADER_TYPE_META)
    expect(types.length).toBeGreaterThan(0)
    const keys = types.flatMap((tt) => [
      `workspaceStore.traderTypes.${tt}.label`,
      `workspaceStore.traderTypes.${tt}.description`,
    ])
    const missing = keys.filter((k) => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })

  test('asset class facets', () => {
    const classes = Object.keys(ASSET_CLASS_META)
    expect(classes.length).toBeGreaterThan(0)
    const keys = classes.map((ac) => `workspaceStore.assetClasses.${ac}.label`)
    const missing = keys.filter((k) => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })

  test('screen size facets', () => {
    const sizes = Object.keys(SCREEN_SIZE_META)
    expect(sizes.length).toBeGreaterThan(0)
    const keys = sizes.map((ss) => `workspaceStore.screenSizes.${ss}.label`)
    const missing = keys.filter((k) => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })
})
