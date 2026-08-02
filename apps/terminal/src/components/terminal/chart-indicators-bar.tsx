// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { IndicatorSettingsDialog } from './indicator-settings-dialog'
import { hasEditableParams } from './indicator-params'
import type {
  ChartTopBarPayload,
  IndicatorInstance,
} from 'fast-financial-charts/types'
import { getIndicatorDisplayLabel } from '@/lib/indicators/custom-indicator-definitions'
import { useOptionalChartActions } from '@/lib/chart-terminal-context'

function formatIndicatorLabel(ind: IndicatorInstance): string {
  // Built-in types display as their type code; custom types as their title.
  const label = getIndicatorDisplayLabel(ind.type)
  const period = ind.params?.period
  if (typeof period === 'number') return `${label} (${period})`
  return label
}

type ChartIndicatorsBarProps = {
  topbar: ChartTopBarPayload
  onRemoveIndicator: (id: string) => void
}

export function ChartIndicatorsBar({
  topbar,
  onRemoveIndicator,
}: ChartIndicatorsBarProps) {
  const { t } = useTranslation()
  const actions = useOptionalChartActions()
  const [settingsTarget, setSettingsTarget] =
    useState<IndicatorInstance | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground font-mono">
        {topbar.viewport.startIndex}–{topbar.viewport.endIndex}
      </span>

      {topbar.indicators.length > 0 && (
        <>
          <span className="text-muted-foreground/40">|</span>
          {topbar.indicators.map((ind) => (
            <Badge
              key={ind.id}
              variant="secondary"
              className="gap-1 pr-1 text-[11px]"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: ind.color }}
              />
              {formatIndicatorLabel(ind)}
              {actions !== null && hasEditableParams(ind.type) && (
                <button
                  type="button"
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSettingsTarget(ind)
                  }}
                >
                  <Settings2 className="size-2.5" />
                  <span className="sr-only">
                    {t('indicators.settings.edit', {
                      type: getIndicatorDisplayLabel(ind.type),
                    })}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveIndicator(ind.id)
                }}
              >
                <X className="size-2.5" />
                <span className="sr-only">Remove {ind.type}</span>
              </button>
            </Badge>
          ))}
        </>
      )}

      {actions !== null && (
        <IndicatorSettingsDialog
          target={settingsTarget}
          onOpenChange={(open) => {
            if (!open) setSettingsTarget(null)
          }}
          onApply={actions.updateIndicator}
        />
      )}
    </div>
  )
}
