// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  BUILTIN_WORKSPACE_TEMPLATES,
  routePresets,
  templateToWorkspaceParams,
} from '../catalog'
import {
  analyzeTemplateDependencies,
  collectPaneTypes,
  paneMeta,
} from '../dependency-analysis'
import type { PluginManifest } from '@pairlens/plugin-system'

import type { WorkspaceTemplate } from '../types'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'
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

const CORE = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === 'pairlens-core')!
const INTEL = BOOTSTRAP_PLUGINS.find(
  (p) => p.manifest.id === 'pairlens-intelligence',
)!

// Pane types that structurally require an active pair, per the real manifests.
const FIRST_PARTY = new Set(['pairlens-core', 'pairlens-intelligence'])
function typeKey(pluginId: string, panelId: string): string {
  return FIRST_PARTY.has(pluginId) ? panelId : `${pluginId}:${panelId}`
}
const PANES_REQUIRING_PAIR = new Set<string>()
for (const { manifest } of BOOTSTRAP_PLUGINS) {
  for (const panel of manifest.contributes?.panels ?? []) {
    if (panel.requires?.includes('workspace:active-pair')) {
      PANES_REQUIRING_PAIR.add(typeKey(manifest.id, panel.id))
    }
  }
}

describe('workspace template catalog integrity', () => {
  it('has unique template ids', () => {
    const ids = BUILTIN_WORKSPACE_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const tpl of BUILTIN_WORKSPACE_TEMPLATES) {
    describe(tpl.name, () => {
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
          const heightSum = col.cells.reduce((s, c) => s + c.heightPercent, 0)
          expect(Math.abs(heightSum - 100)).toBeLessThanOrEqual(1)
        }
      })

      it('binds every pair-consuming pane to a declared pair variable on copy', () => {
        // Templates store raw (unbound) layouts; bindings are applied on copy.
        // Most bind to $pair; multi-chart layouts use one var per chart.
        const bound = templateToWorkspaceParams(tpl).defaultLayout
        const pairVars = new Set(
          tpl.variables.filter((v) => v.type === 'pair').map((v) => v.name),
        )
        const boundVars = new Set<string>()
        let hasPairPane = false
        for (const col of bound.columns) {
          for (const cell of col.cells) {
            for (const pane of cell.panes) {
              if (!PANES_REQUIRING_PAIR.has(pane.type)) continue
              hasPairPane = true
              const b = pane.bindings?.['active-pair']
              expect(
                pairVars.size,
                `${tpl.id} needs a pair variable`,
              ).toBeGreaterThan(0)
              expect(
                pairVars.has(b as string),
                `${pane.type} bound to ${b}`,
              ).toBe(true)
              if (b) boundVars.add(b)
            }
          }
        }
        // No dead variables: every declared pair var is actually bound.
        if (pairVars.size > 0) {
          expect(hasPairPane).toBe(true)
          for (const v of pairVars) expect(boundVars.has(v)).toBe(true)
        }
      })
    })
  }
})

describe('analyzeTemplateDependencies', () => {
  const coreTemplate = BUILTIN_WORKSPACE_TEMPLATES.find(
    (t) => t.id === 'template:scalpers-cockpit',
  )!

  it('reports ready when required bootstrap plugins are active', () => {
    const report = analyzeTemplateDependencies(coreTemplate, [
      { manifest: CORE.manifest, status: 'active' },
    ])
    expect(report.readiness).toBe('ready')
    const core = report.plugins.find((p) => p.pluginId === 'pairlens-core')
    expect(core?.status).toBe('active')
    // pairlens-core contributes UI → full access, trusted because bundled.
    expect(core?.requiresFullTrust).toBe(true)
    expect(core?.trusted).toBe(true)
    expect(report.untrustedFullTrust).toHaveLength(0)
  })

  it('reports needs-install when a bundled plugin is absent', () => {
    const report = analyzeTemplateDependencies(coreTemplate, [])
    expect(report.readiness).toBe('needs-install')
    const core = report.plugins.find((p) => p.pluginId === 'pairlens-core')
    expect(core?.status).toBe('missing-bundled')
    expect(report.missingCount).toBeGreaterThan(0)
  })

  it('reports needs-enable when an installed plugin is disabled', () => {
    const report = analyzeTemplateDependencies(coreTemplate, [
      { manifest: CORE.manifest, status: 'disabled' },
    ])
    expect(report.readiness).toBe('needs-enable')
    expect(report.disabledCount).toBeGreaterThan(0)
  })

  it('flags an untrusted third-party full-access plugin as a security gate', () => {
    const evilManifest: PluginManifest = {
      id: 'evil-ui',
      name: 'Evil UI',
      version: '1.0.0',
      author: 'Anon',
      description: 'A third-party UI plugin',
      capabilities: [],
      config: {},
      contributes: {
        panels: [
          {
            id: 'evil-panel',
            label: 'Evil Panel',
            icon: 'LayoutGrid',
            category: 'discovery',
          },
        ],
      },
    }
    const template: WorkspaceTemplate = {
      ...coreTemplate,
      id: 'template:evil',
      requiredPlugins: [{ pluginId: 'evil-ui', reason: 'test' }],
    }
    const report = analyzeTemplateDependencies(template, [
      { manifest: CORE.manifest, status: 'active' },
      { manifest: evilManifest, status: 'active' },
    ])
    const evil = report.plugins.find((p) => p.pluginId === 'evil-ui')
    expect(evil?.requiresFullTrust).toBe(true)
    expect(evil?.trusted).toBe(false)
    expect(report.untrustedFullTrust.map((p) => p.pluginId)).toContain(
      'evil-ui',
    )
  })

  it('resolves intelligence panels to pairlens-intelligence', () => {
    const aiTemplate = BUILTIN_WORKSPACE_TEMPLATES.find(
      (t) => t.id === 'template:ai-research-desk',
    )!
    const report = analyzeTemplateDependencies(aiTemplate, [
      { manifest: CORE.manifest, status: 'active' },
      { manifest: INTEL.manifest, status: 'active' },
    ])
    expect(report.plugins.map((p) => p.pluginId).sort()).toContain(
      'pairlens-intelligence',
    )
  })
})

describe('templateToWorkspaceParams', () => {
  it('maps a template to createWorkspace params with the same shape', () => {
    const tpl = BUILTIN_WORKSPACE_TEMPLATES[0]
    const params = templateToWorkspaceParams(tpl)
    expect(params.name).toBe(tpl.name)
    expect(params.icon).toBe(tpl.icon)
    expect(params.variables).toBe(tpl.variables)
    // Layout is cloned + bound, not the same reference.
    expect(params.defaultLayout).not.toBe(tpl.layout)
    expect(params.defaultLayout.columns.length).toBe(tpl.layout.columns.length)
  })
})

describe('routePresets', () => {
  it('returns only routeMenu templates for a context, labelled by menuLabel', () => {
    const pair = routePresets('pair')
    // Every entry must map to a routeMenu pair-context template.
    for (const [id, preset] of Object.entries(pair)) {
      const tpl = BUILTIN_WORKSPACE_TEMPLATES.find((t) => t.id === id)
      expect(tpl?.context).toBe('pair')
      expect(tpl?.routeMenu).toBe(true)
      expect(preset.label).toBe(tpl?.menuLabel ?? tpl?.name)
    }
    // The classic default is present in the pair menu.
    expect(pair['template:classic-terminal']?.label).toBe('Default')

    const discovery = routePresets('discovery')
    expect(discovery['template:markets-board']?.label).toBe('Markets')
    // Standalone templates never leak into a route menu.
    expect(
      Object.keys(routePresets('pair')).some((id) =>
        id.startsWith('template:scalpers'),
      ),
    ).toBe(false)
  })
})
