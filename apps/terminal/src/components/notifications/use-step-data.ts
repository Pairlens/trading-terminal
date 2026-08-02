// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'

import { useNotificationStore } from '@/stores/notification-store'

/**
 * Hook that updates notification step data in both ReactFlow (for immediate
 * UI update) and the notification store (for persistence and change tracking).
 */
export function useNotificationStepDataUpdate() {
  const { updateNodeData: rfUpdateNodeData } = useReactFlow()
  const storeUpdateStepData = useNotificationStore((s) => s.updateStepData)

  return useCallback(
    (stepId: string, data: Record<string, unknown>) => {
      rfUpdateNodeData(stepId, data)
      storeUpdateStepData(stepId, data)
    },
    [rfUpdateNodeData, storeUpdateStepData],
  )
}
