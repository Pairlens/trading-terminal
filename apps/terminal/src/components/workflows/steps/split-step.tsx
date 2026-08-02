// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import { GitFork } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@pairlens/ui'
import { useStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'
import type { SplitStepData } from '@pairlens/workflow-engine/types'

export function SplitStep({ id, data }: NodeProps) {
  const d = data as unknown as SplitStepData
  const branches = d.branches ?? 2

  const updateStepData = useStepDataUpdate()
  const updateNodeInternals = useUpdateNodeInternals()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  // Tell ReactFlow to recalculate handle positions when branch count changes
  useEffect(() => {
    updateNodeInternals(id)
  }, [branches, id, updateNodeInternals])

  // Generate evenly spaced output handles
  const handles = Array.from({ length: branches }, (_, i) => ({
    id: `branch-${i}`,
    left: `${((i + 1) / (branches + 1)) * 100}%`,
  }))

  return (
    <div
      className={cn(
        'w-[210px] rounded-lg border border-purple-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-purple-500/10',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !rounded-full !border-2 !border-purple-500 !bg-background"
      />

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-purple-500/15">
          <GitFork className="size-3.5 text-purple-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            Parallel Split
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Branches */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Branches
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex items-center gap-1">
            <button
              type="button"
              className="h-6 rounded border border-border px-2 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
              disabled={branches <= 2}
              onClick={() => handleChange('branches', branches - 1)}
            >
              -
            </button>
            <span className="flex-1 text-center font-mono text-[10px] font-medium text-foreground">
              {branches}
            </span>
            <button
              type="button"
              className="h-6 rounded border border-border px-2 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
              disabled={branches >= 8}
              onClick={() => handleChange('branches', branches + 1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic output handles */}
      {handles.map((h) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Bottom}
          id={h.id}
          style={{ left: h.left }}
          className="!size-3 !rounded-full !border-2 !border-purple-500 !bg-background"
        />
      ))}
    </div>
  )
}
