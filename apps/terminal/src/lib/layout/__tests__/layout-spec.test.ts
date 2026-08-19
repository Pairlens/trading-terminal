// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  LAYOUT_SPEC_LIMITS,
  layoutFromSpec,
  layoutToSpec,
  paneTypesOf,
} from '../layout-spec'
import type { LayoutSpec } from '../layout-spec'
import type { PaneDefinition } from '../types'

function defs(
  types: Array<string>,
  overrides: Record<string, Partial<PaneDefinition>> = {},
): Record<string, PaneDefinition> {
  return Object.fromEntries(
    types.map((type) => [
      type,
      {
        type,
        labelKey: `panes.${type}`,
        icon: 'LayoutGrid',
        ...overrides[type],
      } satisfies PaneDefinition,
    ]),
  )
}

const CATALOG = defs(['chart', 'orderbook', 'trades', 'watchlist'], {
  watchlist: { singleton: true },
})

function expectLayout(result: ReturnType<typeof layoutFromSpec>) {
  if ('error' in result) throw new Error(`unexpected error: ${result.error}`)
  return result.layout
}

describe('layoutFromSpec', () => {
  it('builds a board with unique ids and an even split', () => {
    const layout = expectLayout(
      layoutFromSpec(
        {
          columns: [
            { cells: [{ panes: ['chart'] }] },
            { cells: [{ panes: ['orderbook'] }, { panes: ['trades'] }] },
          ],
        },
        CATALOG,
      ),
    )

    expect(layout.version).toBe(1)
    expect(layout.columns).toHaveLength(2)
    expect(layout.columns[0].widthPercent).toBe(50)
    expect(layout.columns[1].cells.map((cell) => cell.heightPercent)).toEqual([
      50, 50,
    ])

    const ids = [
      ...layout.columns.map((column) => column.id),
      ...layout.columns.flatMap((column) =>
        column.cells.map((cell) => cell.id),
      ),
      ...paneIds(layout),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps explicit widths and heights, normalized to 100', () => {
    const layout = expectLayout(
      layoutFromSpec(
        {
          columns: [
            {
              width: 70,
              cells: [
                { height: 60, panes: ['chart'] },
                { height: 40, panes: ['trades'] },
              ],
            },
            { width: 30, cells: [{ panes: ['orderbook'] }] },
          ],
        },
        CATALOG,
      ),
    )

    expect(layout.columns.map((column) => column.widthPercent)).toEqual([
      70, 30,
    ])
    expect(layout.columns[0].cells.map((cell) => cell.heightPercent)).toEqual([
      60, 40,
    ])
  })

  it('renders several panes in one cell as tabs on the first one', () => {
    const layout = expectLayout(
      layoutFromSpec(
        { columns: [{ cells: [{ panes: ['orderbook', 'trades'] }] }] },
        CATALOG,
      ),
    )
    expect(layout.columns[0].cells[0].panes).toHaveLength(2)
    expect(layout.columns[0].cells[0].activeTabIndex).toBe(0)
  })

  // ── Refusals ──────────────────────────────────────────────────────
  //
  // Every one of these comes back as a value the model can read and
  // correct, never as a throw that would kill the turn.

  it('names the pane types that do not exist', () => {
    const result = layoutFromSpec(
      { columns: [{ cells: [{ panes: ['chart', 'hologram'] }] }] },
      CATALOG,
    )
    expect('error' in result && result.error).toContain('hologram')
    expect('error' in result && result.error).toContain('list_pane_types')
  })

  it('refuses a second copy of a singleton pane', () => {
    const result = layoutFromSpec(
      {
        columns: [
          { cells: [{ panes: ['watchlist'] }] },
          { cells: [{ panes: ['watchlist'] }] },
        ],
      },
      CATALOG,
    )
    expect('error' in result && result.error).toContain('watchlist')
  })

  it('allows a repeated pane that is not a singleton', () => {
    const layout = expectLayout(
      layoutFromSpec(
        {
          columns: [
            { cells: [{ panes: ['chart'] }] },
            { cells: [{ panes: ['chart'] }] },
          ],
        },
        CATALOG,
      ),
    )
    expect(paneTypesOf(layout)).toEqual(['chart', 'chart'])
  })

  it('refuses an empty board, an empty column and an empty cell', () => {
    expect('error' in layoutFromSpec({ columns: [] }, CATALOG)).toBe(true)
    expect(
      'error' in layoutFromSpec({ columns: [{ cells: [] }] }, CATALOG),
    ).toBe(true)
    expect(
      'error' in
        layoutFromSpec({ columns: [{ cells: [{ panes: [] }] }] }, CATALOG),
    ).toBe(true)
  })

  it('refuses a board wider than the column ceiling', () => {
    const columns = Array.from(
      { length: LAYOUT_SPEC_LIMITS.columns + 1 },
      () => ({ cells: [{ panes: ['chart'] }] }),
    )
    const result = layoutFromSpec({ columns }, CATALOG)
    expect('error' in result && result.error).toContain(
      String(LAYOUT_SPEC_LIMITS.columns),
    )
  })

  it('refuses more panes than the total ceiling', () => {
    const catalog = defs(['chart'])
    const columns = Array.from({ length: 8 }, () => ({
      cells: Array.from({ length: 7 }, () => ({ panes: ['chart'] })),
    }))
    const result = layoutFromSpec({ columns }, catalog)
    expect('error' in result && result.error).toContain(
      String(LAYOUT_SPEC_LIMITS.totalPanes),
    )
  })

  it('ignores a nonsense width instead of producing a broken column', () => {
    const layout = expectLayout(
      layoutFromSpec(
        { columns: [{ width: -20, cells: [{ panes: ['chart'] }] }] },
        CATALOG,
      ),
    )
    expect(layout.columns[0].widthPercent).toBe(100)
  })
})

describe('layoutToSpec', () => {
  it('round-trips a board back to the spec it was built from', () => {
    const spec: LayoutSpec = {
      columns: [
        { width: 60, cells: [{ height: 100, panes: ['chart'] }] },
        {
          width: 40,
          cells: [
            { height: 50, panes: ['orderbook', 'trades'] },
            { height: 50, panes: ['watchlist'] },
          ],
        },
      ],
    }
    expect(layoutToSpec(expectLayout(layoutFromSpec(spec, CATALOG)))).toEqual(
      spec,
    )
  })
})

function paneIds(layout: {
  columns: Array<{ cells: Array<{ panes: Array<{ id: string }> }> }>
}) {
  return layout.columns.flatMap((column) =>
    column.cells.flatMap((cell) => cell.panes.map((pane) => pane.id)),
  )
}
