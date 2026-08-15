// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

/**
 * Bundled plugins are install units: uninstalling one leaves a tombstone,
 * installing it again reads the code straight out of the binary. The two
 * refusals pinned here are the ones that keep that loop honest — the core
 * plugin can never leave, and a family the deployment excluded can never
 * come back.
 */

import {
  BundledPluginUnavailableError,
  isReinstallableBundledPlugin,
  reinstallBundledPlugin,
} from '../bootstrap-reinstall'
import {
  IRREDUCIBLE_PLUGIN_ID,
  PluginUninstallRefusedError,
  canUninstallPlugin,
  uninstallPluginEverywhere,
} from '../uninstall-plugin'
import {
  findOfferableBundledManifest,
  listOfferableBundledManifests,
} from '../offerable-bundled'
import { resetExcludedPluginFamiliesCache } from '../plugin-families'
import { getLedgerEntry, seedBootstrap } from '../plugin-ledger'
import type { PluginManager } from '@pairlens/plugin-system'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}

/** Enough of a manager for the guard paths, which never reach the real one. */
function stubManager(): PluginManager {
  return {
    getInstalledPlugins: () => [],
    getUserPins: () => [],
  } as unknown as PluginManager
}

/** A manager that records the lifecycle calls instead of running plugin code. */
function recordingManager(options?: { activateThrows?: boolean }) {
  const installed: Array<string> = []
  const activated: Array<string> = []
  const manager = {
    getInstalledPlugins: () => [],
    getUserPins: () => [],
    installPlugin: async (manifest: { id: string }) => {
      installed.push(manifest.id)
    },
    activatePlugin: async (pluginId: string) => {
      activated.push(pluginId)
      if (options?.activateThrows) throw new Error('missing API key')
    },
  } as unknown as PluginManager
  return { manager, installed, activated }
}

type PersistedState = {
  pluginId: string
  enabled: boolean
  config: Record<string, unknown>
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
    new MemoryStorage()
  resetExcludedPluginFamiliesCache()
})

describe('uninstall guard', () => {
  it('refuses the irreducible core plugin', async () => {
    seedBootstrap([{ pluginId: IRREDUCIBLE_PLUGIN_ID, version: '1.0.0' }])
    expect(canUninstallPlugin(IRREDUCIBLE_PLUGIN_ID)).toBe(false)

    await expect(
      uninstallPluginEverywhere({
        manager: stubManager(),
        pluginId: IRREDUCIBLE_PLUGIN_ID,
      }),
    ).rejects.toBeInstanceOf(PluginUninstallRefusedError)

    // The ledger row is untouched: the refusal is total, not partial.
    const entry = getLedgerEntry(IRREDUCIBLE_PLUGIN_ID)
    expect(entry?.enabled).toBe(true)
    expect(entry?.tombstoned).toBeFalsy()
  })

  it('allows every other plugin id', () => {
    expect(canUninstallPlugin('kalshi-market-connector')).toBe(true)
    expect(canUninstallPlugin('some-third-party-plugin')).toBe(true)
  })
})

describe('bundled reinstall refusals', () => {
  it('refuses an id that does not ship with Pairlens', async () => {
    expect(isReinstallableBundledPlugin('acme-not-a-plugin')).toBe(false)
    const failure = reinstallBundledPlugin({
      manager: stubManager(),
      pluginId: 'acme-not-a-plugin',
    })
    await expect(failure).rejects.toBeInstanceOf(BundledPluginUnavailableError)
    await failure.catch((err: BundledPluginUnavailableError) => {
      expect(err.refusal).toBe('not-bundled')
    })
  })

  it('accepts a real bundled id on a default build', () => {
    expect(isReinstallableBundledPlugin('pairlens-cex-futures')).toBe(true)
  })

  it('refuses a family this deployment excluded', async () => {
    process.env['VITE_PAIRLENS_DISABLED_FAMILIES'] = 'cex-futures'
    resetExcludedPluginFamiliesCache()
    try {
      expect(isReinstallableBundledPlugin('pairlens-cex-futures')).toBe(false)
      const failure = reinstallBundledPlugin({
        manager: stubManager(),
        pluginId: 'pairlens-cex-futures',
      })
      await expect(failure).rejects.toBeInstanceOf(
        BundledPluginUnavailableError,
      )
      await failure.catch((err: BundledPluginUnavailableError) => {
        expect(err.refusal).toBe('family-excluded')
      })
      // A spot venue in a family that is still shipped stays reinstallable.
      expect(isReinstallableBundledPlugin('binance-market-connector')).toBe(
        true,
      )
      // The Store's offer list agrees with the guard — one seam, so a card can
      // never advertise an install the reinstall path is going to refuse.
      const offered = listOfferableBundledManifests().map((m) => m.id)
      expect(offered).not.toContain('pairlens-cex-futures')
      expect(offered).toContain('binance-market-connector')
      expect(findOfferableBundledManifest('pairlens-cex-futures')).toBeNull()
    } finally {
      delete process.env['VITE_PAIRLENS_DISABLED_FAMILIES']
      resetExcludedPluginFamiliesCache()
    }
  })

  it('skips the ids already installed when listing what it can offer', () => {
    const offered = listOfferableBundledManifests({
      excludeIds: new Set(['binance-market-connector']),
    }).map((m) => m.id)
    expect(offered).not.toContain('binance-market-connector')
    expect(offered).toContain('pairlens-cex-futures')
  })
})

describe('bundled reinstall state', () => {
  const PLUGIN_ID = 'pairlens-cex-futures'

  it('reports installed-but-disabled everywhere when activation throws', async () => {
    seedBootstrap([{ pluginId: PLUGIN_ID, version: '1.0.0' }])
    const { manager, installed, activated } = recordingManager({
      activateThrows: true,
    })
    const persisted: Array<PersistedState> = []

    await expect(
      reinstallBundledPlugin({
        manager,
        pluginId: PLUGIN_ID,
        persistState: (data) => persisted.push(data),
      }),
    ).rejects.toThrow('missing API key')

    expect(installed).toEqual([PLUGIN_ID])
    expect(activated).toEqual([PLUGIN_ID])
    // The code IS installed; only the run failed. Local and server state say
    // the same thing, so a second signed-in device does not start it either.
    expect(getLedgerEntry(PLUGIN_ID)?.enabled).toBe(false)
    expect(getLedgerEntry(PLUGIN_ID)?.tombstoned).toBe(false)
    expect(persisted).toEqual([
      { pluginId: PLUGIN_ID, enabled: false, config: {} },
    ])
  })

  it('installs without starting when the caller still needs config', async () => {
    seedBootstrap([{ pluginId: PLUGIN_ID, version: '1.0.0' }])
    const { manager, installed, activated } = recordingManager()
    const persisted: Array<PersistedState> = []

    const manifest = await reinstallBundledPlugin({
      manager,
      pluginId: PLUGIN_ID,
      activate: false,
      persistState: (data) => persisted.push(data),
    })

    expect(manifest.id).toBe(PLUGIN_ID)
    expect(installed).toEqual([PLUGIN_ID])
    expect(activated).toEqual([])
    expect(getLedgerEntry(PLUGIN_ID)?.enabled).toBe(false)
    expect(getLedgerEntry(PLUGIN_ID)?.tombstoned).toBe(false)
    expect(persisted).toEqual([
      { pluginId: PLUGIN_ID, enabled: false, config: {} },
    ])
  })
})
