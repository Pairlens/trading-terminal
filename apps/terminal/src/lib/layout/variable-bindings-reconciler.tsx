// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'

import { useLayout } from './context'
import { useWorkspaceVariables } from './workspace-variables-context'

/**
 * Keeps pane bindings consistent with the workspace variable definitions:
 * when a variable is deleted or retyped, bindings referencing it are cleared
 * so panes fall back to overrides/global instead of silently dangling.
 *
 * Mount once inside both LayoutProvider and WorkspaceVariablesProvider.
 */
export function VariableBindingsReconciler() {
  const { dispatch } = useLayout()
  const { variables } = useWorkspaceVariables()

  useEffect(() => {
    dispatch({ type: 'RECONCILE_BINDINGS', variables })
  }, [dispatch, variables])

  return null
}
