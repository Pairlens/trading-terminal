// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Plugin-contributed workspaces: the mapping, the sanitization, and the one
 * behaviour the whole feature exists for — disabling a family takes its
 * layouts out of the store, the workspaces menu and Discovery with it.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  WorkspaceTemplateRegistry,
  contributedToTemplate,
} from '../workspace-template-registry'
import { BUILTIN_WORKSPACE_TEMPLATES, mergeRoutePresets } from '../catalog'
import {
  analyzeTemplateDependencies,
  collectPaneTypes,
  paneMeta,
} from '../dependency-analysis'
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'
import type { WorkspaceTemplate } from '../types'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'
import { FIRST_PARTY_PLUGIN_IDS } from '@/lib/layout/pane-registry'
import { WORKSPACE_ICONS } from '@/components/workspace/workspace-icons'

// In-memory localStorage shim — the analyzer reads the plugin ledger (trust).
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

const FAMILY_PLUGIN_IDS = [
  'pairlens-cex-futures',
  'pairlens-predictions',
  'pairlens-dex',
  'pairlens-equities',
] as const

function pluginFor(id: string) {
  const plugin = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === id)
  if (!plugin) throw new Error(`no bootstrap plugin ${id}`)
  return plugin
}

function templatesOf(id: string): Array<WorkspaceTemplate> {
  const { manifest } = pluginFor(id)
  return (manifest.contributes?.workspaces ?? []).flatMap((entry) => {
    const t = contributedToTemplate(entry, {
      pluginId: manifest.id,
      author: manifest.author,
      trusted: true,
    })
    return t ? [t] : []
  })
}

const MINIMAL_LAYOUT: ContributedWorkspaceLayout = {
  version: 1,
  columns: [
    {
      id: 'c0',
      widthPercent: 100,
      cells: [
        {
          id: 'e0',
          heightPercent: 100,
          panes: [{ id: 'p0', type: 'chart' }],
        },
      ],
    },
  ],
}

describe('family plugins ship panes and presets, never a runtime', () => {
  const FAMILY_OF: Record<string, string> = {
    'pairlens-cex-futures': 'cex-futures',
    'pairlens-predictions': 'predictions',
    'pairlens-dex': 'dex',
    'pairlens-equities': 'equities',
  }

  for (const id of FAMILY_PLUGIN_IDS) {
    it(`${id} ships in the bootstrap bundle, stamped with its family`, () => {
      const { manifest } = pluginFor(id)
      expect(manifest.metadata?.['family']).toBe(FAMILY_OF[id])
      expect(manifest.capabilities).toEqual([])
    })

    it(`${id} contributes panels and workspaces, and nothing else`, () => {
      const contributes = pluginFor(id).manifest.contributes ?? {}
      expect(contributes.workspaces?.length).toBeGreaterThan(0)
      expect(contributes.panels?.length).toBeGreaterThan(0)
      // Its panes are named bare by its own layouts, exactly as a saved
      // layout names them, so it has to be in the allowlist.
      expect(FIRST_PARTY_PLUGIN_IDS.has(id)).toBe(true)
    })
  }
})

describe('bundled family workspaces', () => {
  it('every asset-class family ships its own presets', () => {
    for (const id of FAMILY_PLUGIN_IDS) {
      expect(templatesOf(id).length, id).toBeGreaterThan(0)
    }
  })

  for (const id of FAMILY_PLUGIN_IDS) {
    describe(id, () => {
      for (const tpl of templatesOf(id)) {
        describe(tpl.id, () => {
          it('uses an icon from WORKSPACE_ICONS', () => {
            expect(Object.keys(WORKSPACE_ICONS)).toContain(tpl.icon)
          })

          it('every pane resolves to a known plugin panel', () => {
            for (const type of collectPaneTypes(tpl.layout)) {
              expect(paneMeta(type), `pane "${type}"`).not.toBeNull()
            }
          })

          it('has unique column/cell/pane ids', () => {
            const ids: Array<string> = []
            for (const col of tpl.layout.columns) {
              ids.push(col.id)
              for (const cell of col.cells) {
                ids.push(cell.id)
                for (const pane of cell.panes) ids.push(pane.id)
              }
            }
            expect(new Set(ids).size).toBe(ids.length)
          })

          it('column widths and cell heights each sum to ~100', () => {
            const widthSum = tpl.layout.columns.reduce(
              (s, c) => s + c.widthPercent,
              0,
            )
            expect(Math.abs(widthSum - 100)).toBeLessThanOrEqual(1)
            for (const col of tpl.layout.columns) {
              const heightSum = col.cells.reduce(
                (s, c) => s + c.heightPercent,
                0,
              )
              expect(Math.abs(heightSum - 100)).toBeLessThanOrEqual(1)
            }
          })

          it('is authored by the plugin and marked built-in', () => {
            expect(tpl.author).toBe(pluginFor(id).manifest.author)
            expect(tpl.origin).toBe('builtin')
          })
        })
      }
    })
  }

  it('derives variables from the panes, seeded by the declared market', () => {
    const perps = templatesOf('pairlens-cex-futures').find(
      (t) => t.id === 'template:perps-terminal',
    )!
    expect(
      perps.variables.find((v) => v.type === 'pair')?.defaultValue,
    ).toEqual({ pairKey: 'BTC-USDT-USDT', market: 'binance-futures' })
    // A prediction contract expires, so its default market is deliberately
    // absent rather than pointing at an outcome that settles next month.
    const prediction = templatesOf('pairlens-predictions').find(
      (t) => t.id === 'template:prediction-terminal',
    )!
    const pairVar = prediction.variables.find((v) => v.type === 'pair')
    expect(pairVar).toBeDefined()
    expect(pairVar?.defaultValue).toBeUndefined()
  })

  it('keeps the equities requirement the store surfaces', () => {
    const desk = templatesOf('pairlens-equities').find(
      (t) => t.id === 'template:equities-desk',
    )!
    const report = analyzeTemplateDependencies(desk, [])
    expect(report.plugins.map((p) => p.pluginId)).toContain(
      'alpaca-market-connector',
    )
  })

  it('ships a Discovery board for prediction markets', () => {
    const board = templatesOf('pairlens-predictions').find(
      (t) => t.id === 'template:prediction-discovery',
    )
    expect(board).toBeDefined()
    expect(board!.context).toBe('discovery')
    expect(board!.routeMenu).toBe(true)
    // The event board is the point of this board, and it must dominate it.
    const events = board!.layout.columns.find((c) =>
      c.cells.some((cell) => cell.panes.some((p) => p.type === 'event-board')),
    )
    expect(events).toBeDefined()
    expect(events!.widthPercent).toBeGreaterThanOrEqual(50)
  })
})

describe('WorkspaceTemplateRegistry', () => {
  it('adds and removes a plugin cleanly, bumping the version each time', () => {
    const registry = new WorkspaceTemplateRegistry()
    const seen: Array<number> = []
    registry.subscribe(() => seen.push(registry.getSnapshot()))

    expect(registry.getTemplates()).toEqual([])
    registry.register(
      pluginFor('pairlens-predictions').manifest.contributes!.workspaces,
      { pluginId: 'pairlens-predictions', author: 'Pairlens', trusted: true },
    )
    expect(registry.getTemplates().map((t) => t.id)).toEqual([
      'template:prediction-terminal',
      'template:prediction-discovery',
      'template:prediction-crypto-updown',
      'template:prediction-race',
    ])

    registry.unregister('pairlens-predictions')
    expect(registry.getTemplates()).toEqual([])
    expect(seen.length).toBe(2)
    // Unregistering something absent is a no-op, not another notification.
    registry.unregister('pairlens-predictions')
    expect(seen.length).toBe(2)
  })

  it('drops the prediction layouts from both route menus on deactivation', () => {
    const registry = new WorkspaceTemplateRegistry()
    registry.register(
      pluginFor('pairlens-predictions').manifest.contributes!.workspaces,
      { pluginId: 'pairlens-predictions', author: 'Pairlens', trusted: true },
    )

    const pairMenu = () =>
      Object.keys(
        mergeRoutePresets({}, registry.getTemplates(), 'pair', 'prediction'),
      )
    const discoveryMenu = () =>
      Object.keys(mergeRoutePresets({}, registry.getTemplates(), 'discovery'))

    expect(pairMenu()).toContain('template:prediction-terminal')
    expect(pairMenu()).toContain('template:prediction-race')
    expect(discoveryMenu()).toContain('template:prediction-discovery')

    registry.unregister('pairlens-predictions')

    expect(pairMenu()).toEqual([])
    expect(discoveryMenu()).toEqual([])
    expect(registry.getTemplates()).toEqual([])
  })

  it('never leaks a pair layout into the discovery menu, or the reverse', () => {
    const registry = new WorkspaceTemplateRegistry()
    for (const id of FAMILY_PLUGIN_IDS) {
      registry.register(pluginFor(id).manifest.contributes?.workspaces ?? [], {
        pluginId: id,
        author: 'Pairlens',
        trusted: true,
      })
    }
    // Every family ships a discovery board — at least one per Discovery
    // section, and predictions ships a second for the recurring crypto
    // up/down windows — and none of them may show up as a pair-route preset.
    const discovery = Object.keys(
      mergeRoutePresets({}, registry.getTemplates(), 'discovery'),
    ).sort()
    expect(discovery).toEqual([
      'template:dex-discovery',
      'template:equities-discovery',
      'template:perps-discovery',
      'template:prediction-crypto-updown',
      'template:prediction-discovery',
    ])
    // Standalone store templates are never quick-apply presets, and the perp
    // menu leads with the Default the route boots on.
    const perpMenu = Object.keys(
      mergeRoutePresets({}, registry.getTemplates(), 'pair', 'perp'),
    )
    expect(perpMenu).toEqual([
      'template:perps-terminal',
      'template:perps-carry',
      'template:perps-risk',
    ])
  })
})

describe('contributedToTemplate sanitization', () => {
  const base: ContributedWorkspace = {
    id: 'template:third-party',
    name: 'Third Party',
    tagline: 'A layout from someone else.',
    description: 'A layout from someone else, at length.',
    icon: 'Layers',
    facets: { traderTypes: [], assetClasses: [], screenSizes: [] },
    layout: MINIMAL_LAYOUT,
  }
  const untrusted = { pluginId: 'x', author: 'Anon', trusted: false }

  it('refuses a layout with no usable structure', () => {
    expect(
      contributedToTemplate(
        { ...base, layout: { version: 1, columns: [] } },
        untrusted,
      ),
    ).toBeNull()
    expect(
      contributedToTemplate(
        {
          ...base,
          layout: {
            version: 1,
            columns: [{ id: 'c', widthPercent: 100, cells: [] }],
          },
        },
        untrusted,
      ),
    ).toBeNull()
  })

  it('drops facet values it does not know', () => {
    const t = contributedToTemplate(
      {
        ...base,
        facets: {
          traderTypes: ['scalper', 'wizard'],
          assetClasses: ['crypto-spot', 'tulips'],
          screenSizes: ['compact', 'enormous'],
        },
      },
      untrusted,
    )!
    expect(t.facets.traderTypes).toEqual(['scalper'])
    expect(t.facets.assetClasses).toEqual(['crypto-spot'])
    expect(t.facets.screenSizes).toEqual(['compact'])
  })

  it('refuses to let an untrusted plugin claim featured or built-in status', () => {
    const t = contributedToTemplate({ ...base, featured: true }, untrusted)!
    expect(t.featured).toBe(false)
    expect(t.origin).toBeUndefined()
  })

  it('fills activeTabIndex so the layout reducer can read it', () => {
    const t = contributedToTemplate(base, untrusted)!
    expect(t.layout.columns[0].cells[0].activeTabIndex).toBe(0)
  })

  it('namespaces the id, so a third-party entry cannot shadow a built-in', () => {
    const t = contributedToTemplate(
      { ...base, id: 'template:classic-terminal' },
      untrusted,
    )!
    expect(t.id).not.toBe('template:classic-terminal')
    expect(t.id).toBe('plugin:x:template:classic-terminal')
    // Even a plugin that names itself `template` cannot mint a built-in id.
    const impostor = contributedToTemplate(
      { ...base, id: 'classic-terminal' },
      { pluginId: 'template', author: 'Anon', trusted: false },
    )!
    expect(impostor.id).not.toBe('template:classic-terminal')
  })

  it('cannot shadow the built-in board in the store list or the menus', () => {
    const registry = new WorkspaceTemplateRegistry()
    registry.register(
      pluginFor('pairlens-predictions').manifest.contributes!.workspaces,
      { pluginId: 'pairlens-predictions', author: 'Pairlens', trusted: true },
    )
    // A third-party plugin claiming the built-in ids, verbatim.
    registry.register(
      [
        {
          ...base,
          id: 'template:prediction-discovery',
          name: 'Impostor',
          context: 'discovery',
          routeMenu: true,
        },
        {
          ...base,
          id: 'template:classic-terminal',
          name: 'Impostor Terminal',
        },
      ],
      untrusted,
    )

    const builtin = registry
      .getTemplates()
      .filter((t) => t.id === 'template:prediction-discovery')
    expect(builtin.length).toBe(1)
    expect(builtin[0].name).toBe('Prediction Discovery')
    expect(builtin[0].origin).toBe('builtin')

    // The store list dedupes by id: the built-in copy survives the collision
    // because the impostor never gets to claim the id in the first place.
    const byId = new Map<string, WorkspaceTemplate>()
    for (const t of [
      ...BUILTIN_WORKSPACE_TEMPLATES,
      ...registry.getTemplates(),
    ]) {
      byId.set(t.id, t)
    }
    expect(byId.get('template:classic-terminal')?.name).not.toBe(
      'Impostor Terminal',
    )

    // And the discovery menu still applies the real board's layout.
    const menu = mergeRoutePresets({}, registry.getTemplates(), 'discovery')
    expect(menu['template:prediction-discovery'].label).toBe('Default')
  })

  it('caps tags and required plugins', () => {
    const t = contributedToTemplate(
      {
        ...base,
        tags: Array.from({ length: 40 }, (_, i) => `tag${i}`),
        requiredPlugins: Array.from({ length: 40 }, (_, i) => ({
          pluginId: `p${i}`,
        })),
      },
      untrusted,
    )!
    expect(t.tags!.length).toBeLessThanOrEqual(12)
    expect(t.requiredPlugins!.length).toBeLessThanOrEqual(24)
  })
})
