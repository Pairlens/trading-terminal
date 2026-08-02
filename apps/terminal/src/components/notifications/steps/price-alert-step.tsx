// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position } from '@xyflow/react'
import { ArrowDown, ArrowUp, TrendingUp } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'

export function PriceAlertStep({ id, data }: NodeProps) {
  const direction = (data.direction as string) ?? 'above'
  const price = (data.price as number) ?? 0

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  const DirectionIcon = direction === 'above' ? ArrowUp : ArrowDown

  return (
    <div
      className={cn(
        'w-[200px] rounded-lg border border-emerald-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-emerald-500/10',
        !!data.disconnected && 'border-emerald-500/20 opacity-60',
        !!data.isNew && 'ring-1 ring-emerald-400/50',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15">
          <TrendingUp className="size-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            Price Alert
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-[10px] text-emerald-400"
        >
          Event
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Direction */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Direction
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            <button
              type="button"
              className={cn(
                'flex flex-1 items-center justify-center gap-1 px-1.5 py-0.5 transition-colors',
                direction === 'above'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleChange('direction', 'above')}
            >
              <ArrowUp className="size-2.5" />
              Above
            </button>
            <button
              type="button"
              className={cn(
                'flex flex-1 items-center justify-center gap-1 px-1.5 py-0.5 transition-colors',
                direction === 'below'
                  ? 'bg-red-500/15 text-red-400'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleChange('direction', 'below')}
            >
              <ArrowDown className="size-2.5" />
              Below
            </button>
          </div>
        </div>

        {/* Price */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Price
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <DirectionIcon
              className={cn(
                'size-3 shrink-0',
                direction === 'above' ? 'text-emerald-400' : 'text-red-400',
              )}
            />
            <input
              type="number"
              min={0}
              step={0.01}
              className="nodrag nopan nowheel h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={price}
              onChange={(e) =>
                handleChange('price', parseFloat(e.target.value) || 0)
              }
            />
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !rounded-full !border-2 !border-emerald-500 !bg-background"
      />
    </div>
  )
}
