// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discovery's asset-class sections: one workspace per class, each persisting
 * its own board and offering only presets built for it, plus the rules that
 * decide which tabs exist and what order they sit in.
 *
 * The invariants here are the ones a user notices when they break: a board
 * saved under the wrong key (tune perps, lose spot), a tab for a family that
 * is not installed, or a saved order that quietly hides a section.
 */
import { describe, expect, test } from 'bun:test'

import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'

import {
  DISCOVERY_SECTIONS,
  availableSections,
  isDiscoverySectionId,
  orderSections,
  resolveSection,
} from '../workspaces/discovery-sections'
import { discoveryWorkspaceFor } from '../workspaces/discovery-workspace'
import { pairWorkspaceFor } from '../workspaces/pair-workspace'
import { DISCOVERY_HOME } from '../workspaces/discovery-presets'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { TerminalLayout } from '../types'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import {
  BUILTIN_WORKSPACE_TEMPLATES,
  mergeRoutePresets,
  templateServesClass,
} from '@/lib/workspace-store/catalog'
import { contributedToTemplate } from '@/lib/workspace-store/workspace-template-registry'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'

function paneTypes(layout: TerminalLayout): Set<string> {
  const types = new Set<string>()
  for (const col of layout.columns)
    for (const cell of col.cells) for (const p of cell.panes) types.add(p.type)
  return types
}

/** Every workspace the bundled plugins ship, mapped the way the app maps them. */
const CONTRIBUTED: Array<WorkspaceTemplate> = BOOTSTRAP_PLUGINS.flatMap(
  ({ manifest }) =>
    (manifest.contributes?.workspaces ?? []).flatMap((entry) => {
      const template = contributedToTemplate(entry, {
        pluginId: manifest.id,
        author: manifest.author,
        trusted: true,
      })
      return template ? [template] : []
    }),
)

const ALL_TEMPLATES = [...BUILTIN_WORKSPACE_TEMPLATES, ...CONTRIBUTED]

/** The preset map a section's layouts menu renders with every family active. */
function menuFor(
  cls: InstrumentClass,
): Record<string, { label: string; layout: TerminalLayout }> {
  const ws = discoveryWorkspaceFor(cls)
  return mergeRoutePresets(
    ws.presets,
    CONTRIBUTED,
    'discovery',
    cls,
    ws.defaultPreset,
  )
}

const ALL_SECTION_IDS = new Set(
  DISCOVERY_SECTIONS.flatMap((s) => (s.templateId ? [s.templateId] : [])),
)

describe('discoveryWorkspaceFor', () => {
  test('spot keeps the pre-split storage key; other sections get their own', () => {
    expect(discoveryWorkspaceFor('spot').storageKey).toBe(
      'pairlens:discovery.layout',
    )
    for (const cls of INSTRUMENT_CLASSES.filter((c) => c !== 'spot')) {
      expect(discoveryWorkspaceFor(cls).storageKey).toBe(
        `pairlens:discovery.layout.${cls}`,
      )
    }
  })

  test('storage keys collide with nothing — not each other, not the pair route', () => {
    const keys = [
      ...INSTRUMENT_CLASSES.map((c) => discoveryWorkspaceFor(c).storageKey),
      ...INSTRUMENT_CLASSES.map((c) => pairWorkspaceFor(c).storageKey),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('every section is class-scoped, so its menu can be narrowed', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      const ws = discoveryWorkspaceFor(cls)
      expect(ws.presetContext).toBe('discovery')
      expect(ws.assetClass).toBe(cls)
    }
  })

  test('spot opens on the pre-sections home board', () => {
    expect(discoveryWorkspaceFor('spot').defaultPreset).toEqual(DISCOVERY_HOME)
  })

  test('the non-spot boards come from their family plugin, one source', () => {
    const owners: Record<string, string> = {
      perp: 'pairlens-cex-futures',
      prediction: 'pairlens-predictions',
      dex: 'pairlens-dex',
      stocks: 'pairlens-equities',
    }
    for (const [cls, pluginId] of Object.entries(owners)) {
      const plugin = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === pluginId)
      expect(plugin, pluginId).toBeDefined()
      const shipped = plugin!.manifest.contributes?.workspaces ?? []
      const board = shipped.find(
        (w) => w.context === 'discovery' && ALL_SECTION_IDS.has(w.id),
      )
      expect(board, `${pluginId} ships a discovery board`).toBeDefined()
      expect(
        contributedToTemplate(board, {
          pluginId,
          author: plugin!.manifest.author,
          trusted: true,
        })!.layout,
      ).toEqual(discoveryWorkspaceFor(cls as InstrumentClass).defaultPreset)
    }
  })

  test('every board carries the scanner its own class browses by', () => {
    // A section that renders the same price table five times is the bug these
    // boards exist to fix, so each one names the pane its class actually
    // shops with: perps by cost of carry, DEX by pool, stocks by calendar,
    // predictions by event.
    const SCANNERS: Record<InstrumentClass, string> = {
      spot: 'markets',
      perp: 'funding-matrix',
      dex: 'pool-map',
      stocks: 'earnings-calendar',
      prediction: 'event-board',
    }
    for (const cls of INSTRUMENT_CLASSES) {
      const types = paneTypes(discoveryWorkspaceFor(cls).defaultPreset)
      expect(types.has(SCANNERS[cls]), cls).toBe(true)
    }
  })

  test('boards skip the panes that read a different market', () => {
    // Prediction outcomes are never in the pair catalog, so the event board
    // stands in for the scanner; equities have no Fear & Greed index.
    expect(
      paneTypes(discoveryWorkspaceFor('prediction').defaultPreset),
    ).toContain('event-board')
    expect(
      paneTypes(discoveryWorkspaceFor('prediction').defaultPreset),
    ).not.toContain('markets')
    expect(
      paneTypes(discoveryWorkspaceFor('stocks').defaultPreset),
    ).not.toContain('fear-greed')
    expect(
      paneTypes(discoveryWorkspaceFor('stocks').defaultPreset),
    ).not.toContain('heatmap')
    // The perp board scans by what holding a contract costs, so the shared
    // price scanner is deliberately absent from it too.
    expect(
      paneTypes(discoveryWorkspaceFor('perp').defaultPreset),
    ).not.toContain('markets')
  })

  test('each section menu leads with one Default matching the board it opens on', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      const ws = discoveryWorkspaceFor(cls)
      const entries = Object.entries(menuFor(cls))
      const defaults = entries.filter(([, p]) => p.label === 'Default')
      expect(defaults.length, cls).toBe(1)
      expect(defaults[0][1].layout).toEqual(ws.defaultPreset)
      expect(entries[0][0]).toBe(defaults[0][0])
    }
  })

  test('menus only offer boards whose facets serve the section', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      for (const [id, preset] of Object.entries(menuFor(cls))) {
        const template = ALL_TEMPLATES.find((t) => t.id === id)
        // The synthesized Default carries no template of its own.
        if (!template) {
          expect(preset.label).toBe('Default')
          continue
        }
        expect(templateServesClass(template, cls), `${id} on ${cls}`).toBe(true)
      }
    }
  })

  test('a section keeps a Default when its family plugin is disabled', () => {
    // Uninstalling the family removes the tab, but a deployment can also be
    // mid-flight: the section still BOOTS on the class default, so the menu
    // must keep a way back to it.
    const ws = discoveryWorkspaceFor('prediction')
    const withoutPredictions = CONTRIBUTED.filter(
      (t) => !t.id.startsWith('template:prediction-'),
    )
    const entries = Object.entries(
      mergeRoutePresets(
        ws.presets,
        withoutPredictions,
        'discovery',
        'prediction',
        ws.defaultPreset,
      ),
    )
    const defaults = entries.filter(([, p]) => p.label === 'Default')
    expect(defaults.length).toBe(1)
    expect(defaults[0][1].layout).toEqual(ws.defaultPreset)
  })

  test('the spot section never suggests another class board', () => {
    const ids = Object.keys(menuFor('spot'))
    expect(ids).not.toContain('template:prediction-discovery')
    expect(ids).not.toContain('template:dex-discovery')
    expect(ids).not.toContain('template:equities-discovery')
    // The bare full-width scanner is universal and stays offered everywhere.
    for (const cls of INSTRUMENT_CLASSES) {
      expect(Object.keys(menuFor(cls)), cls).toContain('template:markets-board')
    }
  })
})

describe('discovery sections', () => {
  test('every instrument class has a tab — adding a class must add one', () => {
    expect(DISCOVERY_SECTIONS.map((s) => s.id).sort()).toEqual(
      [...INSTRUMENT_CLASSES].sort(),
    )
  })

  test('section ids are instrument classes, and nothing else validates', () => {
    expect(isDiscoverySectionId('perp')).toBe(true)
    expect(isDiscoverySectionId('crypto-perp')).toBe(false)
    expect(isDiscoverySectionId('')).toBe(false)
    expect(isDiscoverySectionId(undefined)).toBe(false)
  })

  test('spot is built in; every other tab is owned by a plugin board', () => {
    for (const section of DISCOVERY_SECTIONS) {
      if (section.id === 'spot') expect(section.templateId).toBeNull()
      else expect(section.templateId).toBeString()
    }
  })

  test('availability follows the registry, so a removed family loses its tab', () => {
    const all = new Set(ALL_SECTION_IDS)
    expect(availableSections(all).map((s) => s.id)).toEqual(
      DISCOVERY_SECTIONS.map((s) => s.id),
    )

    const withoutPredictions = new Set(all)
    withoutPredictions.delete('template:prediction-discovery')
    expect(
      availableSections(withoutPredictions).map((s) => s.id),
    ).not.toContain('prediction')

    // Strip everything: spot is built in and survives, so Discovery is never
    // a page with no tabs on it.
    expect(availableSections(new Set()).map((s) => s.id)).toEqual(['spot'])
  })

  test('a saved order cannot hide a section or resurrect a dead one', () => {
    const sections = availableSections(new Set(ALL_SECTION_IDS))
    // Names a section that no longer exists, repeats one, and omits the rest.
    const ordered = orderSections(sections, [
      'prediction',
      'memecoins',
      'prediction',
      'dex',
    ])
    expect(ordered.map((s) => s.id)).toEqual([
      'prediction',
      'dex',
      'spot',
      'perp',
      'stocks',
    ])
    expect(ordered.length).toBe(sections.length)
  })

  test('an empty order is the ship order', () => {
    const sections = availableSections(new Set(ALL_SECTION_IDS))
    expect(orderSections(sections, []).map((s) => s.id)).toEqual(
      sections.map((s) => s.id),
    )
  })

  test('the URL wins, then the remembered section, then the first tab', () => {
    const sections = availableSections(new Set(ALL_SECTION_IDS))
    expect(resolveSection(sections, 'dex', 'perp')).toBe('dex')
    expect(resolveSection(sections, undefined, 'perp')).toBe('perp')
    expect(resolveSection(sections, undefined, undefined)).toBe(sections[0].id)
  })

  test('a link to a section this install lost still lands somewhere real', () => {
    const withoutPredictions = new Set(ALL_SECTION_IDS)
    withoutPredictions.delete('template:prediction-discovery')
    const sections = availableSections(withoutPredictions)
    expect(resolveSection(sections, 'prediction', 'dex')).toBe('dex')
    expect(resolveSection(sections, 'prediction', 'prediction')).toBe(
      sections[0].id,
    )
  })
})
