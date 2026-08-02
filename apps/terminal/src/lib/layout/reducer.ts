// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { layoutId, normalizeLayout, pruneLayout } from './utils'
import { isBindingValid } from './variable-utils'
import type {
  LayoutAction,
  LayoutCell,
  LayoutColumn,
  PaneDefinition,
  PaneInstance,
  TerminalLayout,
  WorkspaceConfig,
} from './types'

/** Find which column/cell a pane lives in. */
function findPane(layout: TerminalLayout, paneId: string) {
  for (const col of layout.columns) {
    for (const cell of col.cells) {
      const idx = cell.panes.findIndex((p) => p.id === paneId)
      if (idx !== -1) return { column: col, cell, paneIndex: idx }
    }
  }
  return null
}

/** Check if a pane type already exists in the layout (for singleton enforcement). */
function hasPaneType(layout: TerminalLayout, type: string): boolean {
  return layout.columns.some((col) =>
    col.cells.some((cell) => cell.panes.some((p) => p.type === type)),
  )
}

/** Remove a pane from its current location, returning the updated layout and the removed pane. */
function removePaneFromLayout(layout: TerminalLayout, paneId: string) {
  const columns = layout.columns.map((col) => ({
    ...col,
    cells: col.cells.map((cell) => {
      const filtered = cell.panes.filter((p) => p.id !== paneId)
      if (filtered.length === cell.panes.length) return cell
      return {
        ...cell,
        panes: filtered,
        activeTabIndex: Math.min(
          cell.activeTabIndex,
          Math.max(0, filtered.length - 1),
        ),
      }
    }),
  }))
  return { ...layout, columns }
}

/** Update a specific pane in the layout tree by ID. */
function updatePaneInLayout(
  layout: TerminalLayout,
  paneId: string,
  updater: (pane: PaneInstance) => PaneInstance,
): TerminalLayout {
  let changed = false
  const columns = layout.columns.map((col) => ({
    ...col,
    cells: col.cells.map((cell) => ({
      ...cell,
      panes: cell.panes.map((p) => {
        if (p.id !== paneId) return p
        changed = true
        return updater(p)
      }),
    })),
  }))
  return changed ? { ...layout, columns } : layout
}

/** Create a new pane instance, auto-binding to the least-used pair variable. */
function createPaneInstance(
  paneType: string,
  paneDefinitions: Record<string, PaneDefinition>,
  workspace: WorkspaceConfig | undefined,
  layout: TerminalLayout,
): PaneInstance {
  const pane: PaneInstance = { id: layoutId(), type: paneType }
  const def = paneDefinitions[paneType]
  if (
    def?.requires?.includes('workspace:active-pair') &&
    workspace?.variables?.length
  ) {
    const pairVars = workspace.variables.filter((v) => v.type === 'pair')
    if (pairVars.length === 1) {
      pane.bindings = { 'active-pair': pairVars[0].name }
    } else if (pairVars.length > 1) {
      // Count how many existing panes are bound to each pair variable
      const usageCounts = new Map<string, number>()
      for (const v of pairVars) usageCounts.set(v.name, 0)
      for (const col of layout.columns) {
        for (const cell of col.cells) {
          for (const p of cell.panes) {
            const bound = p.bindings?.['active-pair']
            if (bound && usageCounts.has(bound)) {
              usageCounts.set(bound, usageCounts.get(bound)! + 1)
            }
          }
        }
      }
      // Pick the variable with the fewest bindings
      let leastUsed = pairVars[0].name
      let leastCount = Infinity
      for (const [name, count] of usageCounts) {
        if (count < leastCount) {
          leastCount = count
          leastUsed = name
        }
      }
      pane.bindings = { 'active-pair': leastUsed }
    }
  }
  return pane
}

export function layoutReducer(
  state: TerminalLayout,
  action: LayoutAction,
  paneDefinitions: Record<string, PaneDefinition>,
  workspace?: WorkspaceConfig,
): TerminalLayout {
  switch (action.type) {
    case 'MOVE_PANE': {
      const found = findPane(state, action.paneId)
      if (!found) return state
      const pane = found.cell.panes[found.paneIndex]

      // Remove from old location
      let next = removePaneFromLayout(state, action.paneId)

      // Add to target cell, replacing empty placeholders
      next = {
        ...next,
        columns: next.columns.map((col) => ({
          ...col,
          cells: col.cells.map((cell) => {
            if (cell.id !== action.targetCellId) return cell
            const panes = [...cell.panes].filter((p) => p.type !== 'empty')
            const insertAt = action.tabIndex ?? panes.length
            panes.splice(insertAt, 0, pane)
            return { ...cell, panes, activeTabIndex: insertAt }
          }),
        })),
      }

      return normalizeLayout(pruneLayout(next))
    }

    case 'MOVE_PANE_NEW_CELL': {
      const found = findPane(state, action.paneId)
      if (!found) return state
      const pane = found.cell.panes[found.paneIndex]

      // Remove from old location
      let next = removePaneFromLayout(state, action.paneId)

      // Create new cell in target column
      const newCell: LayoutCell = {
        id: layoutId(),
        panes: [pane],
        activeTabIndex: 0,
        heightPercent: 25, // will be normalized
      }

      next = {
        ...next,
        columns: next.columns.map((col) => {
          if (col.id !== action.targetColumnId) return col
          const cells = [...col.cells]
          cells.splice(action.cellIndex, 0, newCell)
          return { ...col, cells }
        }),
      }

      return normalizeLayout(pruneLayout(next))
    }

    case 'MOVE_PANE_NEW_COLUMN': {
      const found = findPane(state, action.paneId)
      if (!found) return state
      const pane = found.cell.panes[found.paneIndex]

      // Remove from old location
      let next = removePaneFromLayout(state, action.paneId)

      // Create new column
      const newColumn: LayoutColumn = {
        id: layoutId(),
        widthPercent: 25, // will be normalized
        cells: [
          {
            id: layoutId(),
            panes: [pane],
            activeTabIndex: 0,
            heightPercent: 100,
          },
        ],
      }

      const columns = [...next.columns]
      columns.splice(action.columnIndex, 0, newColumn)
      next = { ...next, columns }

      return normalizeLayout(pruneLayout(next))
    }

    case 'RESIZE_COLUMNS': {
      if (action.widths.length !== state.columns.length) return state
      return {
        ...state,
        columns: state.columns.map((col, i) => ({
          ...col,
          widthPercent: action.widths[i],
        })),
      }
    }

    case 'RESIZE_CELLS': {
      return {
        ...state,
        columns: state.columns.map((col) => {
          if (col.id !== action.columnId) return col
          if (action.heights.length !== col.cells.length) return col
          return {
            ...col,
            cells: col.cells.map((cell, i) => ({
              ...cell,
              heightPercent: action.heights[i],
            })),
          }
        }),
      }
    }

    case 'ADD_PANE': {
      const def = paneDefinitions[action.paneType]
      // Relax singleton when workspace has variables and pane requires active-pair
      const hasVariables =
        workspace?.variables && workspace.variables.length > 0
      const requiresPair = def?.requires?.includes('workspace:active-pair')
      const enforceSingleton = def?.singleton && !(hasVariables && requiresPair)
      if (enforceSingleton && hasPaneType(state, action.paneType)) return state

      const newPane = createPaneInstance(
        action.paneType,
        paneDefinitions,
        workspace,
        state,
      )
      return {
        ...state,
        columns: state.columns.map((col) => ({
          ...col,
          cells: col.cells.map((cell) => {
            if (cell.id !== action.targetCellId) return cell
            // If the cell only has empty placeholders, replace them
            const hasOnlyEmpty =
              cell.panes.length > 0 &&
              cell.panes.every((p) => p.type === 'empty')
            const panes = hasOnlyEmpty ? [newPane] : [...cell.panes, newPane]
            return { ...cell, panes, activeTabIndex: panes.length - 1 }
          }),
        })),
      }
    }

    case 'ADD_PANE_NEW_CELL': {
      const def = paneDefinitions[action.paneType]
      const hasVars2 = workspace?.variables && workspace.variables.length > 0
      const reqPair2 = def?.requires?.includes('workspace:active-pair')
      const enforce2 = def?.singleton && !(hasVars2 && reqPair2)
      if (enforce2 && hasPaneType(state, action.paneType)) return state

      const newCell: LayoutCell = {
        id: layoutId(),
        panes: [
          createPaneInstance(
            action.paneType,
            paneDefinitions,
            workspace,
            state,
          ),
        ],
        activeTabIndex: 0,
        heightPercent: 25, // will be normalized
      }

      return normalizeLayout({
        ...state,
        columns: state.columns.map((col) => {
          if (col.id !== action.targetColumnId) return col
          const cells = [...col.cells]
          cells.splice(action.cellIndex, 0, newCell)
          return { ...col, cells }
        }),
      })
    }

    case 'ADD_PANE_NEW_COLUMN': {
      const def = paneDefinitions[action.paneType]
      const hasVars3 = workspace?.variables && workspace.variables.length > 0
      const reqPair3 = def?.requires?.includes('workspace:active-pair')
      const enforce3 = def?.singleton && !(hasVars3 && reqPair3)
      if (enforce3 && hasPaneType(state, action.paneType)) return state

      const newColumn: LayoutColumn = {
        id: layoutId(),
        widthPercent: 25, // will be normalized
        cells: [
          {
            id: layoutId(),
            panes: [
              createPaneInstance(
                action.paneType,
                paneDefinitions,
                workspace,
                state,
              ),
            ],
            activeTabIndex: 0,
            heightPercent: 100,
          },
        ],
      }

      const columns = [...state.columns]
      columns.splice(action.columnIndex, 0, newColumn)
      return normalizeLayout({ ...state, columns })
    }

    case 'REMOVE_PANE': {
      const next = removePaneFromLayout(state, action.paneId)
      return normalizeLayout(pruneLayout(next))
    }

    case 'SET_ACTIVE_TAB': {
      return {
        ...state,
        columns: state.columns.map((col) => ({
          ...col,
          cells: col.cells.map((cell) => {
            if (cell.id !== action.cellId) return cell
            if (action.tabIndex < 0 || action.tabIndex >= cell.panes.length)
              return cell
            return { ...cell, activeTabIndex: action.tabIndex }
          }),
        })),
      }
    }

    case 'ADD_COLUMN': {
      const newColumn: LayoutColumn = {
        id: layoutId(),
        widthPercent: 25,
        cells: [
          {
            id: layoutId(),
            panes: [],
            activeTabIndex: 0,
            heightPercent: 100,
          },
        ],
      }
      const columns = [...state.columns]
      columns.splice(action.columnIndex, 0, newColumn)
      return normalizeLayout({ ...state, columns })
    }

    case 'REMOVE_COLUMN': {
      if (state.columns.length <= 1) return state
      const columns = state.columns.filter((col) => col.id !== action.columnId)
      return normalizeLayout({ ...state, columns })
    }

    case 'REORDER_TABS': {
      if (action.oldIndex === action.newIndex) return state
      return {
        ...state,
        columns: state.columns.map((col) => ({
          ...col,
          cells: col.cells.map((cell) => {
            if (cell.id !== action.cellId) return cell
            const panes = [...cell.panes]
            const [moved] = panes.splice(action.oldIndex, 1)
            if (!moved) return cell
            panes.splice(action.newIndex, 0, moved)
            return { ...cell, panes, activeTabIndex: action.newIndex }
          }),
        })),
      }
    }

    case 'APPLY_PRESET': {
      return normalizeLayout(action.layout)
    }

    case 'SET_PANE_OVERRIDE': {
      return updatePaneInLayout(state, action.paneId, (pane) => ({
        ...pane,
        overrides: { ...pane.overrides, [action.slot]: action.value },
      }))
    }

    case 'CLEAR_PANE_OVERRIDE': {
      return updatePaneInLayout(state, action.paneId, (pane) => {
        if (!pane.overrides) return pane
        const { [action.slot]: _, ...rest } = pane.overrides
        return {
          ...pane,
          overrides: Object.keys(rest).length > 0 ? rest : undefined,
        }
      })
    }

    case 'SET_PANE_BINDING': {
      return updatePaneInLayout(state, action.paneId, (pane) => ({
        ...pane,
        bindings: { ...pane.bindings, [action.slot]: action.variableName },
      }))
    }

    case 'CLEAR_PANE_BINDING': {
      return updatePaneInLayout(state, action.paneId, (pane) => {
        if (!pane.bindings) return pane
        const { [action.slot]: _, ...rest } = pane.bindings
        return {
          ...pane,
          bindings: Object.keys(rest).length > 0 ? rest : undefined,
        }
      })
    }

    case 'RECONCILE_BINDINGS': {
      let changed = false
      const columns = state.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => ({
          ...cell,
          panes: cell.panes.map((pane) => {
            if (!pane.bindings) return pane
            const kept = Object.entries(pane.bindings).filter(([slot, name]) =>
              isBindingValid(slot, name, action.variables),
            )
            if (kept.length === Object.keys(pane.bindings).length) return pane
            changed = true
            return {
              ...pane,
              bindings: kept.length > 0 ? Object.fromEntries(kept) : undefined,
            }
          }),
        })),
      }))
      return changed ? { ...state, columns } : state
    }

    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}
