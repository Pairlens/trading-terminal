// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The per-asset-class pair workspace: each `InstrumentClass` persists its own
 * layout, seeds its own default preset, and offers only presets built for it.
 * These invariants are what keep a prediction page from ever rendering (or
 * suggesting) a spot execution desk.
 *
 * Every class beyond spot now takes its layouts from the family plugin that
 * owns it, so the menu assertions run against the merge the route actually
 * renders: the built-in base plus what the bundled plugins contribute.
 */
import { describe, expect, test } from 'bun:test'

import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { pairWorkspaceFor } from '../workspaces/pair-workspace'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

import type { TerminalLayout } from '../types'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import {
  BUILTIN_WORKSPACE_TEMPLATES,
  mergeRoutePresets,
  routePresets,
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

/** The preset map a class's workspaces menu renders with every family active. */
function menuFor(cls: InstrumentClass): Record<string, { label: string }> {
  return mergeRoutePresets(
    pairWorkspaceFor(cls).presets,
    CONTRIBUTED,
    'pair',
    cls,
  )
}

describe('pairWorkspaceFor', () => {
  test('spot keeps the pre-split storage key; other classes get their own', () => {
    expect(pairWorkspaceFor('spot').storageKey).toBe('pairlens:terminal.layout')
    for (const cls of INSTRUMENT_CLASSES.filter((c) => c !== 'spot')) {
      expect(pairWorkspaceFor(cls).storageKey).toBe(
        `pairlens:terminal.layout.${cls}`,
      )
    }
  })

  test('storage keys never collide across classes', () => {
    const keys = INSTRUMENT_CLASSES.map((c) => pairWorkspaceFor(c).storageKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('every class default carries a chart and its own trading surfaces', () => {
    // Predictions chart through `prediction-chart`, not `chart`: a contract
    // priced 0..1 has no wick worth drawing and the price chart can only ever
    // show one outcome, which on an event with a field is the wrong question.
    const expectations: Record<InstrumentClass, Array<string>> = {
      spot: ['chart', 'positions', 'orderbook', 'trade-entry'],
      perp: ['chart', 'futures-positions', 'orderbook', 'trade-entry'],
      prediction: [
        'prediction-chart',
        'event-brief',
        'events',
        'prediction-positions',
        'orderbook',
        'trade-entry',
      ],
      dex: ['chart', 'trade-entry'],
      // NFTs chart through the ORDINARY chart pane: a floor over time is a
      // candle series like any other, so the board keeps drawings, indicators
      // and the timeframe control rather than reinventing them. Its trading
      // surfaces are its own, because a collection's book is item-level on the
      // ask side and the generic order book cannot draw a token id.
      nft: ['chart', 'nft-book', 'nft-ticket', 'nft-collection-header'],
      stocks: ['chart', 'positions', 'trade-entry', 'symbol-news'],
    }
    for (const cls of INSTRUMENT_CLASSES) {
      const types = paneTypes(pairWorkspaceFor(cls).defaultPreset)
      for (const required of expectations[cls]) {
        expect(types).toContain(required)
      }
    }
  })

  test('class defaults do not carry panes that are dead on that class', () => {
    // Spot positions read nothing from a futures account, and neither DEX
    // pools nor the broker feed serve real order-book depth.
    expect(paneTypes(pairWorkspaceFor('perp').defaultPreset)).not.toContain(
      'positions',
    )
    expect(paneTypes(pairWorkspaceFor('dex').defaultPreset)).not.toContain(
      'orderbook',
    )
    expect(paneTypes(pairWorkspaceFor('stocks').defaultPreset)).not.toContain(
      'orderbook',
    )
  })

  test('every class carries a preset context, so plugin layouts can join', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      expect(pairWorkspaceFor(cls).presetContext).toBe('pair')
    }
  })

  test('each class menu leads with a Default preset matching its default layout', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      const ws = pairWorkspaceFor(cls)
      const menu = mergeRoutePresets(ws.presets, CONTRIBUTED, 'pair', cls)
      const entries = Object.entries(menu)
      const defaults = entries.filter(([, p]) => p.label === 'Default')
      expect(defaults.length).toBe(1)
      expect(menu[defaults[0][0]].layout).toEqual(ws.defaultPreset)
      // A menu that buried "Default" under the multi-chart layouts would read
      // as broken, and for every class but spot it now arrives from a plugin.
      expect(entries[0][0]).toBe(defaults[0][0])
    }
  })

  test('the non-spot defaults come from their family plugin, not the catalog', () => {
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
      const def = shipped.find((w) => w.menuLabel === 'Default')
      expect(def, `${pluginId} ships a class default`).toBeDefined()
      // The static class default and the plugin's copy are one source.
      expect(
        contributedToTemplate(def, {
          pluginId,
          author: plugin!.manifest.author,
          trusted: true,
        })!.layout,
      ).toEqual(pairWorkspaceFor(cls as InstrumentClass).defaultPreset)
      // ...and the catalog no longer double-serves it.
      expect(
        BUILTIN_WORKSPACE_TEMPLATES.some((t) => t.id === def!.id),
        `${def!.id} must not also live in the built-in catalog`,
      ).toBe(false)
    }
  })

  test('a class keeps a Default entry when its family plugin is disabled', () => {
    // Disabling `pairlens-cex-futures` takes the contributed perps desk out of
    // the registry, but the perp route still BOOTS on the class default, so a
    // menu with no way back to it would strand the user on a layout they can
    // change but never restore.
    const withoutFutures = CONTRIBUTED.filter(
      (t) => t.id !== 'template:perps-terminal',
    )
    const ws = pairWorkspaceFor('perp')
    const menu = mergeRoutePresets(
      ws.presets,
      withoutFutures,
      'pair',
      'perp',
      ws.defaultPreset,
    )
    const entries = Object.entries(menu)
    const defaults = entries.filter(([, p]) => p.label === 'Default')
    expect(defaults.length).toBe(1)
    expect(defaults[0][1].layout).toEqual(ws.defaultPreset)
    expect(entries[0][0]).toBe(defaults[0][0])
  })

  test('the synthesized Default never doubles the plugin one', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      const ws = pairWorkspaceFor(cls)
      const menu = mergeRoutePresets(
        ws.presets,
        CONTRIBUTED,
        'pair',
        cls,
        ws.defaultPreset,
      )
      expect(
        Object.values(menu).filter((p) => p.label === 'Default').length,
        cls,
      ).toBe(1)
    }
  })

  test('menus only offer presets whose facets serve the class', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      for (const id of Object.keys(menuFor(cls))) {
        const template = ALL_TEMPLATES.find((t) => t.id === id)
        expect(template, id).toBeDefined()
        expect(templateServesClass(template, cls)).toBe(true)
      }
    }
  })

  test('the spot menu keeps the full pre-split preset set', () => {
    expect(Object.keys(routePresets('pair', 'spot'))).toEqual([
      'template:classic-terminal',
      'template:chart-focus',
      'template:trading',
      'template:chart-analysis',
      'template:spot-research',
      'template:dual-charts',
      'template:triple-charts',
      'template:quad-charts',
    ])
    // No family plugin claims spot, so the merge changes nothing there.
    expect(Object.keys(menuFor('spot'))).toEqual(
      Object.keys(routePresets('pair', 'spot')),
    )
  })

  test('non-spot menus never suggest the spot execution desks', () => {
    for (const cls of ['perp', 'dex', 'stocks', 'prediction'] as const) {
      const ids = Object.keys(menuFor(cls))
      expect(ids).not.toContain('template:classic-terminal')
      expect(ids).not.toContain('template:trading')
      // The multi-chart layouts are universal and stay offered everywhere.
      expect(ids).toContain('template:dual-charts')
    }
  })

  test('templateServesClass normalizes both vocabularies', () => {
    const byId = (id: string) => ALL_TEMPLATES.find((t) => t.id === id)!
    // 'equities' facet ↔ 'stocks' slug, 'predictions' facet ↔ 'prediction'.
    expect(
      templateServesClass(byId('template:equities-terminal'), 'stocks'),
    ).toBe(true)
    expect(
      templateServesClass(byId('template:prediction-terminal'), 'prediction'),
    ).toBe(true)
    expect(templateServesClass(byId('template:perps-terminal'), 'spot')).toBe(
      false,
    )
  })
})
