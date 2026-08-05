// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Handle, Position } from '@xyflow/react'
import { Timer } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { useStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'
import type { WaitStepData } from '@pairlens/workflow-engine/types'

export function WaitStep({ id, data }: NodeProps) {
  const { t } = useTranslation()
  const unitOptions = [
    { value: 'seconds', label: t('workflows.steps.wait.unitSeconds') },
    { value: 'minutes', label: t('workflows.steps.wait.unitMinutes') },
    { value: 'hours', label: t('workflows.steps.wait.unitHours') },
  ] as const

  const d = data as unknown as WaitStepData
  const duration = d.duration ?? 5
  const unit = d.unit ?? 'seconds'

  const updateStepData = useStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  return (
    <div
      className={cn(
        'w-[210px] rounded-lg border border-sky-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-sky-500/10',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !rounded-full !border-2 !border-sky-500 !bg-background"
      />

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15">
          <Timer className="size-3.5 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            {t('workflows.steps.wait.title')}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('workflows.steps.wait.durationLabel')}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="number"
              min={1}
              className="nodrag nopan nowheel h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={duration}
              onChange={(e) =>
                handleChange(
                  'duration',
                  Math.max(1, parseInt(e.target.value, 10) || 1),
                )
              }
            />
            <div className="nodrag nopan nowheel flex shrink-0 overflow-hidden rounded border border-border text-[9px]">
              {unitOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'px-1.5 py-0.5 transition-colors',
                    unit === opt.value
                      ? 'bg-sky-500/15 text-sky-400'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => handleChange('unit', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !rounded-full !border-2 !border-sky-500 !bg-background"
      />
    </div>
  )
}
