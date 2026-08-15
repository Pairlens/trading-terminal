// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The ceilings and the structural check every workspace layout that arrives
 * from outside the bundle passes through.
 *
 * Three places need exactly the same answer: the manifest schema (does this
 * plugin declare a layout that could ever render?), the terminal's contributed
 * workspace registry, and the community-store mapper. They used to carry three
 * hand-synced copies of the same walk, which is a bug waiting for the day one
 * of them learns a new cap and the others do not.
 *
 * Dependency-free so it runs anywhere the schema runs: terminal, CLI, registry.
 */

/** Ceilings an untrusted contribution must stay under. */
export const WORKSPACE_LAYOUT_CAPS = {
  /** Layouts one plugin may contribute. */
  maxWorkspaces: 24,
  maxColumns: 16,
  maxCellsPerColumn: 24,
  maxPanesPerCell: 16,
  maxTotalPanes: 200,
  /** Serialized layout size, so a copy cannot bloat localStorage. */
  maxLayoutBytes: 256 * 1024,
  maxTags: 12,
  maxVariables: 24,
  maxRequiredPlugins: 24,
  /** Longest a single display string may be. */
  maxTextLength: 500,
} as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Walk the full column→cell→pane structure every consumer (preview, dependency
 * analysis, copy, the layout reducer) iterates unguarded, and report the first
 * thing that would break it. Returns null when the layout is usable.
 *
 * `path` prefixes the message so a manifest validator can point at the entry.
 */
export function checkWorkspaceLayoutShape(
  value: unknown,
  path = 'layout',
): string | null {
  if (!isPlainObject(value)) {
    return `"${path}" is required and must be a layout object`
  }
  const columns = value['columns']
  if (!Array.isArray(columns) || columns.length === 0) {
    return `"${path}.columns" must be a non-empty array`
  }
  if (columns.length > WORKSPACE_LAYOUT_CAPS.maxColumns) {
    return `"${path}.columns" must not exceed ${WORKSPACE_LAYOUT_CAPS.maxColumns} entries`
  }

  let totalPanes = 0
  for (const [ci, column] of columns.entries()) {
    const cells = isPlainObject(column) ? column['cells'] : null
    if (!Array.isArray(cells) || cells.length === 0) {
      return `"${path}.columns[${ci}].cells" must be a non-empty array`
    }
    if (cells.length > WORKSPACE_LAYOUT_CAPS.maxCellsPerColumn) {
      return `"${path}.columns[${ci}].cells" must not exceed ${WORKSPACE_LAYOUT_CAPS.maxCellsPerColumn} entries`
    }
    for (const [ei, cell] of cells.entries()) {
      const panes = isPlainObject(cell) ? cell['panes'] : null
      if (!Array.isArray(panes) || panes.length === 0) {
        return `"${path}.columns[${ci}].cells[${ei}].panes" must be a non-empty array`
      }
      if (panes.length > WORKSPACE_LAYOUT_CAPS.maxPanesPerCell) {
        return `"${path}.columns[${ci}].cells[${ei}].panes" must not exceed ${WORKSPACE_LAYOUT_CAPS.maxPanesPerCell} entries`
      }
      totalPanes += panes.length
      if (totalPanes > WORKSPACE_LAYOUT_CAPS.maxTotalPanes) {
        return `"${path}" must not exceed ${WORKSPACE_LAYOUT_CAPS.maxTotalPanes} panes in total`
      }
      for (const [pi, pane] of panes.entries()) {
        if (!isPlainObject(pane) || typeof pane['type'] !== 'string') {
          return `"${path}.columns[${ci}].cells[${ei}].panes[${pi}].type" must be a string`
        }
      }
    }
  }
  return null
}

/** Serialized size guard, kept separate because only the copy paths need it. */
export function withinWorkspaceLayoutByteCap(value: unknown): boolean {
  try {
    return JSON.stringify(value).length <= WORKSPACE_LAYOUT_CAPS.maxLayoutBytes
  } catch {
    return false
  }
}

/** Structure plus size: what the terminal requires before it renders a layout. */
export function isUsableWorkspaceLayout(value: unknown): boolean {
  return (
    checkWorkspaceLayoutShape(value) === null &&
    withinWorkspaceLayoutByteCap(value)
  )
}
