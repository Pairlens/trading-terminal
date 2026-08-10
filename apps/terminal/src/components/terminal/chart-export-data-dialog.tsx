// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Export chart data" — the chart's bars as a CSV file.
 *
 * The data comes from the chart engine (`getSnapshot`), not from the candle
 * stream the pane renders from. The engine is what the user is actually
 * looking at: the forming bar has had its ticks applied to it, a replay
 * cursor has trimmed the series, and the indicator values are the ones drawn
 * on screen rather than a recomputation that could disagree at the edges.
 *
 * Reading it here also keeps the toolbar off the per-tick contexts — this
 * dialog holds a `chartRef`, never a subscription.
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FolderDown } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import { Checkbox } from '@pairlens/ui/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Label } from '@pairlens/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import type { RefObject } from 'react'
import type {
  ChartSeriesInput,
  ChartSnapshot,
  FastFinancialChartRef,
} from '@pairlens/fast-financial-charts/types'
import type { ChartCsvTimeFormat } from '@/lib/chart-csv'
import {
  barsInViewport,
  buildChartCsv,
  chartCsvFileName,
} from '@/lib/chart-csv'
import { getIndicatorDisplayLabel } from '@/lib/indicators/custom-indicator-definitions'
import { track } from '@/lib/analytics-events'
import {
  canRevealSavedFiles,
  revealSavedFile,
  saveToDownloads,
  savedFileFolder,
} from '@/lib/save-file'

const TIME_FORMATS: Array<{ value: ChartCsvTimeFormat; labelKey: string }> = [
  { value: 'iso', labelKey: 'chart.exportData.timeIso' },
  { value: 'utc', labelKey: 'chart.exportData.timeUtc' },
  { value: 'unixSeconds', labelKey: 'chart.exportData.timeUnixSeconds' },
  { value: 'unixMillis', labelKey: 'chart.exportData.timeUnixMillis' },
]

type ExportRange = 'visible' | 'all'

type ChartExportDataDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  chartRef: RefObject<FastFinancialChartRef | null>
  /** Series id of the chart's primary instrument. */
  pairKey: string
  market: string
  timeframe: string
}

/** What the chart is holding right now — read once per dialog open. */
type ChartContents = {
  main: ChartSeriesInput
  compares: Array<ChartSeriesInput>
  indicators: Array<{
    label: string
    values: ChartSnapshot['indicatorResults'][number]['values']
  }>
  visibleBars: Array<ChartSeriesInput['bars'][number]>
}

/**
 * `getSnapshot` widens to a lite snapshot when neither payload is requested;
 * we always request both, so this only teaches TypeScript what we know.
 */
function isFullSnapshot(
  snapshot: ReturnType<FastFinancialChartRef['getSnapshot']>,
): snapshot is ChartSnapshot {
  return 'series' in snapshot
}

function formatIndicatorLabel(type: string, period: unknown): string {
  const label = getIndicatorDisplayLabel(type)
  return typeof period === 'number' ? `${label} (${period})` : label
}

function readChart(
  chart: FastFinancialChartRef | null,
  pairKey: string,
): ChartContents | null {
  if (!chart) return null
  const snapshot = chart.getSnapshot({
    includeSeries: true,
    includeIndicatorValues: true,
  })
  if (!isFullSnapshot(snapshot)) return null

  const main =
    snapshot.series.find((series) => series.id === pairKey) ??
    snapshot.series[0]
  if (!main) return null

  return {
    main,
    compares: snapshot.series.filter((series) => series.id !== main.id),
    // Hidden indicators are off the chart, so they stay out of an export of
    // what the chart shows. Compare-series indicators would need their own
    // row axis, so only the main series' are offered.
    indicators: snapshot.indicatorResults
      .filter(
        (result) =>
          result.indicator.visible !== false &&
          result.indicator.seriesId === main.id,
      )
      .map((result) => ({
        label: formatIndicatorLabel(
          result.indicator.type,
          result.indicator.params?.period,
        ),
        values: result.values,
      })),
    visibleBars: barsInViewport(main.bars, snapshot.viewport),
  }
}

export function ChartExportDataDialog({
  open,
  onOpenChange,
  chartRef,
  pairKey,
  market,
  timeframe,
}: ChartExportDataDialogProps) {
  const { t } = useTranslation()
  const [range, setRange] = useState<ExportRange>('visible')
  const [timeFormat, setTimeFormat] = useState<ChartCsvTimeFormat>('iso')
  const [withIndicators, setWithIndicators] = useState(true)
  const [withCompares, setWithCompares] = useState(true)
  const [contents, setContents] = useState<ChartContents | null>(null)

  // Counts shown below are a still of the chart at open. The export itself
  // re-reads, so a minute spent in the dialog on a 1m chart doesn't ship a
  // file that stops one bar short of what the chart now holds.
  useEffect(() => {
    if (!open) return
    setContents(readChart(chartRef.current, pairKey))
  }, [open, chartRef, pairKey])

  const hasIndicators = (contents?.indicators.length ?? 0) > 0
  const hasCompares = (contents?.compares.length ?? 0) > 0
  const rowCount =
    range === 'visible'
      ? (contents?.visibleBars.length ?? 0)
      : (contents?.main.bars.length ?? 0)

  const handleExport = useCallback(async () => {
    const fresh = readChart(chartRef.current, pairKey)
    if (!fresh) {
      toast.error(t('chart.exportData.failed'))
      return
    }

    const bars = range === 'visible' ? fresh.visibleBars : fresh.main.bars

    const csv = buildChartCsv({
      main: { label: fresh.main.label ?? fresh.main.id, bars },
      compares: withCompares
        ? fresh.compares.map((series) => ({
            label: series.label ?? series.id,
            bars: series.bars,
          }))
        : [],
      indicators: withIndicators ? fresh.indicators : [],
      timeFormat,
    })

    const fileName = chartCsvFileName({
      pairKey,
      market,
      timeframe,
      now: new Date(),
    })

    let saved
    try {
      saved = await saveToDownloads(
        new TextEncoder().encode(csv),
        fileName,
        'text/csv',
      )
    } catch {
      toast.error(t('chart.exportData.failed'))
      return
    }

    track('chart_data_exported', {
      range,
      time_format: timeFormat,
      with_indicators: withIndicators && fresh.indicators.length > 0,
      with_compares: withCompares && fresh.compares.length > 0,
    })

    const folder = savedFileFolder(saved.path)
    toast.success(t('chart.exportData.saved', { file: fileName }), {
      description: folder
        ? t('chart.exportData.savedTo', { folder })
        : t('chart.exportData.savedToDownloads'),
      action:
        canRevealSavedFiles && saved.path
          ? {
              label: t('common.showInFolder'),
              onClick: () => void revealSavedFile(saved.path as string),
            }
          : undefined,
    })
    onOpenChange(false)
  }, [
    chartRef,
    market,
    onOpenChange,
    pairKey,
    range,
    t,
    timeFormat,
    timeframe,
    withCompares,
    withIndicators,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('chart.exportData.title')}</DialogTitle>
          <DialogDescription>
            {t('chart.exportData.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="chart-export-range">
              {t('chart.exportData.range')}
            </Label>
            <Select
              value={range}
              onValueChange={(next) => next && setRange(next as ExportRange)}
            >
              <SelectTrigger
                id="chart-export-range"
                size="sm"
                className="w-full text-xs"
              >
                {/* Base UI renders the raw value unless given a renderer —
                    the trigger has to say "Visible bars", not "visible". */}
                <SelectValue>
                  {(value) =>
                    value === 'all'
                      ? t('chart.exportData.rangeAll')
                      : t('chart.exportData.rangeVisible')
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visible">
                  {t('chart.exportData.rangeVisible')}
                </SelectItem>
                <SelectItem value="all">
                  {t('chart.exportData.rangeAll')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="chart-export-time-format">
              {t('chart.exportData.timeFormat')}
            </Label>
            <Select
              value={timeFormat}
              onValueChange={(next) =>
                next && setTimeFormat(next as ChartCsvTimeFormat)
              }
            >
              <SelectTrigger
                id="chart-export-time-format"
                size="sm"
                className="w-full text-xs"
              >
                <SelectValue>
                  {(value) =>
                    t(
                      TIME_FORMATS.find((option) => option.value === value)
                        ?.labelKey ?? 'chart.exportData.timeIso',
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIME_FORMATS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Only offered when there is something to include — an always-on
              checkbox for an empty chart reads as a broken export. */}
          {(hasIndicators || hasCompares) && (
            <div className="space-y-2">
              {hasIndicators && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={withIndicators}
                    onCheckedChange={(v) => setWithIndicators(v === true)}
                    className="size-3.5"
                  />
                  {t('chart.exportData.includeIndicators', {
                    count: contents?.indicators.length ?? 0,
                  })}
                </label>
              )}
              {hasCompares && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={withCompares}
                    onCheckedChange={(v) => setWithCompares(v === true)}
                    className="size-3.5"
                  />
                  {t('chart.exportData.includeCompares', {
                    count: contents?.compares.length ?? 0,
                  })}
                </label>
              )}
            </div>
          )}

          {/* Say what lands in the file, and where, before the click. */}
          <p className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
            <FolderDown className="size-3.5 shrink-0" aria-hidden />
            {t('chart.exportData.summary', { count: rowCount })}
          </p>
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleExport()}
            disabled={rowCount === 0}
          >
            {t('chart.exportData.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
