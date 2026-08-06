// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Handle, Position } from '@xyflow/react'
import { SquareFunction } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'

// Alert conditions confirm on a closed bar, so the step picks the timeframe
// whose closes it watches — same control the other candle-driven events use.
const timeframeOptions = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
] as const

export function IndicatorAlertStep({ id, data }: NodeProps) {
  const { t } = useTranslation()
  const timeframe = (data.timeframe as string) ?? '1h'
  const indicator = (data.indicator as string) ?? ''
  const condition = (data.condition as string) ?? ''

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

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
          <SquareFunction className="size-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            {t('notifications.builder.steps.indicatorAlert.title')}
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
        {/* Timeframe */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('chart.toolbar.timeframe')}
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            {timeframeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'flex-1 px-1 py-0.5 transition-colors',
                  timeframe === opt.value
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleChange('timeframe', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Indicator — blank matches every script that declares an alert */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('notifications.builder.steps.indicatorAlert.indicator')}
          </div>
          <input
            type="text"
            className="nodrag nopan nowheel mt-0.5 h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            placeholder={t(
              'notifications.builder.steps.indicatorAlert.anyIndicatorPlaceholder',
            )}
            value={indicator}
            onChange={(e) => handleChange('indicator', e.target.value)}
          />
        </div>

        {/* Condition — blank matches every condition of the matched script */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('notifications.builder.steps.indicatorAlert.condition')}
          </div>
          <input
            type="text"
            className="nodrag nopan nowheel mt-0.5 h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            placeholder={t(
              'notifications.builder.steps.indicatorAlert.anyConditionPlaceholder',
            )}
            value={condition}
            onChange={(e) => handleChange('condition', e.target.value)}
          />
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
