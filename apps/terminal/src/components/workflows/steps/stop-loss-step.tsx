// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Handle, Position } from '@xyflow/react'
import { ShieldAlert } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Slider } from '@pairlens/ui/components/ui/slider'
import { useStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'
import type { StopLossStepData } from '@pairlens/workflow-engine/types'

export function StopLossStep({ id, data }: NodeProps) {
  const { t } = useTranslation()
  const d = data as unknown as StopLossStepData
  const triggerMode = d.triggerMode ?? 'percent'
  const triggerValue = d.triggerValue ?? 3
  const sizePercent = d.sizePercent ?? 100

  const updateStepData = useStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  return (
    <div
      className={cn(
        'w-[210px] rounded-lg border border-red-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-red-500/10',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !rounded-full !border-2 !border-red-500 !bg-background"
      />

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-red-500/15">
          <ShieldAlert className="size-3.5 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            {t('workflows.steps.stopLoss.title')}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Trigger mode */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('workflows.steps.triggerWhenPrice')}
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            <button
              type="button"
              className={cn(
                'flex-1 px-1.5 py-0.5 transition-colors',
                triggerMode === 'percent'
                  ? 'bg-red-500/15 text-red-400'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleChange('triggerMode', 'percent')}
            >
              {t('workflows.steps.triggerPercentFromEntry')}
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 px-1.5 py-0.5 transition-colors',
                triggerMode === 'absolute'
                  ? 'bg-red-500/15 text-red-400'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleChange('triggerMode', 'absolute')}
            >
              {t('workflows.steps.triggerReachesPrice')}
            </button>
          </div>
        </div>

        {/* Trigger value */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {triggerMode === 'percent'
              ? t('workflows.steps.stopLoss.lossPercent')
              : t('workflows.steps.priceLevel')}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            {triggerMode === 'percent' && (
              <span className="text-[10px] text-red-400">-</span>
            )}
            <input
              type="number"
              className="nodrag nopan nowheel h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={triggerValue}
              onChange={(e) =>
                handleChange('triggerValue', parseFloat(e.target.value) || 0)
              }
            />
            {triggerMode === 'percent' && (
              <span className="text-[10px] text-muted-foreground">%</span>
            )}
          </div>
        </div>

        {/* Close % */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('workflows.steps.side.sell')}
            </div>
            <div className="font-mono text-[10px] font-medium text-red-400">
              {sizePercent}%
            </div>
          </div>
          <Slider
            className="nodrag nopan nowheel mt-1"
            value={[sizePercent]}
            min={1}
            max={100}
            onValueChange={(value) =>
              handleChange(
                'sizePercent',
                Array.isArray(value) ? value[0] : value,
              )
            }
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !rounded-full !border-2 !border-red-500 !bg-background"
      />
    </div>
  )
}
