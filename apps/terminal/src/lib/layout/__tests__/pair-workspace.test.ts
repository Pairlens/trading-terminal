// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The per-asset-class pair workspace: each `InstrumentClass` persists its own
 * layout, seeds its own default preset, and offers only presets built for it.
 * These invariants are what keep a prediction page from ever rendering (or
 * suggesting) a spot execution desk.
 */
import { describe, expect, test } from 'bun:test'

import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { pairWorkspaceFor } from '../workspaces/pair-workspace'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

import type { TerminalLayout } from '../types'
import {
  BUILTIN_WORKSPACE_TEMPLATES,
  routePresets,
  templateServesClass,
} from '@/lib/workspace-store/catalog'

function paneTypes(layout: TerminalLayout): Set<string> {
  const types = new Set<string>()
  for (const col of layout.columns)
    for (const cell of col.cells) for (const p of cell.panes) types.add(p.type)
  return types
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
    const expectations: Record<InstrumentClass, Array<string>> = {
      spot: ['chart', 'positions', 'orderbook', 'trade-entry'],
      perp: ['chart', 'futures-positions', 'orderbook', 'trade-entry'],
      prediction: [
        'chart',
        'events',
        'prediction-positions',
        'orderbook',
        'trade-entry',
      ],
      dex: ['chart', 'trade-entry'],
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

  test('each class menu leads with a Default preset matching its default layout', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      const ws = pairWorkspaceFor(cls)
      const defaults = Object.values(ws.presets).filter(
        (p) => p.label === 'Default',
      )
      expect(defaults.length).toBe(1)
      expect(defaults[0].layout).toEqual(ws.defaultPreset)
    }
  })

  test('menus only offer presets whose facets serve the class', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      for (const id of Object.keys(pairWorkspaceFor(cls).presets)) {
        const template = BUILTIN_WORKSPACE_TEMPLATES.find((t) => t.id === id)
        expect(template).toBeDefined()
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
      'template:dual-charts',
      'template:triple-charts',
      'template:quad-charts',
    ])
  })

  test('non-spot menus never suggest the spot execution desks', () => {
    for (const cls of ['perp', 'dex', 'stocks', 'prediction'] as const) {
      const ids = Object.keys(routePresets('pair', cls))
      expect(ids).not.toContain('template:classic-terminal')
      expect(ids).not.toContain('template:trading')
      // The multi-chart layouts are universal and stay offered everywhere.
      expect(ids).toContain('template:dual-charts')
    }
  })

  test('templateServesClass normalizes both vocabularies', () => {
    const byId = (id: string) =>
      BUILTIN_WORKSPACE_TEMPLATES.find((t) => t.id === id)!
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
