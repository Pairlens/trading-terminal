// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { PluginManager } from '../manager.ts'
import type {
  CapabilityId,
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '../types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(
  id: string,
  capId: CapabilityId = 'market-data:discovery',
  markets: Array<string> = ['*'],
  priority = 10,
  capabilityOverrides: Partial<PluginManifest['capabilities'][number]> = {},
): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    author: 'test',
    description: 'test plugin',
    capabilities: [
      {
        id: capId,
        singleton: true,
        markets,
        priority,
        streaming: false,
        ...capabilityOverrides,
      },
    ],
    config: {},
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

describe('PluginManager', () => {
  let manager: PluginManager

  beforeEach(() => {
    manager = new PluginManager({
      market: 'okx',
      pair: 'BTC-USDT',
      timeframe: '1h',
      mode: 'paper',
    })
  })

  // -------------------------------------------------------------------------
  // Context management
  // -------------------------------------------------------------------------

  describe('context management', () => {
    it('returns a copy of the initial context', () => {
      const ctx = manager.getContext()
      expect(ctx.market).toBe('okx')
      expect(ctx.pair).toBe('BTC-USDT')
      expect(ctx.mode).toBe('paper')
    })

    it('merges partial context updates', () => {
      manager.setContext({ pair: 'ETH-USDT' })
      const ctx = manager.getContext()
      expect(ctx.pair).toBe('ETH-USDT')
      expect(ctx.market).toBe('okx') // unchanged
    })

    it('getContext returns a snapshot, not a live reference', () => {
      const ctx1 = manager.getContext()
      manager.setContext({ pair: 'ETH-USDT' })
      expect(ctx1.pair).toBe('BTC-USDT') // original snapshot unchanged
    })
  })

  // -------------------------------------------------------------------------
  // Plugin lifecycle
  // -------------------------------------------------------------------------

  describe('installPlugin', () => {
    it('installs a plugin with status "installed"', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) => makeInstance(m))

      const plugins = manager.getInstalledPlugins()
      expect(plugins).toHaveLength(1)
      expect(plugins[0].manifest.id).toBe('plugin-a')
      expect(plugins[0].status).toBe('installed')
    })

    it('forces status to "installed" even if factory returns active', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, { status: 'active' }),
      )

      const plugin = manager.getInstalledPlugins()[0]
      expect(plugin.status).toBe('installed')
    })

    it('throws when installing a plugin with an already-registered id', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) => makeInstance(m))

      await expect(
        manager.installPlugin(manifest, (m) => makeInstance(m)),
      ).rejects.toThrow("Plugin 'plugin-a' is already installed")
    })
  })

  describe('activatePlugin', () => {
    it('activates an installed plugin with the provided config', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) => makeInstance(m))
      await manager.activatePlugin('plugin-a', { apiKey: 'secret' })

      const active = manager.getActivePlugins()
      expect(active).toHaveLength(1)
      expect(active[0].status).toBe('active')
      expect(active[0].config).toEqual({ apiKey: 'secret' })
    })

    it('calls initialize with config when provided', async () => {
      const initSpy = mock(
        async (_config: Record<string, unknown>) => undefined,
      )
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, { initialize: initSpy }),
      )
      await manager.activatePlugin('plugin-a', { apiKey: 'secret' })

      expect(initSpy).toHaveBeenCalledTimes(1)
      expect(initSpy).toHaveBeenCalledWith({ apiKey: 'secret' })
    })

    it('throws when activating a non-existent plugin', async () => {
      await expect(manager.activatePlugin('ghost', {})).rejects.toThrow(
        "Plugin 'ghost' is not installed",
      )
    })
  })

  describe('deactivatePlugin', () => {
    it('sets status to "disabled"', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) => makeInstance(m))
      await manager.activatePlugin('plugin-a', {})
      await manager.deactivatePlugin('plugin-a')

      const plugins = manager.getInstalledPlugins()
      expect(plugins[0].status).toBe('disabled')
    })

    it('calls destroy when present', async () => {
      const destroySpy = mock(async () => undefined)
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, { destroy: destroySpy }),
      )
      await manager.activatePlugin('plugin-a', {})
      await manager.deactivatePlugin('plugin-a')

      expect(destroySpy).toHaveBeenCalledTimes(1)
    })

    it('throws when deactivating a non-existent plugin', async () => {
      await expect(manager.deactivatePlugin('ghost')).rejects.toThrow(
        "Plugin 'ghost' is not installed",
      )
    })
  })

  describe('uninstallPlugin', () => {
    it('removes the plugin from the registry', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) => makeInstance(m))
      await manager.uninstallPlugin('plugin-a')

      expect(manager.getInstalledPlugins()).toHaveLength(0)
    })

    it('calls destroy when plugin is active', async () => {
      const destroySpy = mock(async () => undefined)
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, { destroy: destroySpy }),
      )
      await manager.activatePlugin('plugin-a', {})
      await manager.uninstallPlugin('plugin-a')

      expect(destroySpy).toHaveBeenCalledTimes(1)
    })

    it('does not call destroy when plugin is not active', async () => {
      const destroySpy = mock(async () => undefined)
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, { destroy: destroySpy }),
      )
      // Never activated — status is 'installed'
      await manager.uninstallPlugin('plugin-a')

      expect(destroySpy).not.toHaveBeenCalled()
    })

    it('throws when uninstalling a non-existent plugin', async () => {
      await expect(manager.uninstallPlugin('ghost')).rejects.toThrow(
        "Plugin 'ghost' is not installed",
      )
    })
  })

  // -------------------------------------------------------------------------
  // execute with fallback chain
  // -------------------------------------------------------------------------

  describe('execute', () => {
    it('executes the highest-priority active plugin', async () => {
      const manifest = makeManifest(
        'plugin-a',
        'market-data:discovery',
        ['*'],
        10,
      )
      await manager.installPlugin(manifest, (m) => makeInstance(m))
      await manager.activatePlugin('plugin-a', {})

      const result = await manager.execute('market-data:discovery', {})
      expect(result).toEqual({ source: 'plugin-a' })
    })

    it('throws when no active plugin exists for the capability', async () => {
      await expect(
        manager.execute('market-data:discovery', {}),
      ).rejects.toThrow(
        "No active plugin found for capability 'market-data:discovery'",
      )
    })

    it('falls back to secondary plugin when primary throws', async () => {
      const manifestA = makeManifest(
        'plugin-a',
        'market-data:discovery',
        ['*'],
        5,
      )
      const manifestB = makeManifest(
        'plugin-b',
        'market-data:discovery',
        ['*'],
        20,
      )

      await manager.installPlugin(manifestA, (m) =>
        makeInstance(m, {
          execute: async () => {
            throw new Error('primary failure')
          },
        }),
      )
      await manager.installPlugin(manifestB, (m) => makeInstance(m))

      await manager.activatePlugin('plugin-a', {})
      await manager.activatePlugin('plugin-b', {})

      const result = await manager.execute('market-data:discovery', {})
      expect(result).toEqual({ source: 'plugin-b' })
    })

    it('exhausts all candidates and throws when all fail', async () => {
      const makeFailingInstance = (m: PluginManifest): PluginInstance =>
        makeInstance(m, {
          execute: async () => {
            throw new Error('always fails')
          },
        })

      const mA = makeManifest('plugin-a', 'market-data:discovery', ['*'], 5)
      const mB = makeManifest('plugin-b', 'market-data:discovery', ['*'], 20)

      await manager.installPlugin(mA, makeFailingInstance)
      await manager.installPlugin(mB, makeFailingInstance)
      await manager.activatePlugin('plugin-a', {})
      await manager.activatePlugin('plugin-b', {})

      await expect(
        manager.execute('market-data:discovery', {}),
      ).rejects.toThrow('All candidates for capability')
    })

    it("does NOT fail over for 'trading:orders' and rethrows the original error", async () => {
      const fallbackExecute = mock(async () => ({ source: 'plugin-b' }))
      const mA = makeManifest('plugin-a', 'trading:orders', ['*'], 5)
      const mB = makeManifest('plugin-b', 'trading:orders', ['*'], 20)

      await manager.installPlugin(mA, (m) =>
        makeInstance(m, {
          execute: async () => {
            throw new Error('order placement timed out')
          },
        }),
      )
      await manager.installPlugin(mB, (m) =>
        makeInstance(m, { execute: fallbackExecute }),
      )
      await manager.activatePlugin('plugin-a', {})
      await manager.activatePlugin('plugin-b', {})

      await expect(manager.execute('trading:orders', {})).rejects.toThrow(
        'order placement timed out',
      )
      expect(fallbackExecute).not.toHaveBeenCalled()
    })

    it("executes the primary plugin normally for 'trading:orders' when it succeeds", async () => {
      const mA = makeManifest('plugin-a', 'trading:orders', ['*'], 5)
      await manager.installPlugin(mA, (m) => makeInstance(m))
      await manager.activatePlugin('plugin-a', {})

      const result = await manager.execute('trading:orders', {})
      expect(result).toEqual({ source: 'plugin-a' })
    })

    it('does NOT fail over for a capability declared with sideEffect: true', async () => {
      const fallbackExecute = mock(async () => ({ source: 'plugin-b' }))
      const mA = makeManifest('plugin-a', 'notification:channel', ['*'], 5, {
        sideEffect: true,
      })
      const mB = makeManifest('plugin-b', 'notification:channel', ['*'], 20)

      await manager.installPlugin(mA, (m) =>
        makeInstance(m, {
          execute: async () => {
            throw new Error('notification send failed')
          },
        }),
      )
      await manager.installPlugin(mB, (m) =>
        makeInstance(m, { execute: fallbackExecute }),
      )
      await manager.activatePlugin('plugin-a', {})
      await manager.activatePlugin('plugin-b', {})

      await expect(manager.execute('notification:channel', {})).rejects.toThrow(
        'notification send failed',
      )
      expect(fallbackExecute).not.toHaveBeenCalled()
    })

    it('still fails over for a read capability not marked sideEffect', async () => {
      const mA = makeManifest('plugin-a', 'market-data:history', ['*'], 5)
      const mB = makeManifest('plugin-b', 'market-data:history', ['*'], 20)

      await manager.installPlugin(mA, (m) =>
        makeInstance(m, {
          execute: async () => {
            throw new Error('primary failure')
          },
        }),
      )
      await manager.installPlugin(mB, (m) => makeInstance(m))
      await manager.activatePlugin('plugin-a', {})
      await manager.activatePlugin('plugin-b', {})

      const result = await manager.execute('market-data:history', {})
      expect(result).toEqual({ source: 'plugin-b' })
    })

    it('passes the current context to the execute call', async () => {
      let capturedContext: unknown = null
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, {
          execute: async (p) => {
            capturedContext = p.context
            return {}
          },
        }),
      )
      await manager.activatePlugin('plugin-a', {})

      manager.setContext({ pair: 'ETH-USDT' })
      await manager.execute('market-data:discovery', {})

      expect((capturedContext as { pair: string }).pair).toBe('ETH-USDT')
    })
  })

  // -------------------------------------------------------------------------
  // Context-driven re-resolution
  // -------------------------------------------------------------------------

  describe('context-driven re-resolution', () => {
    it('re-resolves to a different plugin when market context changes', async () => {
      // plugin-okx only handles okx, plugin-binance only handles binance
      const mOkx = makeManifest(
        'plugin-okx',
        'market-data:discovery',
        ['okx'],
        10,
      )
      const mBinance = makeManifest(
        'plugin-binance',
        'market-data:discovery',
        ['binance'],
        10,
      )

      await manager.installPlugin(mOkx, (m) => makeInstance(m))
      await manager.installPlugin(mBinance, (m) => makeInstance(m))
      await manager.activatePlugin('plugin-okx', {})
      await manager.activatePlugin('plugin-binance', {})

      // manager was initialized with market: 'okx'
      const resultOkx = await manager.execute('market-data:discovery', {})
      expect((resultOkx as { source: string }).source).toBe('plugin-okx')

      // Switch market context
      manager.setContext({ market: 'binance' })
      const resultBinance = await manager.execute('market-data:discovery', {})
      expect((resultBinance as { source: string }).source).toBe(
        'plugin-binance',
      )
    })
  })

  // -------------------------------------------------------------------------
  // subscribe
  // -------------------------------------------------------------------------

  describe('subscribe', () => {
    it('calls subscribe on the resolved plugin and returns an unsubscribe fn', async () => {
      const unsubSpy = mock(() => undefined)
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, {
          subscribe: (_params, cb) => {
            cb({ tick: 1 })
            return unsubSpy
          },
        }),
      )
      await manager.activatePlugin('plugin-a', {})

      const received: Array<unknown> = []
      const unsub = manager.subscribe('market-data:discovery', {}, (data) => {
        received.push(data)
      })

      expect(received).toEqual([{ tick: 1 }])

      unsub()
      expect(unsubSpy).toHaveBeenCalledTimes(1)
    })

    it('falls back to a plugin with subscribe support when primary lacks it', async () => {
      const mA = makeManifest('plugin-a', 'market-data:discovery', ['*'], 5)
      const mB = makeManifest('plugin-b', 'market-data:discovery', ['*'], 20)

      // plugin-a has no subscribe
      await manager.installPlugin(mA, (m) =>
        makeInstance(m, { subscribe: undefined }),
      )
      await manager.installPlugin(mB, (m) =>
        makeInstance(m, {
          subscribe: (_params, cb) => {
            cb({ source: 'plugin-b' })
            return () => undefined
          },
        }),
      )
      await manager.activatePlugin('plugin-a', {})
      await manager.activatePlugin('plugin-b', {})

      const received: Array<unknown> = []
      manager.subscribe('market-data:discovery', {}, (data) =>
        received.push(data),
      )

      expect(received).toEqual([{ source: 'plugin-b' }])
    })

    it('throws when no active plugin supports streaming', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) =>
        makeInstance(m, { subscribe: undefined }),
      )
      await manager.activatePlugin('plugin-a', {})

      expect(() =>
        manager.subscribe('market-data:discovery', {}, () => undefined),
      ).toThrow('No active plugin with streaming support')
    })

    it('throws when no active plugin is found for the capability', () => {
      expect(() =>
        manager.subscribe('market-data:discovery', {}, () => undefined),
      ).toThrow("No active plugin found for capability 'market-data:discovery'")
    })
  })

  // -------------------------------------------------------------------------
  // getPluginForCapability
  // -------------------------------------------------------------------------

  describe('getPluginForCapability', () => {
    it('returns the primary plugin for the capability', async () => {
      const manifest = makeManifest('plugin-a')
      await manager.installPlugin(manifest, (m) => makeInstance(m))
      await manager.activatePlugin('plugin-a', {})

      const plugin = manager.getPluginForCapability('market-data:discovery')
      expect(plugin?.manifest.id).toBe('plugin-a')
    })

    it('returns null when no active plugin handles the capability', () => {
      const plugin = manager.getPluginForCapability('market-data:discovery')
      expect(plugin).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // User pins
  // -------------------------------------------------------------------------

  describe('pinPlugin / unpinPlugin', () => {
    it('pins a plugin so it wins over higher-priority alternatives', async () => {
      const mHigh = makeManifest('p-high', 'market-data:discovery', ['okx'], 5)
      const mLow = makeManifest('p-low', 'market-data:discovery', ['okx'], 50)

      await manager.installPlugin(mHigh, (m) => makeInstance(m))
      await manager.installPlugin(mLow, (m) => makeInstance(m))
      await manager.activatePlugin('p-high', {})
      await manager.activatePlugin('p-low', {})

      manager.pinPlugin('market-data:discovery', 'okx', 'p-low')

      const result = await manager.execute('market-data:discovery', {})
      expect((result as { source: string }).source).toBe('p-low')
    })

    it('restores priority resolution after unpinning', async () => {
      const mHigh = makeManifest('p-high', 'market-data:discovery', ['okx'], 5)
      const mLow = makeManifest('p-low', 'market-data:discovery', ['okx'], 50)

      await manager.installPlugin(mHigh, (m) => makeInstance(m))
      await manager.installPlugin(mLow, (m) => makeInstance(m))
      await manager.activatePlugin('p-high', {})
      await manager.activatePlugin('p-low', {})

      manager.pinPlugin('market-data:discovery', 'okx', 'p-low')
      manager.unpinPlugin('market-data:discovery', 'okx')

      const result = await manager.execute('market-data:discovery', {})
      expect((result as { source: string }).source).toBe('p-high')
    })

    it('keeps a pin across an uninstall/reinstall of the same plugin', async () => {
      // Uninstalling is also how a plugin gets *replaced* (re-importing a zip
      // under development). The manager must not treat that as the user
      // changing their mind: pin cleanup belongs to the terminal's uninstall
      // flow, which knows the difference.
      const mHigh = makeManifest('p-high', 'market-data:discovery', ['okx'], 5)
      const mLow = makeManifest('p-low', 'market-data:discovery', ['okx'], 50)

      await manager.installPlugin(mHigh, (m) => makeInstance(m))
      await manager.installPlugin(mLow, (m) => makeInstance(m))
      await manager.activatePlugin('p-high', {})
      await manager.activatePlugin('p-low', {})

      manager.pinPlugin('market-data:discovery', 'okx', 'p-low')
      await manager.uninstallPlugin('p-low')

      // The pin no longer resolves while the plugin is gone…
      const whileGone = await manager.execute('market-data:discovery', {})
      expect((whileGone as { source: string }).source).toBe('p-high')
      // …but it survives, so reinstalling restores the user's choice.
      expect(manager.isPinned('market-data:discovery', 'okx')).toBe('p-low')

      await manager.installPlugin(mLow, (m) => makeInstance(m))
      await manager.activatePlugin('p-low', {})
      const result = await manager.execute('market-data:discovery', {})
      expect((result as { source: string }).source).toBe('p-low')
    })
  })

  // -------------------------------------------------------------------------
  // Lifecycle listeners
  // -------------------------------------------------------------------------

  describe('Lifecycle listeners', () => {
    it('calls onActivated when a plugin is activated', async () => {
      const manifest = makeManifest('lc-test')
      const factory = () => makeInstance(manifest)
      await manager.installPlugin(manifest, factory)

      const onActivated = mock(() => {})
      manager.addLifecycleListener({ onActivated })

      await manager.activatePlugin('lc-test', {})

      expect(onActivated).toHaveBeenCalledTimes(1)
      const arg = onActivated.mock.calls[0]![0]
      expect(arg.manifest.id).toBe('lc-test')
      expect(arg.status).toBe('active')
    })

    it('calls onDeactivated when a plugin is deactivated', async () => {
      const manifest = makeManifest('lc-deact')
      const factory = () => makeInstance(manifest)
      await manager.installPlugin(manifest, factory)
      await manager.activatePlugin('lc-deact', {})

      const onDeactivated = mock(() => {})
      manager.addLifecycleListener({ onDeactivated })

      await manager.deactivatePlugin('lc-deact')

      expect(onDeactivated).toHaveBeenCalledTimes(1)
      expect(onDeactivated.mock.calls[0]![0]).toBe('lc-deact')
    })

    it('calls onUninstalled when a plugin is uninstalled', async () => {
      const manifest = makeManifest('lc-uninst')
      const factory = () => makeInstance(manifest)
      await manager.installPlugin(manifest, factory)

      const onUninstalled = mock(() => {})
      manager.addLifecycleListener({ onUninstalled })

      await manager.uninstallPlugin('lc-uninst')

      expect(onUninstalled).toHaveBeenCalledTimes(1)
      expect(onUninstalled.mock.calls[0]![0]).toBe('lc-uninst')
    })

    it('does not call removed listeners', async () => {
      const manifest = makeManifest('lc-remove')
      const factory = () => makeInstance(manifest)
      await manager.installPlugin(manifest, factory)

      const onActivated = mock(() => {})
      const listener = { onActivated }
      manager.addLifecycleListener(listener)
      manager.removeLifecycleListener(listener)

      await manager.activatePlugin('lc-remove', {})

      expect(onActivated).toHaveBeenCalledTimes(0)
    })

    it('notifies multiple listeners', async () => {
      const manifest = makeManifest('lc-multi')
      const factory = () => makeInstance(manifest)
      await manager.installPlugin(manifest, factory)

      const onActivated1 = mock(() => {})
      const onActivated2 = mock(() => {})
      manager.addLifecycleListener({ onActivated: onActivated1 })
      manager.addLifecycleListener({ onActivated: onActivated2 })

      await manager.activatePlugin('lc-multi', {})

      expect(onActivated1).toHaveBeenCalledTimes(1)
      expect(onActivated2).toHaveBeenCalledTimes(1)
    })

    it('calls onUninstalled for active plugins (destroy + uninstall)', async () => {
      const destroyFn = mock(async () => {})
      const manifest = makeManifest('lc-active-uninst')
      const factory = () => makeInstance(manifest, { destroy: destroyFn })
      await manager.installPlugin(manifest, factory)
      await manager.activatePlugin('lc-active-uninst', {})

      const onUninstalled = mock(() => {})
      manager.addLifecycleListener({ onUninstalled })

      await manager.uninstallPlugin('lc-active-uninst')

      expect(destroyFn).toHaveBeenCalledTimes(1)
      expect(onUninstalled).toHaveBeenCalledTimes(1)
    })
  })
})
