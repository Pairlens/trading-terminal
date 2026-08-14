// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The rolling-move node: "5% in an hour", as a trigger rather than a filter.
 *
 * Distinct from the Percent Change CONDITION next to it in the palette —
 * that one tests whatever change its upstream event carries, this one is the
 * event, and it names the window it measures over.
 */
import { useTranslation } from 'react-i18next'
import { Handle, Position } from '@xyflow/react'
import { TrendingUpDown } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'

import { PERCENT_WINDOWS } from '@pairlens/notification-engine/simple-alerts'

import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'

export function PercentMoveStep({ id, data }: NodeProps) {
  const { t } = useTranslation()
  const percent = (data.percent as number) ?? 5
  const direction = (data.direction as string) ?? 'either'
  const window = (data.window as string) ?? '1h'

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  const directionOptions = [
    { value: 'up', label: t('notifications.builder.up') },
    { value: 'down', label: t('notifications.builder.down') },
    { value: 'either', label: t('notifications.builder.either') },
  ] as const

  return (
    <div
      className={cn(
        'w-[210px] rounded-lg border border-emerald-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-emerald-500/10',
        !!data.disconnected && 'border-emerald-500/20 opacity-60',
        !!data.isNew && 'ring-1 ring-emerald-400/50',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15">
          <TrendingUpDown className="size-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            {t('notifications.builder.steps.percentMove.title')}
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-[10px] text-emerald-400"
        >
          {t('notifications.builder.category.event')}
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Direction */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('notifications.builder.direction')}
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            {directionOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex-1 px-1.5 py-0.5 transition-colors',
                  direction === option.value
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleChange('direction', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5">
          {/* Percent */}
          <div className="flex-1">
            <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('notifications.builder.steps.percentChange.percent')}
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

          {/* Window */}
          <div className="w-[78px]">
            <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('notifications.simple.within')}
            </div>
            <select
              className="nodrag nopan nowheel mt-0.5 h-6 w-full rounded border border-border bg-background px-1 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              value={window}
              onChange={(e) => handleChange('window', e.target.value)}
            >
              {PERCENT_WINDOWS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
