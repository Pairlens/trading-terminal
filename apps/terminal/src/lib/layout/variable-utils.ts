// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  TerminalLayout,
  WorkspaceVariableDefinition,
  WorkspaceVariableType,
} from './types'

/** Canonical timeframe choices offered for timeframe variables. */
export const VARIABLE_TIMEFRAME_OPTIONS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1D', label: '1D' },
] as const

export const DEFAULT_TIMEFRAME = '1h'

/** Derive a stable internal name from a label (e.g. "Coin 1" → "$coin_1"). */
export function labelToName(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `$${slug || 'var'}`
}

/** Ensure a candidate name is unique among taken names by suffixing _2, _3, … */
export function ensureUniqueName(
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

/** Sensible initial value for a variable type — undefined means "user must pick". */
export function defaultValueForType(type: WorkspaceVariableType): unknown {
  return type === 'timeframe' ? DEFAULT_TIMEFRAME : undefined
}

/** Create a fresh variable definition with a unique name and label. */
export function createVariable(
  existing: ReadonlyArray<WorkspaceVariableDefinition>,
): WorkspaceVariableDefinition {
  const taken = new Set(existing.map((v) => v.name))
  const labels = new Set(existing.map((v) => v.label))
  let idx = existing.length + 1
  while (labels.has(`Variable ${idx}`)) idx++
  const label = `Variable ${idx}`
  return {
    name: ensureUniqueName(labelToName(label), taken),
    label,
    type: 'pair',
  }
}

/** Structural check that a stored value fits the declared variable type. */
export function valueMatchesType(
  type: WorkspaceVariableType,
  value: unknown,
): boolean {
  switch (type) {
    case 'pair': {
      const v = value as { pairKey?: unknown; market?: unknown } | null
      return (
        typeof v === 'object' &&
        v !== null &&
        typeof v.pairKey === 'string' &&
        v.pairKey.length > 0 &&
        typeof v.market === 'string' &&
        v.market.length > 0
      )
    }
    case 'wallet': {
      const v = value as { walletId?: unknown; market?: unknown } | null
      return (
        typeof v === 'object' &&
        v !== null &&
        typeof v.walletId === 'string' &&
        v.walletId.length > 0 &&
        typeof v.market === 'string' &&
        v.market.length > 0
      )
    }
    case 'timeframe':
      return typeof value === 'string' && value.length > 0
    case 'string':
      return typeof value === 'string'
  }
}

/**
 * Reconcile persisted values against the current variable definitions:
 * - drop values for variables that no longer exist
 * - drop values whose shape no longer matches the variable type
 * - fill missing values from definition defaults (or the per-type default)
 */
export function reconcileValues(
  variables: ReadonlyArray<WorkspaceVariableDefinition>,
  values: Record<string, unknown>,
): { values: Record<string, unknown>; changed: boolean } {
  const next: Record<string, unknown> = {}
  let changed = false

  for (const def of variables) {
    const current = values[def.name]
    if (def.name in values && valueMatchesType(def.type, current)) {
      next[def.name] = current
      continue
    }
    if (def.name in values) changed = true // stale shape dropped
    const fallback =
      def.defaultValue !== undefined &&
      valueMatchesType(def.type, def.defaultValue)
        ? def.defaultValue
        : defaultValueForType(def.type)
    if (fallback !== undefined) {
      next[def.name] = fallback
      changed = true
    }
  }

  // Any leftover keys in `values` that aren't in `next` mean removal
  if (!changed) {
    for (const key of Object.keys(values)) {
      if (!(key in next)) {
        changed = true
        break
      }
    }
  }

  return { values: changed ? next : values, changed }
}

/** Which variable type each bindable pane slot accepts. */
export const SLOT_VARIABLE_TYPES: Record<string, WorkspaceVariableType> = {
  'active-pair': 'pair',
  'active-wallet': 'wallet',
  'active-timeframe': 'timeframe',
}

/** A binding is valid when the variable exists and its type fits the slot. */
export function isBindingValid(
  slot: string,
  variableName: string,
  variables: ReadonlyArray<WorkspaceVariableDefinition>,
): boolean {
  const def = variables.find((v) => v.name === variableName)
  if (!def) return false
  const expected = SLOT_VARIABLE_TYPES[slot]
  return expected === undefined || def.type === expected
}

/** Count how many pane bindings across a layout reference a variable name. */
export function countVariableBindings(
  layout: TerminalLayout | null | undefined,
  name: string,
): number {
  if (!layout) return 0
  let count = 0
  for (const col of layout.columns) {
    for (const cell of col.cells) {
      for (const pane of cell.panes) {
        if (!pane.bindings) continue
        for (const bound of Object.values(pane.bindings)) {
          if (bound === name) count++
        }
      }
    }
  }
  return count
}

/** Usage count per variable name across one or more layouts. */
export function collectVariableUsage(
  layouts: ReadonlyArray<TerminalLayout | null | undefined>,
  variables: ReadonlyArray<WorkspaceVariableDefinition>,
): Record<string, number> {
  const usage: Record<string, number> = {}
  for (const def of variables) {
    usage[def.name] = layouts.reduce(
      (sum, layout) => sum + countVariableBindings(layout, def.name),
      0,
    )
  }
  return usage
}

// ── Variable editor rows ────────────────────────────────────────────────
//
// The editor works on rows, not raw definitions: `key` is a stable React
// identity, and `isNew` marks rows added in the current editing session —
// only those re-derive their internal `$name` while the label is typed.
// Pre-existing variables keep their name frozen so pane bindings and stored
// values survive a rename.

export type VariableEditorRow = {
  key: string
  def: WorkspaceVariableDefinition
  isNew: boolean
}

export function rowsFromVariables(
  variables: ReadonlyArray<WorkspaceVariableDefinition>,
): Array<VariableEditorRow> {
  return variables.map((def) => ({ key: def.name, def, isNew: false }))
}

export function variablesFromRows(
  rows: ReadonlyArray<VariableEditorRow>,
): Array<WorkspaceVariableDefinition> {
  return rows.map((r) => r.def)
}

export function addRow(
  rows: ReadonlyArray<VariableEditorRow>,
): Array<VariableEditorRow> {
  const def = createVariable(rows.map((r) => r.def))
  const takenKeys = new Set(rows.map((r) => r.key))
  let key = def.name
  let i = 2
  while (takenKeys.has(key)) key = `${def.name}~${i++}`
  return [...rows, { key, def, isNew: true }]
}

export function updateRow(
  rows: ReadonlyArray<VariableEditorRow>,
  key: string,
  patch: Partial<WorkspaceVariableDefinition>,
): Array<VariableEditorRow> {
  return rows.map((row) => {
    if (row.key !== key) return row
    const def = { ...row.def, ...patch }
    // New rows track their label with a derived, collision-free name.
    if (row.isNew && patch.label !== undefined) {
      const taken = new Set(
        rows.filter((r) => r.key !== key).map((r) => r.def.name),
      )
      def.name = ensureUniqueName(labelToName(def.label), taken)
    }
    // A type change invalidates the old value shape — reset the default.
    if (patch.type !== undefined && patch.type !== row.def.type) {
      def.defaultValue = defaultValueForType(patch.type)
    }
    return { ...row, def }
  })
}

export function removeRow(
  rows: ReadonlyArray<VariableEditorRow>,
  key: string,
): Array<VariableEditorRow> {
  return rows.filter((r) => r.key !== key)
}
