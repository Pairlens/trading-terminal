// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { PreviewRun } from './indicator-preview'
import { resolveSeriesColor } from '@/lib/indicators/custom-indicator-presenter'
import { usePairlensChartTheme } from '@/hooks/use-chart-theme'

type DataWindowProps = {
  run: PreviewRun
  /** Bar the crosshair is over; falls back to the last bar. */
  hoverTs: number | null
}

/** Format a value the way the script asked to see it. */
function formatValue(
  value: number | undefined,
  precision: number | undefined,
  format: PreviewRun['meta']['format'],
): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const digits =
    precision ?? (Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 4 : 6)
  const text = value.toFixed(digits)
  if (format === 'percent') return `${text}%`
  if (format === 'volume') return Intl.NumberFormat().format(value)
  return text
}

/**
 * Every series' value on one bar, the way TradingView's Data Window works —
 * the fastest way to answer "why is this NaN here" without adding prints.
 * Follows the crosshair and falls back to the most recent bar.
 */
export function DataWindow({ run, hoverTs }: DataWindowProps) {
  const { t } = useTranslation()
  const theme = usePairlensChartTheme()

  const index = useMemo(() => {
    if (run.bars.length === 0) return -1
    if (hoverTs === null) return run.bars.length - 1
    // Bars are ascending; find the nearest at or before the crosshair.
    let lo = 0
    let hi = run.bars.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (run.bars[mid].ts === hoverTs) return mid
      if (run.bars[mid].ts < hoverTs) lo = mid + 1
      else hi = mid - 1
    }
    return Math.max(0, Math.min(lo, run.bars.length - 1))
  }, [run.bars, hoverTs])

  if (index < 0) return null

  const bar = run.bars[index]
  const point = run.points[index]
  // Background tints hold palette indices, not readable values.
  const series = run.meta.series.filter((s) => s.style !== 'background')

  return (
    <div className="space-y-1.5 border-t border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t('indicatorsPage.dataWindow')}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {new Date(bar.ts).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-x-3 gap-y-0.5 font-mono text-[11px]">
        {(['open', 'high', 'low', 'close'] as const).map((field) => (
          <div key={field} className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">
              {field.charAt(0).toUpperCase()}
            </span>
            <span>{formatValue(bar[field], undefined, 'price')}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-1">
          <span className="text-muted-foreground">V</span>
          <span>{formatValue(bar.volume, 0, 'volume')}</span>
        </div>
      </div>

      <div className="space-y-0.5">
        {series.map((spec, specIndex) => {
          const value = point?.[spec.key]
          return (
            <div
              key={spec.key}
              className="flex items-center gap-1.5 font-mono text-[11px]"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: resolveSeriesColor(
                    spec.color,
                    specIndex,
                    theme,
                  ),
                }}
              />
              <span className="truncate text-muted-foreground">
                {spec.title ?? spec.key}
              </span>
              <span
                className={cn(
                  'ml-auto tabular-nums',
                  typeof value !== 'number' && 'text-muted-foreground/60',
                )}
              >
                {formatValue(
                  typeof value === 'number' ? value : undefined,
                  run.meta.precision,
                  run.meta.format,
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground">
        <span>{t('indicatorsPage.barCount', { count: run.bars.length })}</span>
        <span aria-hidden>·</span>
        <span className="font-mono">
          {t('indicatorsPage.computeTime', {
            ms: run.durationMs.toFixed(run.durationMs < 10 ? 1 : 0),
          })}
        </span>
      </div>
    </div>
  )
}
