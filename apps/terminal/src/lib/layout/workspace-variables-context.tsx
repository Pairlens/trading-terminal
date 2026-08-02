// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext, useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { ReactNode } from 'react'
import type { StoreApi } from 'zustand'

import type { WorkspaceVariableDefinition } from './types'
import type { WorkspaceVariablesState } from '@/stores/workspace-variables-store'
import {
  destroyVarStore,
  ensureVarStoreRegistered,
  getOrCreateVarStore,
} from '@/stores/workspace-variables-store'

type WorkspaceVariablesContextValue = {
  variables: Array<WorkspaceVariableDefinition>
  store: StoreApi<WorkspaceVariablesState>
}

const WorkspaceVariablesContext =
  createContext<WorkspaceVariablesContextValue | null>(null)

export function WorkspaceVariablesProvider({
  workspaceId,
  variables,
  children,
}: {
  workspaceId: string
  variables: Array<WorkspaceVariableDefinition>
  children: ReactNode
}) {
  const store = useMemo(() => getOrCreateVarStore(workspaceId), [workspaceId])

  // Align stored values with the current definitions on mount and whenever
  // the definitions change (variable added/removed/retyped in the editor).
  useEffect(() => {
    store.getState().reconcile(variables)
  }, [store, variables])

  // Keep the registry pointing at the store this tree holds (StrictMode
  // re-runs this effect after its cleanup already destroyed the entry),
  // and clean up on unmount to allow GC.
  useEffect(() => {
    ensureVarStoreRegistered(workspaceId, store)
    return () => {
      destroyVarStore(workspaceId)
    }
  }, [workspaceId, store])

  const value = useMemo(() => ({ variables, store }), [variables, store])

  return (
    <WorkspaceVariablesContext value={value}>
      {children}
    </WorkspaceVariablesContext>
  )
}

/** Access workspace variable definitions and store. */
export function useWorkspaceVariables() {
  const ctx = useContext(WorkspaceVariablesContext)
  if (!ctx)
    throw new Error(
      'useWorkspaceVariables must be used within a WorkspaceVariablesProvider',
    )
  return ctx
}

/** Read a single variable value from the Zustand store (P1: selector-based). */
export function useWorkspaceVarValue(
  variableName: string | undefined,
): unknown {
  const ctx = useContext(WorkspaceVariablesContext)

  // Use useStore unconditionally but with a no-op selector when no context
  const dummyStore = useMemo(
    () =>
      ctx?.store ?? {
        getState: () => ({ values: {} }),
        subscribe: () => () => {},
        setState: () => {},
        getInitialState: () => ({ values: {} }),
        destroy: () => {},
      },
    [ctx?.store],
  ) as StoreApi<WorkspaceVariablesState>

  return useStore(dummyStore, (s) =>
    variableName ? s.values[variableName] : undefined,
  )
}

/** Check if workspace variables context is available. */
export function useHasWorkspaceVariables(): boolean {
  return useContext(WorkspaceVariablesContext) !== null
}

/** Access workspace variable context without throwing — returns null when outside provider. */
export function useOptionalWorkspaceVariables(): WorkspaceVariablesContextValue | null {
  return useContext(WorkspaceVariablesContext)
}
