// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The futures positions pane is only reachable if three registries agree: the
 * bootstrap bundle carries the plugin, the pane registry keys its panel
 * WITHOUT a plugin prefix (so a saved layout that names `futures-positions`
 * resolves), and the workspace-store analyzer knows who owns that pane type.
 *
 * Each of those is a separate hardcoded id list, which is exactly the shape of
 * thing that gets updated in two places out of three.
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import { lazy } from 'react'

import { BOOTSTRAP_PLUGINS } from '../plugins/bootstrap-bundle'
import { DynamicPaneRegistry } from '../layout/pane-registry'
import { getPaneIcon } from '../layout/pane-icons'
import { paneMeta } from '../workspace-store/dependency-analysis'

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

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
    new MemoryStorage()
})

const FUTURES = BOOTSTRAP_PLUGINS.find(
  (p) => p.manifest.id === 'pairlens-cex-futures',
)

const PANEL_IDS = ['futures-positions']

describe('pairlens-cex-futures', () => {
  it('ships in the bootstrap bundle', () => {
    expect(FUTURES).toBeDefined()
  })

  it('contributes exactly the futures positions panel', () => {
    const panels = FUTURES!.manifest.contributes?.panels ?? []
    expect(panels.map((p) => p.id)).toEqual(PANEL_IDS)
  })

  it('is a panels-only plugin — no capability to resolve against', () => {
    expect(FUTURES!.manifest.capabilities).toEqual([])
  })

  it('declares the futures family', () => {
    // Load-bearing for the deployment kill-switch: a deployment that drops
    // `cex-futures` must drop this pane with its venues, which is the reason
    // it does not live in pairlens-core.
    expect(FUTURES!.manifest.metadata?.['family']).toBe('cex-futures')
  })

  it('names icons the allowlist actually carries', () => {
    for (const panel of FUTURES!.manifest.contributes?.panels ?? []) {
      // getPaneIcon falls back to LayoutGrid for an unknown name, so the
      // assertion is that it does NOT fall back.
      expect(getPaneIcon(panel.icon)).not.toBe(getPaneIcon('NotAnIconName'))
    }
  })

  it('registers its pane under a bare key, like every other first-party plugin', () => {
    const registry = new DynamicPaneRegistry()
    const components = Object.fromEntries(
      PANEL_IDS.map((id) => [
        id,
        lazy(() => Promise.resolve({ default: () => null })),
      ]),
    )
    registry.registerPluginPanes(
      'pairlens-cex-futures',
      FUTURES!.manifest.contributes?.panels ?? [],
      components,
    )

    for (const id of PANEL_IDS) {
      expect(registry.getDefinition(id)).toBeTruthy()
      expect(registry.getPluginForPane(id)).toBe('pairlens-cex-futures')
      expect(registry.getDefinition(`pairlens-cex-futures:${id}`)).toBeNull()
    }
  })

  it('is recognised by the workspace-store dependency analyzer', () => {
    for (const id of PANEL_IDS) {
      expect(paneMeta(id)?.pluginId).toBe('pairlens-cex-futures')
    }
  })

  it('gates the panel on no workspace variable', () => {
    // A futures account is an API credential, not a workspace wallet, and the
    // pane lists positions across every connected venue — so there is no pair
    // or wallet it needs before it can say something useful.
    for (const panel of FUTURES!.manifest.contributes?.panels ?? []) {
      expect(panel.requires ?? []).toEqual([])
    }
  })
})
