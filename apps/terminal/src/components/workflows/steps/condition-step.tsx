// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { useStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'
import type { ConditionStepData } from '@pairlens/workflow-engine/types'

const conditionTypeOptions = [
  { value: 'price-above', label: '>' },
  { value: 'price-below', label: '<' },
  { value: 'percent-change', label: '% Change' },
] as const

export function ConditionStep({ id, data }: NodeProps) {
  const d = data as unknown as ConditionStepData
  const conditionType = d.conditionType ?? 'price-above'
  const value = d.value ?? 0

  const updateStepData = useStepDataUpdate()
  const handleChange = (key: string, val: unknown) =>
    updateStepData(id, { [key]: val })

  return (
    <div
      className={cn(
        'w-[210px] rounded-lg border border-amber-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-amber-500/10',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !rounded-full !border-2 !border-amber-500 !bg-background"
      />

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
          <GitBranch className="size-3.5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            Condition
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Condition Type */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Type
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            {conditionTypeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'flex-1 px-1.5 py-0.5 transition-colors',
                  conditionType === opt.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleChange('conditionType', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Value */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {conditionType === 'percent-change' ? '% from entry' : 'Price'}
          </div>
          <input
            type="number"
            className="nodrag nopan nowheel mt-0.5 h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            value={value}
            onChange={(e) =>
              handleChange('value', parseFloat(e.target.value) || 0)
            }
          />
          {conditionType === 'percent-change' && (
            <div className="mt-0.5 text-[9px] text-muted-foreground">
              +N passes when up ≥N%, -N when down ≥N%
            </div>
          )}
        </div>
      </div>

      {/* Pass handle (bottom-left) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="pass"
        style={{ left: '33%' }}
        className="!size-3 !rounded-full !border-2 !border-emerald-500 !bg-emerald-500"
      />

      {/* Fail handle (bottom-right) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="fail"
        style={{ left: '67%' }}
        className="!size-3 !rounded-full !border-2 !border-red-500 !bg-red-500"
      />
    </div>
  )
}
