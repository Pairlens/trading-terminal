// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it, mock } from 'bun:test'

/**
 * The stale-pin hole, closed at the site where it actually opens.
 *
 * The resolver deliberately keeps pins across `unregisterPlugin` (that call is
 * also how a plugin under development gets replaced by a fresh zip). What must
 * never happen is the App Server replaying a pin for a plugin this device
 * uninstalled: the resolver would report an override that cannot resolve, and
 * reinstalling the plugin later would silently bring the old routing back.
 */

const removePluginPin = mock(() => Promise.resolve(undefined))

void mock.module('@/lib/api', () => ({
  api: { removePluginPin },
}))

const { applyServerPins } = await import('../apply-pins')

type Pinned = { capability: string; market: string; pluginId: string }

function fakeManager(installedIds: Array<string>) {
  const pinned: Array<Pinned> = []
  const manager = {
    getInstalledPlugins: () => installedIds.map((id) => ({ manifest: { id } })),
    pinPlugin: (capability: string, market: string, pluginId: string) => {
      pinned.push({ capability, market, pluginId })
    },
  }
  return { manager: manager as never, pinned }
}

describe('applyServerPins', () => {
  it('applies pins whose plugin is installed here', () => {
    const { manager, pinned } = fakeManager(['gate-market-connector'])
    removePluginPin.mockClear()

    const applied = applyServerPins(manager, [
      {
        capability: 'market-data:candles',
        market: 'okx',
        pluginId: 'gate-market-connector',
      },
    ])

    expect(applied).toBe(1)
    expect(pinned).toEqual([
      {
        capability: 'market-data:candles',
        market: 'okx',
        pluginId: 'gate-market-connector',
      },
    ])
    expect(removePluginPin).not.toHaveBeenCalled()
  })

  it('skips and prunes a pin naming a plugin this device uninstalled', () => {
    const { manager, pinned } = fakeManager(['gate-market-connector'])
    removePluginPin.mockClear()

    const applied = applyServerPins(manager, [
      {
        capability: 'market-data:candles',
        market: 'okx',
        pluginId: 'kalshi-market-connector',
      },
    ])

    expect(applied).toBe(0)
    expect(pinned).toEqual([])
    // Pruned, not merely skipped: a skipped row comes back on every hydrate.
    expect(removePluginPin).toHaveBeenCalledWith('market-data:candles', 'okx')
  })

  it('does nothing at all for an empty pin list', () => {
    const { manager, pinned } = fakeManager([])
    removePluginPin.mockClear()

    expect(applyServerPins(manager, [])).toBe(0)
    expect(pinned).toEqual([])
    expect(removePluginPin).not.toHaveBeenCalled()
  })
})
