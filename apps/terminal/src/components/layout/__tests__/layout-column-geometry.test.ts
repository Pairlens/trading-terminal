// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The fitContent cap, and the geometry every shipped board is held to.
 *
 * Two halves, one subject. The cap is what stops a content-sized cell from
 * eating a column whole; the board sweep is what stops a default layout from
 * quietly drifting away from 100%. Both are about a pane getting the room it
 * was promised.
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_MIN_HEIGHT,
  PANE_RULE_HEIGHT,
  cellMinHeight,
  fitCellMaxHeight,
} from '../layout-column-geometry'
import type {
  LayoutCell,
  PaneDefinition,
  TerminalLayout,
} from '@/lib/layout/types'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import { BUILTIN_WORKSPACE_TEMPLATES } from '@/lib/workspace-store/catalog'
import { contributedToTemplate } from '@/lib/workspace-store/workspace-template-registry'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'

const DEFS: Record<string, PaneDefinition> = {
  chart: { minHeight: 200 } as PaneDefinition,
  orderbook: { minHeight: 100 } as PaneDefinition,
  'venue-ladder': { minHeight: 100 } as PaneDefinition,
  'trade-entry': { minHeight: 180, fitContent: true } as PaneDefinition,
  risk: { minHeight: 32, fitContent: true } as PaneDefinition,
  markets: {} as PaneDefinition,
}

function cell(id: string, ...types: Array<string>): LayoutCell {
  return {
    id,
    heightPercent: 50,
    activeTabIndex: 0,
    panes: types.map((type, i) => ({ id: `${id}-${i}`, type })),
  }
}

describe('cellMinHeight', () => {
  test('a tabbed cell reserves for its tallest pane, not their sum', () => {
    expect(cellMinHeight(cell('c', 'chart', 'orderbook'), DEFS)).toBe(200)
  })

  test('a pane that declares nothing still gets a floor', () => {
    expect(cellMinHeight(cell('c', 'markets'), DEFS)).toBe(DEFAULT_MIN_HEIGHT)
    expect(cellMinHeight(cell('c', 'nothing-here'), DEFS)).toBe(
      DEFAULT_MIN_HEIGHT,
    )
  })
})

describe('fitCellMaxHeight', () => {
  test('reserves each flex cell its own minHeight plus the rules between', () => {
    // The spot default rail: venue ladder, book, then the ticket.
    expect(
      fitCellMaxHeight({
        fitCells: 1,
        flexCells: [cell('ladder', 'venue-ladder'), cell('book', 'orderbook')],
        separators: 2,
        defs: DEFS,
      }),
    ).toBe(`calc((100% - ${100 + 100 + 2 * PANE_RULE_HEIGHT}px) / 1)`)
  })

  test('a lone fit cell beside one neighbour reserves only that neighbour', () => {
    // The prediction rail, where a 606px ticket used to leave the book at 0.
    expect(
      fitCellMaxHeight({
        fitCells: 1,
        flexCells: [cell('book', 'orderbook')],
        separators: 1,
        defs: DEFS,
      }),
    ).toBe(`calc((100% - ${100 + PANE_RULE_HEIGHT}px) / 1)`)
  })

  test('two fit cells split the room left over rather than each taking it', () => {
    expect(
      fitCellMaxHeight({
        fitCells: 2,
        flexCells: [cell('chart', 'chart')],
        separators: 2,
        defs: DEFS,
      }),
    ).toBe(`calc((100% - ${200 + 2 * PANE_RULE_HEIGHT}px) / 2)`)
  })

  test('a column of nothing but fit cells reserves only its rules', () => {
    expect(
      fitCellMaxHeight({
        fitCells: 2,
        flexCells: [],
        separators: 1,
        defs: DEFS,
      }),
    ).toBe(`calc((100% - ${PANE_RULE_HEIGHT}px) / 2)`)
  })
})

/** Every layout the terminal can seed a board from, built-in or contributed. */
const SHIPPED: Array<{ name: string; layout: TerminalLayout }> = [
  ...BUILTIN_WORKSPACE_TEMPLATES.map((t: WorkspaceTemplate) => ({
    name: t.id,
    layout: t.layout,
  })),
  ...BOOTSTRAP_PLUGINS.flatMap(({ manifest }) =>
    (manifest.contributes?.workspaces ?? []).map((entry) => ({
      name: `${manifest.id}:${entry.id}`,
      layout: contributedToTemplate(entry, manifest).layout,
    })),
  ),
]

describe('every shipped board', () => {
  test('there are some, so a broken import cannot pass this file', () => {
    expect(SHIPPED.length).toBeGreaterThan(20)
  })

  test.each(SHIPPED.map((s) => [s.name, s.layout] as const))(
    '%s spends exactly 100% of its width and of every column',
    (_name, layout) => {
      const width = layout.columns.reduce((a, c) => a + c.widthPercent, 0)
      expect(width).toBeCloseTo(100, 1)
      for (const column of layout.columns) {
        const height = column.cells.reduce((a, c) => a + c.heightPercent, 0)
        expect(height).toBeCloseTo(100, 1)
      }
    },
  )

  test.each(SHIPPED.map((s) => [s.name, s.layout] as const))(
    '%s gives no column less than a readable width',
    (_name, layout) => {
      // A floor, not a target: the ultrawide and 4K presets are the ones that
      // sit near it, and 12% of the screen they are built for is a real
      // column. What this catches is a laptop board sliced past the point
      // where a pane can draw anything, which is how a workspace ends up
      // reading as one usable column and a stack of slivers.
      for (const column of layout.columns) {
        expect(column.widthPercent).toBeGreaterThanOrEqual(12)
      }
    },
  )
})
