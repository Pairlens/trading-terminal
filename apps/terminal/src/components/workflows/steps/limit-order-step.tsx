// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position } from '@xyflow/react'
import { Clock } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { useStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'
import type { LimitOrderStepData } from '@pairlens/workflow-engine/types'

const sideOptions = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'opposite', label: 'Opposite' },
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const

const priceModeOptions = [
  { value: 'absolute', label: 'Fixed' },
  { value: 'offset-percent', label: '% Offset' },
  { value: 'offset-absolute', label: 'Offset' },
] as const

export function LimitOrderStep({ id, data }: NodeProps) {
  const d = data as unknown as LimitOrderStepData
  const side = d.side ?? 'inherit'
  const sizeMode = d.sizeMode ?? 'percent'
  const size = d.size ?? 100
  const priceMode = d.priceMode ?? 'offset-percent'
  const priceValue = d.priceValue ?? 0

  const updateStepData = useStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  return (
    <div
      className={cn(
        'w-[210px] rounded-lg border border-indigo-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-indigo-500/10',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !rounded-full !border-2 !border-indigo-500 !bg-background"
      />

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15">
          <Clock className="size-3.5 text-indigo-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            Limit Order
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Side */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Side
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            {sideOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'flex-1 px-1.5 py-0.5 transition-colors',
                  side === opt.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleChange('side', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Size
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="number"
              className="nodrag nopan nowheel h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={size}
              onChange={(e) =>
                handleChange('size', parseFloat(e.target.value) || 0)
              }
            />
            <button
              type="button"
              className={cn(
                'nodrag nopan nowheel h-6 shrink-0 rounded border border-border px-1.5 text-[9px] font-medium transition-colors',
                sizeMode === 'percent'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() =>
                handleChange(
                  'sizeMode',
                  sizeMode === 'percent' ? 'absolute' : 'percent',
                )
              }
            >
              {sizeMode === 'percent' ? '%' : 'Abs'}
            </button>
          </div>
        </div>

        {/* Price Mode */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Price
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            {priceModeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'flex-1 px-1.5 py-0.5 transition-colors',
                  priceMode === opt.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleChange('priceMode', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price Value */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Price Value
          </div>
          <input
            type="number"
            className="nodrag nopan nowheel mt-0.5 h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            value={priceValue}
            onChange={(e) =>
              handleChange('priceValue', parseFloat(e.target.value) || 0)
            }
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !rounded-full !border-2 !border-indigo-500 !bg-background"
      />
    </div>
  )
}
