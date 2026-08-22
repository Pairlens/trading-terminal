// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  PLUGIN_FAMILIES,
  PLUGIN_FAMILY_MAP,
  isPluginFamilyId,
  pluginFamilyOf,
} from '../plugin-families'
import type { PluginManifest } from '../plugin-types'

function manifest(over: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test',
    name: 'Test',
    version: '1.0.0',
    author: 'Test',
    description: 'Test',
    capabilities: [],
    config: {},
    ...over,
  } as PluginManifest
}

describe('family table', () => {
  test('ids are unique and the map covers every entry', () => {
    const ids = PLUGIN_FAMILIES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const family of PLUGIN_FAMILIES) {
      expect(PLUGIN_FAMILY_MAP[family.id]).toBe(family)
    }
  })

  test('declared order is unique and ascending', () => {
    const orders = PLUGIN_FAMILIES.map((f) => f.order)
    expect(new Set(orders).size).toBe(orders.length)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  test('isPluginFamilyId accepts only declared ids', () => {
    expect(isPluginFamilyId('predictions')).toBe(true)
    expect(isPluginFamilyId('cex-futures')).toBe(true)
    expect(isPluginFamilyId('memes')).toBe(true)
    // Not a family, and not reserved as one either. Swap it if commodities
    // ever ship: the point of the case is an id shaped like a real one.
    expect(isPluginFamilyId('commodities')).toBe(false)
    expect(isPluginFamilyId(undefined)).toBe(false)
    expect(isPluginFamilyId(3)).toBe(false)
  })
})

describe('pluginFamilyOf', () => {
  test('an explicit metadata.family wins over capability shape', () => {
    const stamped = manifest({
      metadata: { family: 'core', assetClass: 'crypto-spot' },
      capabilities: [
        { id: 'theme:override', singleton: true, markets: ['*'], priority: 5 },
      ],
    })
    expect(pluginFamilyOf(stamped)).toBe('core')
  })

  test('a bogus declared family falls through to the shape rules', () => {
    const bogus = manifest({
      metadata: { family: 'commodities', assetClass: 'dex' },
    })
    expect(pluginFamilyOf(bogus)).toBe('dex')
  })

  test('theme:override implies themes', () => {
    expect(
      pluginFamilyOf(
        manifest({
          capabilities: [
            {
              id: 'theme:override',
              singleton: true,
              markets: ['*'],
              priority: 5,
            },
          ],
        }),
      ),
    ).toBe('themes')
  })

  test('AI without requiresAuth is BYOK; with it, it is not', () => {
    const byok = manifest({
      capabilities: [
        { id: 'ai:inference', singleton: false, markets: ['*'], priority: 10 },
      ],
    })
    expect(pluginFamilyOf(byok)).toBe('ai-byok')

    const hosted = manifest({
      capabilities: [
        {
          id: 'ai:inference',
          singleton: false,
          markets: ['*'],
          priority: 10,
          requiresAuth: true,
        },
      ],
    })
    expect(pluginFamilyOf(hosted)).toBeNull()
  })

  test('asset class maps connectors', () => {
    const of = (assetClass: string) =>
      pluginFamilyOf(manifest({ metadata: { assetClass } }))
    expect(of('prediction')).toBe('predictions')
    expect(of('stocks')).toBe('equities')
    expect(of('dex')).toBe('dex')
    expect(of('crypto-spot')).toBe('cex-spot')
    // Perps are their own family: same venues, different instrument, and a
    // deployment drops one without dropping the other.
    expect(of('crypto-perp')).toBe('cex-futures')
  })

  test('cex-futures sorts directly after cex-spot in the Store', () => {
    const ids = PLUGIN_FAMILIES.map((f) => f.id)
    expect(ids.indexOf('cex-futures')).toBe(ids.indexOf('cex-spot') + 1)
  })

  test('an unrecognisable manifest is unfamilied, never filtered', () => {
    expect(pluginFamilyOf(manifest())).toBeNull()
  })
})
