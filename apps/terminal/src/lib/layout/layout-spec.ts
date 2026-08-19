// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── A board the assistant can write in one value ─────────────────────
//
// The reducer builds a board one pane at a time, which is the right
// shape for a mouse and the wrong shape for a model asked to assemble a
// four-column trading desk: twelve dispatches, each one a chance to
// drift. This is the whole geometry as a single value — columns of
// stacked cells, each cell a list of panes that render as tabs — with
// one validator in front of it.
//
// Everything is checked against the LIVE pane registry rather than a
// list kept here, for the same reason `save-workspace.ts` reads
// `requires` from the registry: the panes that exist are whatever the
// installed plugins contribute, and a board built out of type ids that
// do not exist renders as a wall of empty placeholders.

import { layoutId, normalizeLayout } from './utils'
import type {
  LayoutCell,
  LayoutColumn,
  PaneDefinition,
  PaneInstance,
  TerminalLayout,
} from './types'

/**
 * Ceilings, not preferences. A model that miscounts should get a
 * refusal it can read and correct, not a board with forty columns that
 * the user has to delete pane by pane.
 */
export const LAYOUT_SPEC_LIMITS = {
  columns: 8,
  cellsPerColumn: 8,
  panesPerCell: 8,
  totalPanes: 40,
} as const

export type LayoutSpecCell = {
  /** Pane type ids. More than one renders the cell as tabs. */
  panes: Array<string>
  /** Share of the column's height. Omit for an even split. */
  height?: number
}

export type LayoutSpecColumn = {
  cells: Array<LayoutSpecCell>
  /** Share of the board's width. Omit for an even split. */
  width?: number
}

export type LayoutSpec = { columns: Array<LayoutSpecColumn> }

export type LayoutSpecResult = { layout: TerminalLayout } | { error: string }

/** Even split, to two decimals, summing close enough for normalizeLayout. */
function evenShare(count: number): number {
  return Math.round((100 / count) * 100) / 100
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

/**
 * Turn a spec into a real layout, or say why it cannot be one.
 *
 * Failures come back as a value rather than a throw: this runs inside
 * an assistant tool, and a model that named one pane wrong should be
 * told which one so it can fix the call, not have its turn killed.
 */
export function layoutFromSpec(
  spec: LayoutSpec,
  definitions: Record<string, PaneDefinition>,
): LayoutSpecResult {
  const specColumns = spec.columns ?? []
  if (specColumns.length === 0)
    return { error: 'A layout needs at least one column.' }
  if (specColumns.length > LAYOUT_SPEC_LIMITS.columns) {
    return {
      error: `A layout can have at most ${LAYOUT_SPEC_LIMITS.columns} columns; this one has ${specColumns.length}.`,
    }
  }

  const unknown = new Set<string>()
  const seen = new Map<string, number>()
  let total = 0

  for (const column of specColumns) {
    const cells = column.cells ?? []
    if (cells.length === 0)
      return { error: 'Every column needs at least one cell.' }
    if (cells.length > LAYOUT_SPEC_LIMITS.cellsPerColumn) {
      return {
        error: `A column can hold at most ${LAYOUT_SPEC_LIMITS.cellsPerColumn} stacked cells.`,
      }
    }
    for (const cell of cells) {
      const panes = cell.panes ?? []
      if (panes.length === 0)
        return { error: 'Every cell needs at least one pane.' }
      if (panes.length > LAYOUT_SPEC_LIMITS.panesPerCell) {
        return {
          error: `A cell can hold at most ${LAYOUT_SPEC_LIMITS.panesPerCell} tabbed panes.`,
        }
      }
      for (const type of panes) {
        total++
        if (!definitions[type]) unknown.add(type)
        seen.set(type, (seen.get(type) ?? 0) + 1)
      }
    }
  }

  if (unknown.size > 0) {
    return {
      error: `Not pane types on this terminal: ${[...unknown].join(', ')}. Call list_pane_types for the ids that exist.`,
    }
  }
  if (total > LAYOUT_SPEC_LIMITS.totalPanes) {
    return {
      error: `A layout can hold at most ${LAYOUT_SPEC_LIMITS.totalPanes} panes; this one has ${total}.`,
    }
  }

  const duplicated = [...seen.entries()]
    .filter(([type, count]) => count > 1 && definitions[type]?.singleton)
    .map(([type]) => type)
  if (duplicated.length > 0) {
    return {
      error: `Only one of each of these panes can be on a board: ${duplicated.join(', ')}.`,
    }
  }

  const columnWidth = evenShare(specColumns.length)
  const columns: Array<LayoutColumn> = specColumns.map((column) => {
    const specCells = column.cells
    const cellHeight = evenShare(specCells.length)
    const cells: Array<LayoutCell> = specCells.map((cell) => ({
      id: layoutId(),
      panes: cell.panes.map((type): PaneInstance => ({ id: layoutId(), type })),
      activeTabIndex: 0,
      heightPercent: positive(cell.height, cellHeight),
    }))
    return {
      id: layoutId(),
      cells,
      widthPercent: positive(column.width, columnWidth),
    }
  })

  return { layout: normalizeLayout({ version: 1, columns }) }
}

/** The inverse, for reading a saved board back to the model. */
export function layoutToSpec(layout: TerminalLayout): LayoutSpec {
  return {
    columns: (layout.columns ?? []).map((column) => ({
      width: Math.round(column.widthPercent),
      cells: (column.cells ?? []).map((cell) => ({
        height: Math.round(cell.heightPercent),
        panes: (cell.panes ?? []).map((pane) => pane.type),
      })),
    })),
  }
}

/** Every pane type on a board, in reading order, duplicates included. */
export function paneTypesOf(layout: TerminalLayout): Array<string> {
  return (layout.columns ?? []).flatMap((column) =>
    (column.cells ?? []).flatMap((cell) =>
      (cell.panes ?? []).map((pane) => pane.type),
    ),
  )
}
