// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The memecoin panes are only reachable if three registries agree: the
 * bootstrap bundle carries the plugin, the pane registry keys its panels
 * WITHOUT a plugin prefix (so a saved layout that names `meme-new` resolves),
 * and the workspace-store analyzer knows who owns those pane types.
 *
 * Same shape as `dex-panels.test.ts`, and for the same reason: each of those
 * is a separate hardcoded id list, which is exactly the kind of thing that
 * gets updated in two places out of three.
 *
 * This file also pins the second half of the family, `memecoin-data-provider`.
 * The panes and the feed are deliberately separate plugins so a paid feed can
 * replace the keyless one, and the thing that makes that swap possible is the
 * capability declaration — which is therefore asserted rather than assumed.
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

const MEMES = BOOTSTRAP_PLUGINS.find(
  (p) => p.manifest.id === 'pairlens-memecoins',
)
const FEED = BOOTSTRAP_PLUGINS.find(
  (p) => p.manifest.id === 'memecoin-data-provider',
)

const PANEL_IDS = [
  'meme-new',
  'meme-graduating',
  'meme-graduated',
  'meme-legendary',
  'meme-token-stats',
  'meme-flow',
  'meme-safety',
]

describe('pairlens-memecoins', () => {
  it('ships in the bootstrap bundle', () => {
    expect(MEMES).toBeDefined()
  })

  it('contributes exactly the launchpad panels', () => {
    const panels = MEMES!.manifest.contributes?.panels ?? []
    expect(panels.map((p) => p.id)).toEqual(PANEL_IDS)
  })

  it('is a panels-and-presets plugin — no capability to resolve against', () => {
    expect(MEMES!.manifest.capabilities).toEqual([])
    expect(MEMES!.manifest.contributes?.workspaces?.length).toBeGreaterThan(0)
  })

  it('declares the memes family', () => {
    // Load-bearing for the deployment kill-switch: a venue that cannot list
    // launchpad tokens drops `memes` and loses the board, the Discovery tab
    // and the store entries in one move.
    expect(MEMES!.manifest.metadata?.['family']).toBe('memes')
  })

  it('names icons the allowlist actually carries', () => {
    for (const panel of MEMES!.manifest.contributes?.panels ?? []) {
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
      'pairlens-memecoins',
      MEMES!.manifest.contributes?.panels ?? [],
      components,
    )

    for (const id of PANEL_IDS) {
      expect(registry.getDefinition(id), id).toBeTruthy()
      expect(registry.getPluginForPane(id)).toBe('pairlens-memecoins')
      expect(registry.getDefinition(`pairlens-memecoins:${id}`)).toBeNull()
    }
  })

  it('is recognised by the workspace-store dependency analyzer', () => {
    for (const id of PANEL_IDS) {
      expect(paneMeta(id)?.pluginId, id).toBe('pairlens-memecoins')
    }
  })

  it('gates each panel on exactly what it structurally needs', () => {
    // The four columns browse with nothing bound — that is what a discovery
    // column IS. The three trade-board panes read one token, so they need a
    // pair. None of them needs a wallet: they publish figures, never a
    // position.
    const PAIR = 'workspace:active-pair'
    const REQUIRES: Record<string, Array<string>> = {
      'meme-token-stats': [PAIR],
      'meme-flow': [PAIR],
      'meme-safety': [PAIR],
    }
    for (const panel of MEMES!.manifest.contributes?.panels ?? []) {
      expect(panel.requires ?? [], panel.id).toEqual(REQUIRES[panel.id] ?? [])
    }
  })

  it('files every panel under a real pane category', () => {
    const CATEGORIES = new Set(PANE_CATEGORY_DEFINITIONS.map((c) => c.id))
    for (const panel of MEMES!.manifest.contributes?.panels ?? []) {
      expect(CATEGORIES.has(panel.category), panel.id).toBe(true)
    }
  })

  it('keeps the four columns singleton and the trade panes not', () => {
    // A board with two New Mints columns is a mistake, never an arrangement.
    // A trade pane, on the other hand, is legitimately duplicated across a
    // multi-token board, so it must NOT be a singleton.
    const bySingleton = Object.fromEntries(
      (MEMES!.manifest.contributes?.panels ?? []).map((p) => [
        p.id,
        p.singleton === true,
      ]),
    )
    expect(bySingleton['meme-new']).toBe(true)
    expect(bySingleton['meme-graduating']).toBe(true)
    expect(bySingleton['meme-graduated']).toBe(true)
    expect(bySingleton['meme-legendary']).toBe(true)
    expect(bySingleton['meme-token-stats']).toBe(false)
    expect(bySingleton['meme-flow']).toBe(false)
    expect(bySingleton['meme-safety']).toBe(false)
  })
})

describe('memecoin-data-provider', () => {
  it('ships in the bootstrap bundle', () => {
    expect(FEED).toBeDefined()
  })

  it('serves the launchpad capability for every market', () => {
    expect(FEED!.manifest.capabilities).toEqual([
      {
        id: 'market-data:launchpad',
        singleton: false,
        markets: ['*'],
        priority: 5,
        streaming: false,
      },
    ])
  })

  it('leaves room for a paid feed to outrank it', () => {
    // The whole reason the feed is its own plugin. A bring-your-own-key
    // provider declaring a LOWER priority number wins resolution and serves
    // the same rows, with no pane changing. Pinning this at 5 rather than 0
    // is what keeps that door open.
    const declared = FEED!.manifest.capabilities?.[0]
    expect(declared?.priority).toBeGreaterThan(0)
  })

  it('belongs to the memes family, not to dex', () => {
    // Dropping the DEX family must not take the memecoin board's data with it.
    expect(FEED!.manifest.metadata?.['family']).toBe('memes')
  })

  it('declares no panels — the panes live with the family plugin', () => {
    expect(FEED!.manifest.contributes?.panels ?? []).toEqual([])
  })
})
