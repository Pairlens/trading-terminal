// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position } from '@xyflow/react'
import { Percent } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'

const directionOptions = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'either', label: 'Either' },
] as const

export function PercentChangeStep({ id, data }: NodeProps) {
  const percent = (data.percent as number) ?? 5
  const direction = (data.direction as string) ?? 'either'

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  return (
    <div
      className={cn(
        'w-[200px] rounded-lg border border-amber-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-amber-500/10',
        !!data.disconnected && 'border-amber-500/20 opacity-60',
        !!data.isNew && 'ring-1 ring-amber-400/50',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !rounded-full !border-2 !border-amber-500 !bg-background"
      />

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
          <Percent className="size-3.5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            Percent Change
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-amber-500/30 text-[10px] text-amber-400"
        >
          Condition
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Percent */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Percent
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={0.1}
              className="nodrag nopan nowheel h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={percent}
              onChange={(e) =>
                handleChange('percent', parseFloat(e.target.value) || 0)
              }
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        </div>

        {/* Direction */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Direction
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            {directionOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'flex-1 px-1.5 py-0.5 transition-colors',
                  direction === opt.value
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleChange('direction', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
