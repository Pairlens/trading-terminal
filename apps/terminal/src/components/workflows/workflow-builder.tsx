// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'

import { WorkflowSidebar } from './workflow-sidebar'
import { WorkflowCanvas } from './workflow-canvas'
import { useWorkflowStore } from '@/stores/workflow-store'

export function WorkflowBuilder() {
  const load = useWorkflowStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-full">
      <WorkflowSidebar />
      <ReactFlowProvider>
        <WorkflowCanvas />
      </ReactFlowProvider>
    </div>
  )
}
