// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'

import { layoutReducer } from './reducer'
import { loadLayout, saveLayoutDebounced } from './persistence'
import { normalizeLayout } from './utils'
import { useWorkspace } from './workspace-context'
import { usePaneRegistry } from './pane-registry'
import type { ReactNode } from 'react'
import type { DropZone, LayoutAction, TerminalLayout } from './types'
import { track } from '@/lib/analytics-events'
import {
  reportLayoutSnapshot,
  reportVisiblePanes,
  visiblePaneTypes,
  workspaceAnalyticsKind,
} from '@/lib/analytics-panels'
import { usePaneAddRequestStore } from '@/stores/pane-add-request-store'

type LayoutContextValue = {
  layout: TerminalLayout
  dispatch: (action: LayoutAction) => void
  pendingAddPaneType: string | null
  startAddPane: (type: string) => void
  cancelAddPane: () => void
  confirmAddPane: (cellId: string, zone?: DropZone['zone']) => void
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace()
  const registry = usePaneRegistry()

  const [layout, rawDispatch] = useReducer(
    (state: TerminalLayout, action: LayoutAction) =>
      layoutReducer(state, action, registry.getDefinitions(), workspace),
    null,
    () => loadLayout(workspace.storageKey, workspace.defaultPreset),
  )

  // Pre-action layout for analytics lookups inside the stable dispatch
  // callback (SET_ACTIVE_TAB doesn't change pane identity, so resolving
  // against the previous state is safe).
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const dispatch = useCallback((action: LayoutAction) => {
    if (action.type === 'SET_ACTIVE_TAB') {
      const cell = layoutRef.current.columns
        .flatMap((c) => c.cells)
        .find((c) => c.id === action.cellId)
      const pane = cell?.panes[action.tabIndex]
      if (pane && cell.activeTabIndex !== action.tabIndex) {
        track('panel_focused', { pane_type: pane.type })
      }
    } else if (
      action.type === 'ADD_PANE' ||
      action.type === 'ADD_PANE_NEW_CELL' ||
      action.type === 'ADD_PANE_NEW_COLUMN'
    ) {
      track('panel_added', { pane_type: action.paneType })
    } else if (action.type === 'REMOVE_PANE') {
      track('panel_removed')
    }
    rawDispatch(action)
  }, [])

  // Workspace & panel observability: which surface is open, what it's
  // composed of, and how long each pane type is actually on screen. All
  // consent-gated no-ops via track(); dwell/snapshot logic lives in
  // analytics-panels.ts.
  const workspaceKind = workspaceAnalyticsKind(workspace.storageKey)

  useEffect(() => {
    track('workspace_opened', { workspace: workspaceKind })
  }, [workspaceKind])

  useEffect(() => {
    reportVisiblePanes(workspaceKind, visiblePaneTypes(layout))
    reportLayoutSnapshot(workspaceKind, layout)
  }, [layout, workspaceKind])

  // Stop the dwell clock when this layout leaves the screen.
  useEffect(() => {
    return () => reportVisiblePanes(workspaceKind, [])
  }, [workspaceKind])

  const [pendingAddPaneType, setPendingAddPaneType] = useState<string | null>(
    null,
  )

  const startAddPane = useCallback((type: string) => {
    setPendingAddPaneType(type)
  }, [])

  const cancelAddPane = useCallback(() => {
    setPendingAddPaneType(null)
  }, [])

  const confirmAddPane = useCallback(
    (cellId: string, zone?: DropZone['zone']) => {
      if (!pendingAddPaneType) return

      if (!zone || zone === 'center') {
        dispatch({
          type: 'ADD_PANE',
          paneType: pendingAddPaneType,
          targetCellId: cellId,
        })
      } else if (zone === 'top' || zone === 'bottom') {
        for (const col of layout.columns) {
          const cellIdx = col.cells.findIndex((c) => c.id === cellId)
          if (cellIdx !== -1) {
            dispatch({
              type: 'ADD_PANE_NEW_CELL',
              paneType: pendingAddPaneType,
              targetColumnId: col.id,
              cellIndex: zone === 'top' ? cellIdx : cellIdx + 1,
            })
            break
          }
        }
      } else {
        const colIdx = layout.columns.findIndex((col) =>
          col.cells.some((c) => c.id === cellId),
        )
        if (colIdx !== -1) {
          dispatch({
            type: 'ADD_PANE_NEW_COLUMN',
            paneType: pendingAddPaneType,
            columnIndex: zone === 'left' ? colIdx : colIdx + 1,
          })
        }
      }

      setPendingAddPaneType(null)
    },
    [pendingAddPaneType, dispatch, layout.columns],
  )

  // Persist layout changes
  useEffect(() => {
    saveLayoutDebounced(normalizeLayout(layout), workspace.storageKey)
  }, [layout, workspace.storageKey])

  // Consume pane-add requests coming from the omni search palette.
  const requestedPaneType = usePaneAddRequestStore((s) => s.requestedPaneType)
  useEffect(() => {
    if (!requestedPaneType) return
    if (registry.getDefinitions()[requestedPaneType]) {
      setPendingAddPaneType(requestedPaneType)
    }
    usePaneAddRequestStore.getState().clear()
  }, [requestedPaneType, registry])

  const contextValue = useMemo(
    () => ({
      layout,
      dispatch,
      pendingAddPaneType,
      startAddPane,
      cancelAddPane,
      confirmAddPane,
    }),
    [
      layout,
      dispatch,
      pendingAddPaneType,
      startAddPane,
      cancelAddPane,
      confirmAddPane,
    ],
  )

  return <LayoutContext value={contextValue}>{children}</LayoutContext>
}

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within a LayoutProvider')
  return ctx
}
