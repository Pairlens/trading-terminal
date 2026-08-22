// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The NFT panels are only reachable if three registries agree: the bootstrap
 * bundle carries the plugin, the pane registry keys its panels WITHOUT a plugin
 * prefix (so a saved layout that names `nft-book` resolves), and the
 * workspace-store analyzer knows who owns those pane types.
 *
 * Each of those is a separate hardcoded id list, which is exactly the shape of
 * thing that gets updated in two places out of three. The prediction family's
 * own test says the same thing about the same seams, and this is that test
 * applied to the newest class.
 *
 * The last two cases are about the class rather than the plugin: an asset class
 * that reaches Discovery without a board, or a board whose panes nobody owns,
 * is a tab that opens onto nothing.
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import { lazy } from 'react'

import { PANE_CATEGORY_DEFINITIONS } from '@pairlens/shared/pane-categories'
import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { NFT_WORKSPACES } from '@pairlens/plugins/pairlens-nfts/workspaces'
import { BOOTSTRAP_PLUGINS } from '../plugins/bootstrap-bundle'
import { DynamicPaneRegistry } from '../layout/pane-registry'
import { getPaneIcon } from '../layout/pane-icons'
import { paneMeta } from '../workspace-store/dependency-analysis'
import { DISCOVERY_SECTIONS } from '../layout/workspaces/discovery-sections'
import { ASSET_CLASS_VISUALS } from '../asset-class/visuals'

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

const NFTS = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === 'pairlens-nfts')

const PANEL_IDS = [
  'nft-chains',
  'nft-collections',
  'nft-overview',
  'nft-movers',
  'nft-mints',
  'nft-tape',
  'nft-collection-header',
  'nft-book',
  'nft-listings',
  'nft-offers',
  'nft-sales',
  'nft-items',
  'nft-traits',
  'nft-ticket',
  'nft-holdings',
]

describe('pairlens-nfts', () => {
  it('ships in the bootstrap bundle', () => {
    expect(NFTS).toBeDefined()
  })

  it('contributes exactly the NFT panels', () => {
    const panels = NFTS!.manifest.contributes?.panels ?? []
    expect(panels.map((p) => p.id).sort()).toEqual([...PANEL_IDS].sort())
  })

  it('is a panels-only plugin, with no capability to resolve against', () => {
    expect(NFTS!.manifest.capabilities).toEqual([])
  })

  it('declares the nfts family', () => {
    expect(NFTS!.manifest.metadata?.['family']).toBe('nfts')
  })

  it('names icons the allowlist actually carries', () => {
    for (const panel of NFTS!.manifest.contributes?.panels ?? []) {
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
      'pairlens-nfts',
      NFTS!.manifest.contributes?.panels ?? [],
      components,
    )

    for (const id of PANEL_IDS) {
      expect(registry.getDefinition(id), id).toBeTruthy()
      expect(registry.getPluginForPane(id)).toBe('pairlens-nfts')
      expect(registry.getDefinition(`pairlens-nfts:${id}`)).toBeNull()
    }
  })

  it('is recognised by the workspace-store dependency analyzer', () => {
    for (const id of PANEL_IDS) {
      expect(paneMeta(id)?.pluginId, id).toBe('pairlens-nfts')
    }
  })

  it('gates each panel on exactly what it structurally needs', () => {
    // The Discovery panes gate on nothing: rankings and the market tape are
    // readable before anything is connected, which is the whole point of the
    // keyless fallback. The board panes need a collection. Only the two that
    // sign or read a holder's own position need a wallet, because a ticket
    // with no key behind it and a holdings grid with no holder are both a
    // pane rendering someone else's market.
    const REQUIRES: Record<string, Array<string>> = {
      'nft-collection-header': ['workspace:active-pair'],
      'nft-book': ['workspace:active-pair'],
      'nft-listings': ['workspace:active-pair'],
      'nft-offers': ['workspace:active-pair'],
      'nft-sales': ['workspace:active-pair'],
      'nft-items': ['workspace:active-pair'],
      'nft-traits': ['workspace:active-pair'],
      'nft-ticket': ['workspace:active-pair', 'workspace:active-wallet'],
      'nft-holdings': ['workspace:active-pair', 'workspace:active-wallet'],
    }
    for (const panel of NFTS!.manifest.contributes?.panels ?? []) {
      expect(panel.requires ?? [], panel.id).toEqual(REQUIRES[panel.id] ?? [])
    }
  })

  it('files every panel under a real pane category', () => {
    const CATEGORIES = new Set(PANE_CATEGORY_DEFINITIONS.map((c) => c.id))
    for (const panel of NFTS!.manifest.contributes?.panels ?? []) {
      expect(CATEGORIES.has(panel.category), panel.id).toBe(true)
    }
  })

  it('builds every workspace out of panes that exist', () => {
    // A layout naming a pane nobody contributes is a hole in the board that
    // only shows up at runtime, on the one route that mounts that layout.
    const known = new Set(PANEL_IDS)
    for (const workspace of NFT_WORKSPACES) {
      for (const column of workspace.layout.columns) {
        for (const cell of column.cells) {
          for (const pane of cell.panes) {
            const owned = known.has(pane.type) || paneMeta(pane.type) !== null
            expect(owned, `${workspace.id} → ${pane.type}`).toBe(true)
          }
        }
      }
    }
  })

  it('gives every column set a full 100 percent of its axis', () => {
    for (const workspace of NFT_WORKSPACES) {
      const width = workspace.layout.columns.reduce(
        (sum, c) => sum + c.widthPercent,
        0,
      )
      expect(width, `${workspace.id} width`).toBe(100)
      for (const column of workspace.layout.columns) {
        const height = column.cells.reduce((sum, c) => sum + c.heightPercent, 0)
        expect(height, `${workspace.id} → ${column.id} height`).toBe(100)
      }
    }
  })
})

describe('the nft asset class', () => {
  it('is one of the instrument classes', () => {
    expect(INSTRUMENT_CLASSES).toContain('nft')
  })

  it('has a Discovery section pointing at a board the family ships', () => {
    const section = DISCOVERY_SECTIONS.find((s) => s.id === 'nft')
    expect(section).toBeDefined()
    expect(NFT_WORKSPACES.map((w) => w.id)).toContain(section!.templateId!)
  })

  it('has its own hue, distinct from every other class', () => {
    expect(ASSET_CLASS_VISUALS.nft).toBeDefined()
    const hues = Object.values(ASSET_CLASS_VISUALS).map((v) => v.text)
    expect(new Set(hues).size).toBe(hues.length)
  })
})

describe('NFT capability routing against the real bundle', () => {
  /**
   * The synthetic resolver test in plugin-system proves the mechanism. This
   * proves the SHIPPED manifests actually carry what the mechanism needs, which
   * is the half that rots: a connector losing its `metadata.assetClass` in a
   * refactor would put NFT orders back on a swap router with every unit test
   * still green.
   */
  const bundled = (id: string) =>
    BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === id)?.manifest

  it('stamps every venue that shares a chain id with another class', () => {
    for (const id of [
      'opensea-nft-connector',
      'coingecko-nft-provider',
      'ethereum-dex-connector',
      'base-dex-connector',
      'geckoterminal-data-provider',
    ]) {
      const manifest = bundled(id)
      expect(manifest, id).toBeDefined()
      expect(typeof manifest!.metadata?.['assetClass'], id).toBe('string')
    }
  })

  it('does not let a DEX venue answer for an NFT one', () => {
    expect(bundled('opensea-nft-connector')!.metadata?.['assetClass']).toBe(
      'nft',
    )
    expect(bundled('ethereum-dex-connector')!.metadata?.['assetClass']).toBe(
      'dex',
    )
  })

  it('declares the NFT data capability on a wildcard market', () => {
    // Chain-scoped here and the whole Discovery board resolves to nothing
    // whenever the chart happens to be sitting on a CEX pair, because the
    // manager resolves on the terminal's current venue rather than on the
    // chain the call names. The chains are declared in metadata instead.
    for (const id of ['opensea-nft-connector', 'coingecko-nft-provider']) {
      const manifest = bundled(id)!
      const nft = manifest.capabilities.find((c) => c.id === 'market-data:nft')
      expect(nft?.markets, id).toEqual(['*'])
      expect(Array.isArray(manifest.metadata?.['chains']), id).toBe(true)
    }
  })
})
