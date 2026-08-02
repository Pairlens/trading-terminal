// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'
import { PluginManager } from '../manager.ts'
import type {
  AccessProvider,
  CapabilityId,
  PluginCapabilityDeclaration,
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '../types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(
  id: string,
  capabilities: Array<PluginCapabilityDeclaration>,
  accessLevels?: Array<string>,
): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    author: 'test',
    description: 'test plugin',
    capabilities,
    config: {},
    accessLevels,
  }
}

function makeCap(
  capId: CapabilityId,
  opts: Partial<PluginCapabilityDeclaration> = {},
): PluginCapabilityDeclaration {
  return {
    id: capId,
    singleton: true,
    markets: ['*'],
    priority: 10,
    streaming: false,
    ...opts,
  }
}

function makeInstance(
  manifest: PluginManifest,
  overrides: Partial<PluginInstance> = {},
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    execute: async (_params: PluginExecuteParams) => ({ source: manifest.id }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCapabilityAccess', () => {
  let manager: PluginManager

  beforeEach(() => {
    manager = new PluginManager({ market: 'okx' })
  })

  it('returns unavailable when no plugin exists', () => {
    const result = manager.getCapabilityAccess('market-data:discovery:search')
    expect(result.status).toBe('unavailable')
    expect(result.pluginId).toBeNull()
  })

  it('returns granted when capability has no requiresAuth', async () => {
    const m = makeManifest('p', [makeCap('market-data:discovery')])
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    const result = manager.getCapabilityAccess('market-data:discovery')
    expect(result.status).toBe('granted')
    expect(result.pluginId).toBe('p')
  })

  it('returns granted when requiresAuth is true and user IS authenticated (no access level)', async () => {
    const m = makeManifest('p', [
      makeCap('market-data:discovery:search', { requiresAuth: true }),
    ])
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    manager.setAccessProvider({
      isAuthenticated: () => true,
      getAccessLevel: () => null,
    })

    const result = manager.getCapabilityAccess('market-data:discovery:search')
    expect(result.status).toBe('granted')
    expect(result.pluginId).toBe('p')
  })

  it('returns auth-required when requiresAuth is true and user NOT authenticated', async () => {
    const m = makeManifest('p', [
      makeCap('market-data:discovery:search', { requiresAuth: true }),
    ])
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    manager.setAccessProvider({
      isAuthenticated: () => false,
      getAccessLevel: () => null,
    })

    const result = manager.getCapabilityAccess('market-data:discovery:search')
    expect(result.status).toBe('auth-required')
    expect(result.pluginId).toBe('p')
  })

  it('returns granted when primary requires auth but fallback does NOT', async () => {
    const mPrimary = makeManifest('p-primary', [
      makeCap('market-data:discovery:search', {
        requiresAuth: true,
        priority: 5,
      }),
    ])
    const mFallback = makeManifest('p-fallback', [
      makeCap('market-data:discovery:search', {
        requiresAuth: false,
        priority: 20,
      }),
    ])

    await manager.installPlugin(mPrimary, (mf) => makeInstance(mf))
    await manager.installPlugin(mFallback, (mf) => makeInstance(mf))
    await manager.activatePlugin('p-primary', {})
    await manager.activatePlugin('p-fallback', {})

    manager.setAccessProvider({
      isAuthenticated: () => false,
      getAccessLevel: () => null,
    })

    const result = manager.getCapabilityAccess('market-data:discovery:search')
    expect(result.status).toBe('granted')
    expect(result.pluginId).toBe('p-fallback')
  })

  it('returns upgrade-required when access level insufficient', async () => {
    const m = makeManifest(
      'p',
      [
        makeCap('ai:inference', {
          requiresAuth: true,
          requiredAccessLevel: 'pro',
        }),
      ],
      ['free', 'basic', 'pro', 'max'],
    )
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    manager.setAccessProvider({
      isAuthenticated: () => true,
      getAccessLevel: () => 'basic',
    })

    const result = manager.getCapabilityAccess('ai:inference')
    expect(result.status).toBe('upgrade-required')
    expect(result.requiredAccessLevel).toBe('pro')
    expect(result.currentAccessLevel).toBe('basic')
  })

  it('returns granted when access level meets requirement', async () => {
    const m = makeManifest(
      'p',
      [
        makeCap('ai:inference', {
          requiresAuth: true,
          requiredAccessLevel: 'pro',
        }),
      ],
      ['free', 'basic', 'pro', 'max'],
    )
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    manager.setAccessProvider({
      isAuthenticated: () => true,
      getAccessLevel: () => 'pro',
    })

    const result = manager.getCapabilityAccess('ai:inference')
    expect(result.status).toBe('granted')
    expect(result.pluginId).toBe('p')
  })

  it('access level comparison respects accessLevels array ordering', async () => {
    const m = makeManifest(
      'p',
      [
        makeCap('ai:inference', {
          requiresAuth: true,
          requiredAccessLevel: 'basic',
        }),
      ],
      ['free', 'basic', 'pro', 'max'],
    )
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    // 'max' is at index 3, 'basic' at index 1 → max >= basic
    manager.setAccessProvider({
      isAuthenticated: () => true,
      getAccessLevel: () => 'max',
    })

    const result = manager.getCapabilityAccess('ai:inference')
    expect(result.status).toBe('granted')
  })

  it('returns granted for no-auth capability when accessProvider is not set', async () => {
    const m = makeManifest('p', [makeCap('market-data:discovery')])
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    const result = manager.getCapabilityAccess('market-data:discovery')
    expect(result.status).toBe('granted')
  })

  it('returns auth-required for requiresAuth capability when accessProvider is not set', async () => {
    const m = makeManifest('p', [
      makeCap('market-data:discovery:search', { requiresAuth: true }),
    ])
    await manager.installPlugin(m, (mf) => makeInstance(mf))
    await manager.activatePlugin('p', {})

    const result = manager.getCapabilityAccess('market-data:discovery:search')
    expect(result.status).toBe('auth-required')
    expect(result.pluginId).toBe('p')
  })
})
