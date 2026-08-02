// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { LayoutColumn, TerminalLayout } from './types'

let counter = 0

/** Generates a short unique id for layout nodes. */
export function layoutId(): string {
  return `l${Date.now().toString(36)}${(counter++).toString(36)}`
}

/** Normalize column widths so they sum to 100. */
export function normalizeWidths(
  columns: Array<LayoutColumn>,
): Array<LayoutColumn> {
  if (columns.length === 0) return columns
  const total = columns.reduce((sum, col) => sum + col.widthPercent, 0)
  if (Math.abs(total - 100) < 0.01) return columns
  const scale = 100 / total
  return columns.map((col) => ({
    ...col,
    widthPercent: Math.round(col.widthPercent * scale * 100) / 100,
  }))
}

/** Normalize cell heights within a column so they sum to 100. */
export function normalizeHeights(column: LayoutColumn): LayoutColumn {
  const { cells } = column
  if (cells.length === 0) return column
  const total = cells.reduce((sum, cell) => sum + cell.heightPercent, 0)
  if (Math.abs(total - 100) < 0.01) return column
  const scale = 100 / total
  return {
    ...column,
    cells: cells.map((cell) => ({
      ...cell,
      heightPercent: Math.round(cell.heightPercent * scale * 100) / 100,
    })),
  }
}

/** Normalize all widths and heights in a layout. */
export function normalizeLayout(layout: TerminalLayout): TerminalLayout {
  const normalized = normalizeWidths(layout.columns)
  return {
    ...layout,
    columns: normalized.map(normalizeHeights),
  }
}

/** Remove empty cells (no panes) and empty columns (no cells). */
export function pruneLayout(layout: TerminalLayout): TerminalLayout {
  const columns = layout.columns
    .map((col) => ({
      ...col,
      cells: col.cells.filter((cell) => cell.panes.length > 0),
    }))
    .filter((col) => col.cells.length > 0)

  // Never remove the last column
  if (columns.length === 0 && layout.columns.length > 0) {
    return layout
  }

  return normalizeLayout({ ...layout, columns })
}

/** Strip malformed bindings/overrides from a pane (permissive — bad data removed, not rejected). */
function sanitizePaneInstance(pane: Record<string, unknown>): void {
  if ('bindings' in pane) {
    if (
      typeof pane.bindings !== 'object' ||
      pane.bindings === null ||
      Array.isArray(pane.bindings)
    ) {
      delete pane.bindings
    } else {
      const b = pane.bindings as Record<string, unknown>
      for (const key of Object.keys(b)) {
        if (typeof b[key] !== 'string') delete b[key]
      }
      if (Object.keys(b).length === 0) delete pane.bindings
    }
  }

  if ('overrides' in pane) {
    if (
      typeof pane.overrides !== 'object' ||
      pane.overrides === null ||
      Array.isArray(pane.overrides)
    ) {
      delete pane.overrides
    } else {
      const o = pane.overrides as Record<string, unknown>
      // Validate known override shapes
      if ('active-pair' in o) {
        const ap = o['active-pair']
        if (
          typeof ap !== 'object' ||
          ap === null ||
          typeof (ap as Record<string, unknown>).pairKey !== 'string' ||
          typeof (ap as Record<string, unknown>).market !== 'string'
        ) {
          delete o['active-pair']
        }
      }
      if (Object.keys(o).length === 0) delete pane.overrides
    }
  }
}

/** Validate a layout object — returns true if structurally valid. */
export function isValidLayout(value: unknown): value is TerminalLayout {
  if (typeof value !== 'object' || value === null) return false
  const layout = value as Record<string, unknown>
  if (layout.version !== 1) return false
  if (!Array.isArray(layout.columns)) return false

  for (const col of layout.columns as Array<unknown>) {
    if (typeof col !== 'object' || col === null) return false
    const column = col as Record<string, unknown>
    if (typeof column.id !== 'string') return false
    if (typeof column.widthPercent !== 'number') return false
    if (!Array.isArray(column.cells)) return false

    for (const c of column.cells as Array<unknown>) {
      if (typeof c !== 'object' || c === null) return false
      const cell = c as Record<string, unknown>
      if (typeof cell.id !== 'string') return false
      if (typeof cell.heightPercent !== 'number') return false
      if (typeof cell.activeTabIndex !== 'number') return false
      if (!Array.isArray(cell.panes)) return false

      // Sanitize pane instances (strip malformed bindings/overrides)
      for (const p of cell.panes as Array<unknown>) {
        if (typeof p === 'object' && p !== null) {
          sanitizePaneInstance(p as Record<string, unknown>)
        }
      }
    }
  }

  return true
}
