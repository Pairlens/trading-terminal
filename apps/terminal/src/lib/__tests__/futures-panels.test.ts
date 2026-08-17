// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The futures panes are only reachable if three registries agree: the
 * bootstrap bundle carries the plugin, the pane registry keys its panels
 * WITHOUT a plugin prefix (so a saved layout that names `futures-positions`
 * resolves), and the workspace-store analyzer knows who owns those pane types.
 *
 * Each of those is a separate hardcoded id list, which is exactly the shape of
 * thing that gets updated in two places out of three.
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import { lazy } from 'react'

import { PANE_CATEGORY_DEFINITIONS } from '@pairlens/shared/pane-categories'
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

const PANEL_IDS = [
  'futures-positions',
  'funding-matrix',
  'basis-monitor',
  'open-interest',
  'funding-extremes',
  'funding-belt',
  'liquidation-map',
  'margin-health',
  'risk-controls',
]

describe('pairlens-cex-futures', () => {
  it('ships in the bootstrap bundle', () => {
    expect(FUTURES).toBeDefined()
  })

  it('contributes exactly the futures panels', () => {
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

  it('registers its panes under bare keys, like every other first-party plugin', () => {
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

  it('gates each panel on exactly what it structurally needs', () => {
    // A futures account is an API credential, not a workspace wallet, and the
    // positions pane lists positions across every connected venue — so there
    // is no pair or wallet it needs before it can say something useful. The
    // scanners are cross-venue too. Only the per-pair and per-account panes
    // declare a requirement.
    const REQUIRES: Record<string, Array<string>> = {
      'funding-belt': ['workspace:active-pair'],
      'liquidation-map': ['workspace:active-pair'],
      'margin-health': ['workspace:active-wallet'],
    }
    for (const panel of FUTURES!.manifest.contributes?.panels ?? []) {
      expect(panel.requires ?? [], panel.id).toEqual(REQUIRES[panel.id] ?? [])
    }
  })

  it('files every panel under a real pane category', () => {
    const CATEGORIES = new Set(PANE_CATEGORY_DEFINITIONS.map((c) => c.id))
    for (const panel of FUTURES!.manifest.contributes?.panels ?? []) {
      expect(CATEGORIES.has(panel.category), panel.id).toBe(true)
    }
  })
})
