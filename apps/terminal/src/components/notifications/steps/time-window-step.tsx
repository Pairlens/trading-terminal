// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position } from '@xyflow/react'
import { Clock } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'

export function TimeWindowStep({ id, data }: NodeProps) {
  const startHour = (data.startHour as number) ?? 9
  const endHour = (data.endHour as number) ?? 17

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`

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
          <Clock className="size-3.5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            Time Window
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
        {/* Start hour */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Start (UTC)
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={23}
              step={1}
              className="nodrag nopan nowheel h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={startHour}
              onChange={(e) =>
                handleChange(
                  'startHour',
                  Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)),
                )
              }
            />
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
              {formatHour(startHour)}
            </span>
          </div>
        </div>

        {/* End hour */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            End (UTC)
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={23}
              step={1}
              className="nodrag nopan nowheel h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={endHour}
              onChange={(e) =>
                handleChange(
                  'endHour',
                  Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)),
                )
              }
            />
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
              {formatHour(endHour)}
            </span>
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
