// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'

import type {
  CustomIndicatorInputSpec,
  CustomIndicatorMeta,
} from '@pairlens/shared/plugin-types'

function inputSummary(input: CustomIndicatorInputSpec): string {
  return `${input.key} = ${String(input.default)}`
}

/**
 * Compact read-out of the metadata the last successful run extracted — what
 * the chart's indicator picker will see (title, pane, params, series).
 */
export function MetaInspector({ meta }: { meta: CustomIndicatorMeta }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2 border-t border-(--pane-rule) px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold">{meta.title}</span>
        <Badge variant="secondary" className="text-[10px]">
          {meta.pane === 'overlay'
            ? t('indicatorsPage.metaPaneOverlay')
            : t('indicatorsPage.metaPaneSeparate')}
        </Badge>
        {meta.strategy && (
          <Badge className="text-[10px]">
            {t('indicatorsPage.metaStrategy')}
          </Badge>
        )}
        {meta.minBars !== undefined && (
          <Badge variant="outline" className="text-[10px]">
            {t('indicatorsPage.metaMinBars', { count: meta.minBars })}
          </Badge>
        )}
        {meta.packages?.map((pkg) => (
          <Badge key={pkg} variant="outline" className="font-mono text-[10px]">
            {pkg}
          </Badge>
        ))}
      </div>

      {meta.inputs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('indicatorsPage.metaInputs')}
          </span>
          {meta.inputs.map((input) => (
            <Badge
              key={input.key}
              variant="outline"
              className="font-mono text-[10px] font-normal"
            >
              {inputSummary(input)}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t('indicatorsPage.metaSeries')}
        </span>
        {meta.series.map((series) => (
          <Badge
            key={series.key}
            variant="outline"
            className="font-mono text-[10px] font-normal"
          >
            {series.key} · {series.style}
          </Badge>
        ))}
        {meta.hlines && meta.hlines.length > 0 && (
          <Badge
            variant="outline"
            className="font-mono text-[10px] font-normal"
          >
            {t('indicatorsPage.metaHlines', { count: meta.hlines.length })}
          </Badge>
        )}
        {(
          [
            ['metaMarkers', meta.markers?.length],
            ['metaFills', meta.fills?.length],
            ['metaAlerts', meta.alerts?.length],
            ['metaRequests', meta.requests?.length],
          ] as const
        ).map(([key, count]) =>
          count ? (
            <Badge
              key={key}
              variant="outline"
              className="font-mono text-[10px] font-normal"
            >
              {t(`indicatorsPage.${key}`, { count })}
            </Badge>
          ) : null,
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        {t('indicatorsPage.metaAvailableNote')}
      </p>
    </div>
  )
}
