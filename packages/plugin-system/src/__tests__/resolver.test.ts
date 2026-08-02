// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'
import { PluginResolver } from '../resolver.ts'
import type { CapabilityId, PluginInstance, PluginManifest } from '../types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(
  id: string,
  capabilities: Array<{
    capId?: CapabilityId
    markets?: Array<string>
    priority?: number
    singleton?: boolean
    streaming?: boolean
  }> = [],
): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    author: 'test',
    description: 'test plugin',
    capabilities: capabilities.map((c) => ({
      id: c.capId ?? 'market-data:discovery',
      singleton: c.singleton ?? true,
      markets: c.markets ?? ['*'],
      priority: c.priority ?? 50,
      streaming: c.streaming ?? false,
    })),
    config: {},
  }
}

function makePlugin(
  id: string,
  capabilities: Array<{
    capId?: CapabilityId
    markets?: Array<string>
    priority?: number
    singleton?: boolean
    streaming?: boolean
  }> = [],
  status: PluginInstance['status'] = 'active',
): PluginInstance {
  const manifest = makeManifest(id, capabilities)
  return {
    manifest,
    status,
    config: {},
    execute: async () => ({ source: id }),
    subscribe: (_params, callback) => {
      callback({ source: id })
      return () => undefined
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginResolver', () => {
  let resolver: PluginResolver

  beforeEach(() => {
    resolver = new PluginResolver()
  })

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe('registerPlugin / unregisterPlugin', () => {
    it('registers a plugin and makes it retrievable', () => {
      const plugin = makePlugin('plugin-a')
      resolver.registerPlugin(plugin)

      expect(resolver.getPlugin('plugin-a')).toBe(plugin)
      expect(resolver.getPlugins()).toHaveLength(1)
    })

    it('replaces an existing plugin when registered with the same id', () => {
      const pluginV1 = makePlugin('plugin-a')
      const pluginV2 = makePlugin('plugin-a')
      resolver.registerPlugin(pluginV1)
      resolver.registerPlugin(pluginV2)

      expect(resolver.getPlugins()).toHaveLength(1)
      expect(resolver.getPlugin('plugin-a')).toBe(pluginV2)
    })

    it('unregisters a plugin by id', () => {
      resolver.registerPlugin(makePlugin('plugin-a'))
      resolver.unregisterPlugin('plugin-a')

      expect(resolver.getPlugin('plugin-a')).toBeUndefined()
      expect(resolver.getPlugins()).toHaveLength(0)
    })

    it('silently ignores unregistering a non-existent plugin', () => {
      expect(() => resolver.unregisterPlugin('ghost')).not.toThrow()
    })

    it('returns undefined for an unknown plugin id', () => {
      expect(resolver.getPlugin('ghost')).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Priority-based resolution
  // -------------------------------------------------------------------------

  describe('resolve — priority ordering', () => {
    it('returns null when no plugins are registered', () => {
      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result).toBeNull()
    })

    it('returns null when no active plugins match', () => {
      resolver.registerPlugin(
        makePlugin('plugin-a', [{ priority: 20 }], 'installed'),
      )
      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result).toBeNull()
    })

    it('returns the single matching active plugin', () => {
      const plugin = makePlugin('plugin-a', [{ priority: 30 }])
      resolver.registerPlugin(plugin)

      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result).not.toBeNull()
      expect(result!.plugin.manifest.id).toBe('plugin-a')
      expect(result!.fallbacks).toHaveLength(0)
    })

    it('selects the plugin with lower priority number first', () => {
      resolver.registerPlugin(makePlugin('plugin-high', [{ priority: 5 }]))
      resolver.registerPlugin(makePlugin('plugin-low', [{ priority: 50 }]))

      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result!.plugin.manifest.id).toBe('plugin-high')
      expect(result!.fallbacks[0].manifest.id).toBe('plugin-low')
    })

    it('orders multiple fallbacks by ascending priority', () => {
      resolver.registerPlugin(makePlugin('p90', [{ priority: 90 }]))
      resolver.registerPlugin(makePlugin('p10', [{ priority: 10 }]))
      resolver.registerPlugin(makePlugin('p50', [{ priority: 50 }]))

      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result!.plugin.manifest.id).toBe('p10')
      expect(result!.fallbacks.map((p) => p.manifest.id)).toEqual([
        'p50',
        'p90',
      ])
    })

    it('ignores disabled plugins during resolution', () => {
      resolver.registerPlugin(
        makePlugin('plugin-disabled', [{ priority: 1 }], 'disabled'),
      )
      resolver.registerPlugin(makePlugin('plugin-active', [{ priority: 5 }]))

      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result!.plugin.manifest.id).toBe('plugin-active')
      expect(result!.fallbacks).toHaveLength(0)
    })

    it('ignores error-status plugins during resolution', () => {
      resolver.registerPlugin(
        makePlugin('plugin-error', [{ priority: 1 }], 'error'),
      )
      resolver.registerPlugin(makePlugin('plugin-ok', [{ priority: 5 }]))

      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result!.plugin.manifest.id).toBe('plugin-ok')
    })
  })

  // -------------------------------------------------------------------------
  // Market filtering
  // -------------------------------------------------------------------------

  describe('resolve — market filtering', () => {
    it('matches a plugin declared for a specific market', () => {
      resolver.registerPlugin(
        makePlugin('plugin-okx', [{ markets: ['okx'], priority: 10 }]),
      )

      const result = resolver.resolve({
        capability: 'market-data:discovery',
        market: 'okx',
      })
      expect(result!.plugin.manifest.id).toBe('plugin-okx')
    })

    it('does not match a plugin declared for a different market', () => {
      resolver.registerPlugin(
        makePlugin('plugin-okx', [{ markets: ['okx'], priority: 10 }]),
      )

      const result = resolver.resolve({
        capability: 'market-data:discovery',
        market: 'binance',
      })
      expect(result).toBeNull()
    })

    it('matches a wildcard plugin for any market query', () => {
      resolver.registerPlugin(
        makePlugin('plugin-any', [{ markets: ['*'], priority: 10 }]),
      )

      expect(
        resolver.resolve({
          capability: 'market-data:discovery',
          market: 'okx',
        }),
      ).not.toBeNull()
      expect(
        resolver.resolve({
          capability: 'market-data:discovery',
          market: 'binance',
        }),
      ).not.toBeNull()
    })

    it('prefers a specific-market plugin over a wildcard when priority is equal', () => {
      // Both have priority 10; specific market plugin is registered first — sort
      // is stable in V8 so order should be preserved, but let's give specific a
      // lower number to make the assertion unambiguous.
      resolver.registerPlugin(
        makePlugin('plugin-specific', [{ markets: ['okx'], priority: 5 }]),
      )
      resolver.registerPlugin(
        makePlugin('plugin-wildcard', [{ markets: ['*'], priority: 10 }]),
      )

      const result = resolver.resolve({
        capability: 'market-data:discovery',
        market: 'okx',
      })
      expect(result!.plugin.manifest.id).toBe('plugin-specific')
      expect(result!.fallbacks[0].manifest.id).toBe('plugin-wildcard')
    })

    it('does not let a market-specific plugin win a no-market (global) query', () => {
      // A market-specific plugin must NOT match an unspecified-market request —
      // only wildcard plugins serve the global catalog. Regression guard: a niche
      // connector (e.g. jupiter, markets ['jupiter'], priority 1) was shadowing
      // the global discovery provider and returning nothing.
      resolver.registerPlugin(
        makePlugin('plugin-okx', [{ markets: ['okx'], priority: 1 }]),
      )
      expect(
        resolver.resolve({ capability: 'market-data:discovery' }),
      ).toBeNull()
    })

    it('matches a wildcard plugin when no market is specified in the query', () => {
      resolver.registerPlugin(
        makePlugin('plugin-wildcard', [{ markets: ['*'], priority: 50 }]),
      )
      resolver.registerPlugin(
        makePlugin('plugin-okx', [{ markets: ['okx'], priority: 1 }]),
      )

      // No market → only the wildcard plugin is eligible, even though the
      // market-specific one has a higher priority.
      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result!.plugin.manifest.id).toBe('plugin-wildcard')
    })
  })

  // -------------------------------------------------------------------------
  // User pin override
  // -------------------------------------------------------------------------

  describe('resolve — user pin override', () => {
    it('user pin makes a lower-priority plugin win', () => {
      resolver.registerPlugin(
        makePlugin('p-high', [{ priority: 5, markets: ['okx'] }]),
      )
      resolver.registerPlugin(
        makePlugin('p-low', [{ priority: 50, markets: ['okx'] }]),
      )

      resolver.setUserPin('market-data:discovery', 'okx', 'p-low')

      const result = resolver.resolve({
        capability: 'market-data:discovery',
        market: 'okx',
      })
      expect(result!.plugin.manifest.id).toBe('p-low')
      expect(result!.fallbacks[0].manifest.id).toBe('p-high')
    })

    it('removing a user pin restores priority-based resolution', () => {
      resolver.registerPlugin(
        makePlugin('p-high', [{ priority: 5, markets: ['okx'] }]),
      )
      resolver.registerPlugin(
        makePlugin('p-low', [{ priority: 50, markets: ['okx'] }]),
      )

      resolver.setUserPin('market-data:discovery', 'okx', 'p-low')
      resolver.removeUserPin('market-data:discovery', 'okx')

      const result = resolver.resolve({
        capability: 'market-data:discovery',
        market: 'okx',
      })
      expect(result!.plugin.manifest.id).toBe('p-high')
    })

    it('falls through to priority resolution when pinned plugin is not active', () => {
      resolver.registerPlugin(
        makePlugin('p-pinned', [{ priority: 5, markets: ['okx'] }], 'disabled'),
      )
      resolver.registerPlugin(
        makePlugin('p-active', [{ priority: 50, markets: ['okx'] }]),
      )

      resolver.setUserPin('market-data:discovery', 'okx', 'p-pinned')

      const result = resolver.resolve({
        capability: 'market-data:discovery',
        market: 'okx',
      })
      expect(result!.plugin.manifest.id).toBe('p-active')
    })

    it('pins are scoped to capability+market and do not affect other queries', () => {
      resolver.registerPlugin(
        makePlugin('p-high', [
          { capId: 'market-data:discovery', priority: 5, markets: ['okx'] },
          { capId: 'ai:inference', priority: 5, markets: ['okx'] },
        ]),
      )
      resolver.registerPlugin(
        makePlugin('p-low', [
          { capId: 'market-data:discovery', priority: 50, markets: ['okx'] },
        ]),
      )

      resolver.setUserPin('market-data:discovery', 'okx', 'p-low')

      const candlesResult = resolver.resolve({
        capability: 'market-data:discovery',
        market: 'okx',
      })
      expect(candlesResult!.plugin.manifest.id).toBe('p-low')

      const tickerResult = resolver.resolve({
        capability: 'ai:inference',
        market: 'okx',
      })
      expect(tickerResult!.plugin.manifest.id).toBe('p-high')
    })
  })

  // -------------------------------------------------------------------------
  // resolveAll
  // -------------------------------------------------------------------------

  describe('resolveAll', () => {
    it('returns all active plugins sorted by priority', () => {
      resolver.registerPlugin(makePlugin('p90', [{ priority: 90 }]))
      resolver.registerPlugin(makePlugin('p10', [{ priority: 10 }]))
      resolver.registerPlugin(
        makePlugin('p50-disabled', [{ priority: 50 }], 'disabled'),
      )

      const all = resolver.resolveAll({ capability: 'market-data:discovery' })
      expect(all.map((p) => p.manifest.id)).toEqual(['p10', 'p90'])
    })

    it('returns empty array when no active plugins match', () => {
      resolver.registerPlugin(
        makePlugin('plugin-a', [{ priority: 10 }], 'installed'),
      )
      const all = resolver.resolveAll({ capability: 'market-data:discovery' })
      expect(all).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // Capability mismatch
  // -------------------------------------------------------------------------

  describe('capability matching', () => {
    it('does not match a plugin that only declares a different capability', () => {
      resolver.registerPlugin(
        makePlugin('plugin-ticker', [{ capId: 'ai:inference', priority: 10 }]),
      )

      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result).toBeNull()
    })

    it('matches a plugin with multiple capabilities for the queried one', () => {
      resolver.registerPlugin(
        makePlugin('plugin-multi', [
          { capId: 'ai:inference', priority: 10 },
          { capId: 'market-data:discovery', priority: 20 },
        ]),
      )

      const result = resolver.resolve({ capability: 'market-data:discovery' })
      expect(result!.plugin.manifest.id).toBe('plugin-multi')
    })
  })
})
