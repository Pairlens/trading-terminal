// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The on-chain panes are only reachable if three registries agree: the
 * bootstrap bundle carries the plugin, the pane registry keys its panels
 * WITHOUT a plugin prefix (so a saved layout that names `pool-stats`
 * resolves), and the workspace-store analyzer knows who owns those pane types.
 *
 * Each of those is a separate hardcoded id list, which is exactly the shape of
 * thing that gets updated in two places out of three. `pairlens-dex` is the
 * newest way to get it wrong: it shipped as a presets-only plugin, so it was
 * deliberately OUTSIDE the bare-key allowlist until it grew panes of its own.
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

const DEX = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === 'pairlens-dex')

const PANEL_IDS = [
  'chains',
  'pool-map',
  'liquidity-flow',
  'pool-detail',
  'pool-stats',
  'onchain-trades',
  'route',
  'fee-accrual',
  'lp-position',
  'manage-liquidity',
  'chain-ladder',
  'route-bridge',
  'in-flight',
]

describe('pairlens-dex', () => {
  it('ships in the bootstrap bundle', () => {
    expect(DEX).toBeDefined()
  })

  it('contributes exactly the on-chain panels', () => {
    const panels = DEX!.manifest.contributes?.panels ?? []
    expect(panels.map((p) => p.id)).toEqual(PANEL_IDS)
  })

  it('is a panels-and-presets plugin — no capability to resolve against', () => {
    expect(DEX!.manifest.capabilities).toEqual([])
    expect(DEX!.manifest.contributes?.workspaces?.length).toBeGreaterThan(0)
  })

  it('declares the dex family', () => {
    // Load-bearing for the deployment kill-switch: a deployment that drops
    // `dex` must drop these panes with its connectors, which is the reason
    // they do not live in pairlens-core.
    expect(DEX!.manifest.metadata?.['family']).toBe('dex')
  })

  it('names icons the allowlist actually carries', () => {
    for (const panel of DEX!.manifest.contributes?.panels ?? []) {
      // getPaneIcon falls back to LayoutGrid for an unknown name, so the
      // assertion is that it does NOT fall back.
      expect(getPaneIcon(panel.icon), panel.id).not.toBe(
        getPaneIcon('NotAnIconName'),
      )
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
      'pairlens-dex',
      DEX!.manifest.contributes?.panels ?? [],
      components,
    )

    for (const id of PANEL_IDS) {
      expect(registry.getDefinition(id), id).toBeTruthy()
      expect(registry.getPluginForPane(id)).toBe('pairlens-dex')
      expect(registry.getDefinition(`pairlens-dex:${id}`)).toBeNull()
    }
  })

  it('is recognised by the workspace-store dependency analyzer', () => {
    for (const id of PANEL_IDS) {
      expect(paneMeta(id)?.pluginId, id).toBe('pairlens-dex')
    }
  })

  it('gates each panel on exactly what it structurally needs', () => {
    // Discovery panes browse chains and pools with nothing connected. The
    // pool panes need a pair. The LP and bridge panes read a wallet's own
    // position, so an account is what decides whether there is anything at
    // all to draw.
    const PAIR = 'workspace:active-pair'
    const WALLET = 'workspace:active-wallet'
    const REQUIRES: Record<string, Array<string>> = {
      'pool-stats': [PAIR],
      'onchain-trades': [PAIR],
      route: [PAIR],
      'chain-ladder': [PAIR],
      'fee-accrual': [PAIR, WALLET],
      'lp-position': [PAIR, WALLET],
      'manage-liquidity': [PAIR, WALLET],
      'route-bridge': [PAIR, WALLET],
      'in-flight': [WALLET],
    }
    for (const panel of DEX!.manifest.contributes?.panels ?? []) {
      expect(panel.requires ?? [], panel.id).toEqual(REQUIRES[panel.id] ?? [])
    }
  })

  it('files every panel under a real pane category', () => {
    const CATEGORIES = new Set(PANE_CATEGORY_DEFINITIONS.map((c) => c.id))
    for (const panel of DEX!.manifest.contributes?.panels ?? []) {
      expect(CATEGORIES.has(panel.category), panel.id).toBe(true)
    }
  })
})
