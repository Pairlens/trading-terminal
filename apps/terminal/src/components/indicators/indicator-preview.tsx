// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChartCandlestick } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FastFinancialChart } from '@pairlens/fast-financial-charts/react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'

import type {
  ChartBar,
  FastFinancialChartRef,
  IndicatorValuePoint,
  Timeframe,
} from '@pairlens/fast-financial-charts/types'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { BacktestResult } from '@/lib/indicators/backtest'
import { createCustomIndicatorPresenter } from '@/lib/indicators/custom-indicator-presenter'
import { usePairlensChartTheme } from '@/hooks/use-chart-theme'

/** One preview indicator at a time — a stable type keeps re-runs cheap. */
const PREVIEW_INDICATOR_TYPE = 'custom:preview' as const

export type PreviewRun = {
  scriptId: string
  bars: Array<ChartBar>
  points: Array<IndicatorValuePoint>
  meta: CustomIndicatorMeta
  timeframe: Timeframe
  /** Color palettes the script's per-bar `plot(color=...)` folded into. */
  palettes: Record<string, Array<string>>
  /** Wall-clock ms the Python compute took. */
  durationMs: number
  /** Replayed signals — only for scripts declared with `strategy(...)`. */
  backtest: BacktestResult | null
  /** Bumped per run so identical outputs still refresh the chart. */
  nonce: number
}

type IndicatorPreviewProps = {
  run: PreviewRun | null
  error: { message: string; traceback?: string } | null
  /** Bar under the crosshair, for the data window. Null when not hovering. */
  onHoverTsChange?: (ts: number | null) => void
}

function PreviewChart({
  run,
  onHoverTsChange,
}: {
  run: PreviewRun
  onHoverTsChange?: (ts: number | null) => void
}) {
  const theme = usePairlensChartTheme()
  const chartRef = useRef<FastFinancialChartRef | null>(null)
  const [readyTick, setReadyTick] = useState(0)

  // The engine's compute closure reads the latest run through a ref, so a
  // re-run doesn't need to re-register the definition to see fresh values.
  const runRef = useRef(run)
  runRef.current = run

  const series = useMemo(
    () => [{ id: 'preview', label: 'Preview', bars: run.bars }],
    [run.bars],
  )

  const handleReady = useCallback((ref: FastFinancialChartRef) => {
    chartRef.current = ref
    setReadyTick((n) => n + 1)
  }, [])

  useEffect(() => {
    const ref = chartRef.current
    if (!ref || readyTick === 0) return
    const { meta } = runRef.current
    ref.unregisterIndicatorDefinition(PREVIEW_INDICATOR_TYPE)
    ref.registerIndicatorDefinition({
      type: PREVIEW_INDICATOR_TYPE,
      pane: meta.pane,
      compute: () => Promise.resolve(runRef.current.points),
      // This effect re-runs per run, so the spec (and its palettes) is always
      // the one the current values were computed with.
      presenter: createCustomIndicatorPresenter({
        series: meta.series,
        hlines: meta.hlines,
        markers: meta.markers,
        fills: meta.fills,
        palettes: runRef.current.palettes,
      }),
      supportsIncremental: false,
    })
    // Re-adding the instance forces a recompute against the new run.
    ref.executeCommand({ type: 'removeAllIndicators' })
    ref.executeCommand({
      type: 'addIndicator',
      payload: {
        type: PREVIEW_INDICATOR_TYPE,
        seriesId: 'preview',
        pane: meta.pane,
      },
    })
  }, [readyTick, run.nonce, run.meta])

  return (
    <FastFinancialChart
      series={series}
      timeframe={run.timeframe}
      theme={theme}
      className="h-full w-full"
      onReady={handleReady}
      onCrosshairMove={(params) => onHoverTsChange?.(params.time)}
    />
  )
}

/** Python traceback panel — scrollable monospace, newest error only. */
function ErrorPanel({
  error,
}: {
  error: { message: string; traceback?: string }
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
      <span className="text-xs font-semibold text-destructive">
        {t('indicatorsPage.errorTitle')}
      </span>
      <ScrollArea className="min-h-0 flex-1 rounded-md border border-destructive/30 bg-destructive/5">
        <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-destructive">
          {error.traceback?.trim() || error.message}
        </pre>
      </ScrollArea>
    </div>
  )
}

export function IndicatorPreview({
  run,
  error,
  onHoverTsChange,
}: IndicatorPreviewProps) {
  const { t } = useTranslation()

  if (error) {
    return <ErrorPanel error={error} />
  }

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty className="border-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartCandlestick />
            </EmptyMedia>
            <EmptyTitle>{t('indicatorsPage.previewEmptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('indicatorsPage.previewEmptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      <PreviewChart run={run} onHoverTsChange={onHoverTsChange} />
    </div>
  )
}
