// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type PaneType = string

export type PaneCategory = string

export type PaneDefinition = {
  type: string
  labelKey: string // i18n translation key (resolved via t() at render time)
  icon: string // lucide icon name
  descriptionKey?: string // i18n translation key for pane description
  category?: PaneCategory
  minHeight?: number // px
  singleton?: boolean // only one instance allowed
  compact?: boolean // skip pane header when solo in a cell
  fitContent?: boolean // size to content height instead of filling available space
  requires?: Array<string> // 'workspace:*' for context, CapabilityId for data
  requiredAccessLevel?: string // subscription tier required (e.g. 'pro', 'max')
}

export type PaneInstance = {
  id: string
  type: string
  bindings?: Record<string, string> // slot → variable name (e.g. 'active-pair' → '$coin1')
  overrides?: Record<string, unknown> // slot → literal value (e.g. 'active-pair' → { pairKey, market })
}

export type LayoutCell = {
  id: string
  panes: Array<PaneInstance> // 1+ panes; >1 renders as tabs
  activeTabIndex: number
  heightPercent: number
}

export type LayoutColumn = {
  id: string
  cells: Array<LayoutCell>
  widthPercent: number
}

export type TerminalLayout = {
  version: 1
  columns: Array<LayoutColumn>
}

export type DropZone = {
  cellId: string
  zone: 'center' | 'top' | 'bottom' | 'left' | 'right'
}

export type LayoutAction =
  | {
      type: 'MOVE_PANE'
      paneId: string
      targetCellId: string
      tabIndex?: number
    }
  | {
      type: 'MOVE_PANE_NEW_CELL'
      paneId: string
      targetColumnId: string
      cellIndex: number
    }
  | { type: 'MOVE_PANE_NEW_COLUMN'; paneId: string; columnIndex: number }
  | { type: 'RESIZE_COLUMNS'; widths: Array<number> }
  | { type: 'RESIZE_CELLS'; columnId: string; heights: Array<number> }
  | { type: 'ADD_PANE'; paneType: PaneType; targetCellId: string }
  | {
      type: 'ADD_PANE_NEW_CELL'
      paneType: PaneType
      targetColumnId: string
      cellIndex: number
    }
  | { type: 'ADD_PANE_NEW_COLUMN'; paneType: PaneType; columnIndex: number }
  | { type: 'REMOVE_PANE'; paneId: string }
  | { type: 'SET_ACTIVE_TAB'; cellId: string; tabIndex: number }
  | { type: 'ADD_COLUMN'; columnIndex: number }
  | { type: 'REMOVE_COLUMN'; columnId: string }
  | { type: 'REORDER_TABS'; cellId: string; oldIndex: number; newIndex: number }
  | { type: 'APPLY_PRESET'; layout: TerminalLayout }
  | { type: 'SET_PANE_OVERRIDE'; paneId: string; slot: string; value: unknown }
  | { type: 'CLEAR_PANE_OVERRIDE'; paneId: string; slot: string }
  | {
      type: 'SET_PANE_BINDING'
      paneId: string
      slot: string
      variableName: string
    }
  | { type: 'CLEAR_PANE_BINDING'; paneId: string; slot: string }
  | {
      // Drop bindings to variables that were deleted or retyped
      type: 'RECONCILE_BINDINGS'
      variables: Array<WorkspaceVariableDefinition>
    }

export type ScreenPresetGroup = {
  label: string
  icon: string // lucide icon name
  presets: Array<{ key: string; label: string; layout: TerminalLayout }>
}

export type WorkspaceVariableType = 'pair' | 'timeframe' | 'wallet' | 'string'

export type WorkspaceVariableDefinition = {
  name: string // always starts with '$', e.g. '$coin1'
  label: string // display name
  type: WorkspaceVariableType
  defaultValue?: unknown
}

export type WorkspaceConfig = {
  id?: string // needed for custom workspace persistence key
  storageKey: string
  defaultPreset: TerminalLayout
  presets: Record<string, { label: string; layout: TerminalLayout }>
  screenPresets?: Array<ScreenPresetGroup>
  variables?: Array<WorkspaceVariableDefinition>
}

export type CustomWorkspaceDefinition = {
  id: string
  name: string
  description?: string
  icon?: string // lucide icon name
  variables: Array<WorkspaceVariableDefinition>
  defaultLayout: TerminalLayout
  folderId?: string | null // null/undefined = root level
  order?: number
  createdAt: number
  updatedAt: number
}

export type WorkspaceFolder = {
  id: string
  name: string
  parentId: string | null // null = root level
  order: number
}
