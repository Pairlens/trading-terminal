// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Workflows page: the list of order plans, and the canvas.
 *
 * Same shell as the script workbench and the Bots page. What the assistant
 * writes here lands as uncommitted changes on the canvas, so the commit bar
 * stays the one thing that makes a workflow real.
 */
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
    <div className="flex h-full min-h-0">
      <WorkflowSidebar />
      <div className="flex h-full min-w-0 flex-1">
        <ReactFlowProvider>
          <WorkflowCanvas />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
