// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

/**
 * The deployment kill-switch. Getting this wrong is not a cosmetic bug: an
 * over-eager filter uninstalls a user's own plugins, and a leaky one ships an
 * asset class a deployment is not allowed to offer.
 */

import {
  PLUGIN_FAMILIES,
  PLUGIN_FAMILY_MAP,
  pluginFamilyOf,
} from '@pairlens/shared/plugin-families'
import { BOOTSTRAP_PLUGINS } from '../plugins/bootstrap-bundle'
import {
  isFamilyExcluded,
  parseDisabledFamilies,
  resetExcludedPluginFamiliesCache,
} from '../plugins/plugin-families'
import type { PluginManifest } from '@pairlens/plugin-system'

const ENV_KEY = 'VITE_PAIRLENS_DISABLED_FAMILIES'

function withDisabledFamilies(value: string, run: () => void): void {
  process.env[ENV_KEY] = value
  resetExcludedPluginFamiliesCache()
  try {
    run()
  } finally {
    delete process.env[ENV_KEY]
    resetExcludedPluginFamiliesCache()
  }
}

function bundled(id: string): PluginManifest {
  const plugin = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === id)
  if (!plugin) throw new Error(`not a bundled plugin: ${id}`)
  return plugin.manifest
}

function manifest(over: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test',
    description: 'Test',
    capabilities: [],
    config: {},
    ...over,
  } as PluginManifest
}

describe('VITE_PAIRLENS_DISABLED_FAMILIES parsing', () => {
  test('unset or empty excludes nothing', () => {
    expect([...parseDisabledFamilies(undefined)]).toEqual([])
    expect([...parseDisabledFamilies('')]).toEqual([])
    expect([...parseDisabledFamilies('  ,  ')]).toEqual([])
  })

  test('known families parse, whitespace tolerated', () => {
    const excluded = parseDisabledFamilies(' predictions , equities ')
    expect([...excluded].sort()).toEqual(['equities', 'predictions'])
  })

  test('unknown ids are ignored with a single warning', () => {
    const warnings: Array<string> = []
    const excluded = parseDisabledFamilies('memes,cex-futures,dex', (m) =>
      warnings.push(m),
    )
    expect([...excluded]).toEqual(['dex'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('memes')
    expect(warnings[0]).toContain('cex-futures')
  })

  test('required families refuse exclusion', () => {
    const warnings: Array<string> = []
    const excluded = parseDisabledFamilies('core,intelligence,themes', (m) =>
      warnings.push(m),
    )
    expect([...excluded]).toEqual(['themes'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('core')
    expect(warnings[0]).toContain('intelligence')
  })

  test('every required family is unexcludable', () => {
    const required = PLUGIN_FAMILIES.filter((f) => f.required).map((f) => f.id)
    expect(required.length).toBeGreaterThan(0)
    expect([...parseDisabledFamilies(required.join(','), () => {})]).toEqual([])
  })
})

describe('family resolution over the real bundled plugins', () => {
  test('every bundled plugin declares an explicit family', () => {
    const unfamilied = BOOTSTRAP_PLUGINS.filter(
      (p) => !p.manifest.metadata?.['family'],
    ).map((p) => p.manifest.id)
    expect(unfamilied).toEqual([])
  })

  test('every declared family is a known id', () => {
    const known = new Set(PLUGIN_FAMILIES.map((f) => f.id))
    const bad = BOOTSTRAP_PLUGINS.map((p) => p.manifest).filter(
      (m) => !known.has(m.metadata!['family'] as never),
    )
    expect(bad.map((m) => m.id)).toEqual([])
  })

  test('the irreducible core plugins live in required families', () => {
    // Load-bearing for a UI guard, not just tidiness. installed-plugins.tsx
    // routes a pairlens-core disable through a confirm dialog, and the family
    // bulk switch does NOT — it is safe only because required families render
    // no bulk switch at all. Flip either of these to required:false and the
    // Themes-style switch would appear over Core, disabling the terminal in
    // one unconfirmed click.
    for (const id of ['pairlens-core', 'pairlens-intelligence']) {
      const family = pluginFamilyOf(bundled(id))
      expect(family).not.toBeNull()
      expect(PLUGIN_FAMILY_MAP[family!].required).toBe(true)
    }
  })

  test('required families actually have members', () => {
    for (const family of PLUGIN_FAMILIES.filter((f) => f.required)) {
      const members = BOOTSTRAP_PLUGINS.filter(
        (p) => pluginFamilyOf(p.manifest) === family.id,
      )
      expect(members.length).toBeGreaterThan(0)
    }
  })
})

describe('isFamilyExcluded', () => {
  test('the default build excludes nothing', () => {
    resetExcludedPluginFamiliesCache()
    for (const plugin of BOOTSTRAP_PLUGINS) {
      expect(isFamilyExcluded(plugin.manifest, 'bootstrap')).toBe(false)
    }
  })

  test('an excluded family drops exactly its bundled members', () => {
    withDisabledFamilies('equities', () => {
      expect(
        isFamilyExcluded(bundled('alpaca-market-connector'), 'bootstrap'),
      ).toBe(true)
      expect(isFamilyExcluded(bundled('pairlens-core'), 'bootstrap')).toBe(
        false,
      )
      expect(
        isFamilyExcluded(bundled('binance-market-connector'), 'bootstrap'),
      ).toBe(false)
    })
  })

  test('exclusion applies only to plugins whose ledger source is bootstrap', () => {
    // Same shape as the bundled broker connector, but the user's own install.
    const thirdParty = manifest({
      id: 'acme-broker-connector',
      metadata: { assetClass: 'stocks' },
    })
    expect(pluginFamilyOf(thirdParty)).toBe('equities')
    withDisabledFamilies('equities', () => {
      expect(isFamilyExcluded(thirdParty, 'registry')).toBe(false)
      expect(isFamilyExcluded(thirdParty, 'url')).toBe(false)
      expect(isFamilyExcluded(thirdParty, 'local')).toBe(false)
      // No source given: falls back to "is this a plugin we ship" — it is not.
      expect(isFamilyExcluded(thirdParty)).toBe(false)
    })
  })

  test('an unfamilied plugin is never filtered', () => {
    const plain = manifest()
    expect(pluginFamilyOf(plain)).toBeNull()
    withDisabledFamilies('equities,dex,predictions,ai-byok,themes', () => {
      expect(isFamilyExcluded(plain, 'bootstrap')).toBe(false)
    })
  })
})
