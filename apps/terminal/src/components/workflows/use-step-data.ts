// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'

import { useWorkflowStore } from '@/stores/workflow-store'

/**
 * Hook that updates step data in both ReactFlow (for immediate UI update)
 * and the workflow store (for persistence and change tracking).
 */
export function useStepDataUpdate() {
  const { updateNodeData: rfUpdateNodeData } = useReactFlow()
  const storeUpdateStepData = useWorkflowStore((s) => s.updateStepData)

  return useCallback(
    (stepId: string, data: Record<string, unknown>) => {
      rfUpdateNodeData(stepId, data)
      storeUpdateStepData(stepId, data)
    },
    [rfUpdateNodeData, storeUpdateStepData],
  )
}
