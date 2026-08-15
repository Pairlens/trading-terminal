// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The prediction panels are only reachable if three registries agree: the
 * bootstrap bundle carries the plugin, the pane registry keys its panels
 * WITHOUT a plugin prefix (so a saved layout that names `events` resolves),
 * and the workspace-store analyzer knows who owns those pane types.
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

const PREDICTIONS = BOOTSTRAP_PLUGINS.find(
  (p) => p.manifest.id === 'pairlens-predictions',
)

const PANEL_IDS = ['events', 'prediction-positions']

describe('pairlens-predictions', () => {
  it('ships in the bootstrap bundle', () => {
    expect(PREDICTIONS).toBeDefined()
  })

  it('contributes exactly the two prediction panels', () => {
    const panels = PREDICTIONS!.manifest.contributes?.panels ?? []
    expect(panels.map((p) => p.id).sort()).toEqual([...PANEL_IDS].sort())
  })

  it('is a panels-only plugin — no capability to resolve against', () => {
    expect(PREDICTIONS!.manifest.capabilities).toEqual([])
  })

  it('declares the predictions family', () => {
    expect(PREDICTIONS!.manifest.metadata?.['family']).toBe('predictions')
  })

  it('names icons the allowlist actually carries', () => {
    for (const panel of PREDICTIONS!.manifest.contributes?.panels ?? []) {
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
      'pairlens-predictions',
      PREDICTIONS!.manifest.contributes?.panels ?? [],
      components,
    )

    for (const id of PANEL_IDS) {
      expect(registry.getDefinition(id)).toBeTruthy()
      expect(registry.getPluginForPane(id)).toBe('pairlens-predictions')
      expect(registry.getDefinition(`pairlens-predictions:${id}`)).toBeNull()
    }
  })

  it('is recognised by the workspace-store dependency analyzer', () => {
    for (const id of PANEL_IDS) {
      expect(paneMeta(id)?.pluginId).toBe('pairlens-predictions')
    }
  })

  it('gates neither panel on a workspace variable', () => {
    // Kalshi trades from API keys and Polymarket from a wallet, so
    // 'workspace:active-wallet' would hide the positions pane from half the
    // family; the panes say what is missing themselves.
    for (const panel of PREDICTIONS!.manifest.contributes?.panels ?? []) {
      expect(panel.requires ?? []).toEqual([])
    }
  })
})
