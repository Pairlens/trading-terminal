// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

import type { WorkspaceConfig } from './types'

const WorkspaceContext = createContext<WorkspaceConfig | null>(null)

export function WorkspaceProvider({
  config,
  children,
}: {
  config: WorkspaceConfig
  children: ReactNode
}) {
  return <WorkspaceContext value={config}>{children}</WorkspaceContext>
}

export function useWorkspace(): WorkspaceConfig {
  const ctx = useContext(WorkspaceContext)
  if (!ctx)
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return ctx
}
