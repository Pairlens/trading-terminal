// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  ArrowDownUp,
  BarChart3,
  Camera,
  CandlestickChart,
  Clock,
  Copy,
  Crosshair,
  Download,
  Equal,
  EyeOff,
  Hash,
  History,
  LineChart,
  Magnet,
  Maximize2,
  Minimize2,
  Percent,
  Scaling,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@pairlens/ui/components/ui/button'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@pairlens/ui/components/ui/menubar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import type {
  CrosshairMode,
  PriceScaleMode,
} from '@pairlens/fast-financial-charts/types'
import type { ChartType } from '@/hooks/use-chart-terminal-state'
import { CompareMenu } from '@/components/terminal/compare-symbol-menu'
import { ShortcutHint } from '@/components/shortcut-hints'
import { metaKeySymbol } from '@/hooks/use-keyboard-shortcuts'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import {
  canRevealSavedFiles,
  revealSavedFile,
  saveDataUrlToDownloads,
  savedFileFolder,
} from '@/lib/save-file'

const TIMEFRAME_OPTIONS: Array<{
  value: string
  short: string
  longKey: string
  /** Keyboard shortcut key — omitted for timeframes without a shortcut. */
  shortcutKey?: string
}> = [
  {
    value: '1m',
    short: '1m',
    longKey: 'chart.timeframes.1m',
    shortcutKey: '1',
  },
  {
    value: '5m',
    short: '5m',
    longKey: 'chart.timeframes.5m',
    shortcutKey: '2',
  },
  {
    value: '15m',
    short: '15m',
    longKey: 'chart.timeframes.15m',
    shortcutKey: '3',
  },
  {
    value: '30m',
    short: '30m',
    longKey: 'chart.timeframes.30m',
    shortcutKey: '4',
  },
  {
    value: '1h',
    short: '1h',
    longKey: 'chart.timeframes.1h',
    shortcutKey: '5',
  },
  {
    value: '2h',
    short: '2h',
    longKey: 'chart.timeframes.2h',
    shortcutKey: '6',
  },
  {
    value: '4h',
    short: '4h',
    longKey: 'chart.timeframes.4h',
    shortcutKey: '7',
  },
  {
    value: '1d',
    short: '1D',
    longKey: 'chart.timeframes.1d',
    shortcutKey: '8',
  },
  {
    value: '3d',
    short: '3D',
    longKey: 'chart.timeframes.3d',
    shortcutKey: '0',
  },
  {
    value: '1w',
    short: '1W',
    longKey: 'chart.timeframes.1w',
    shortcutKey: '9',
  },
  {
    value: '1M',
    short: '1M',
    longKey: 'chart.timeframes.1M',
  },
]

/** Maps number keys (1-9, 0) to timeframe values for keyboard shortcuts */
export const TIMEFRAME_SHORTCUT_MAP = Object.fromEntries(
  TIMEFRAME_OPTIONS.flatMap((o) =>
    o.shortcutKey ? [[o.shortcutKey, o.value] as const] : [],
  ),
) as Record<string, string>

const CHART_TYPE_OPTIONS: Array<{
  value: ChartType
  labelKey: string
  icon: typeof CandlestickChart
}> = [
  {
    value: 'candles',
    labelKey: 'chart.chartTypes.candles',
    icon: CandlestickChart,
  },
  {
    value: 'heikinAshi',
    labelKey: 'chart.chartTypes.heikinAshi',
    icon: CandlestickChart,
  },
  {
    value: 'hollowCandles',
    labelKey: 'chart.chartTypes.hollowCandles',
    icon: CandlestickChart,
  },
  { value: 'bar', labelKey: 'chart.chartTypes.bar', icon: BarChart3 },
  { value: 'highLow', labelKey: 'chart.chartTypes.highLow', icon: BarChart3 },
  { value: 'line', labelKey: 'chart.chartTypes.line', icon: LineChart },
  {
    value: 'stepLine',
    labelKey: 'chart.chartTypes.stepLine',
    icon: LineChart,
  },
  { value: 'area', labelKey: 'chart.chartTypes.area', icon: LineChart },
  { value: 'hlcArea', labelKey: 'chart.chartTypes.hlcArea', icon: LineChart },
  { value: 'baseline', labelKey: 'chart.chartTypes.baseline', icon: LineChart },
  {
    value: 'histogram',
    labelKey: 'chart.chartTypes.histogram',
    icon: BarChart3,
  },
  { value: 'column', labelKey: 'chart.chartTypes.column', icon: BarChart3 },
  { value: 'renko', labelKey: 'chart.chartTypes.renko', icon: BarChart3 },
  {
    value: 'lineBreak',
    labelKey: 'chart.chartTypes.lineBreak',
    icon: BarChart3,
  },
  { value: 'kagi', labelKey: 'chart.chartTypes.kagi', icon: LineChart },
  {
    value: 'pointFigure',
    labelKey: 'chart.chartTypes.pointFigure',
    icon: Hash,
  },
]

const CROSSHAIR_MODE_OPTIONS: Array<{
  value: CrosshairMode
  labelKey: string
  icon: typeof Crosshair
}> = [
  { value: 'normal', labelKey: 'chart.crosshairModes.normal', icon: Crosshair },
  { value: 'magnet', labelKey: 'chart.crosshairModes.magnet', icon: Magnet },
  { value: 'hidden', labelKey: 'chart.crosshairModes.hidden', icon: EyeOff },
]

const PRICE_SCALE_MODE_OPTIONS: Array<{
  value: PriceScaleMode
  labelKey: string
  shortLabel: string
  icon: typeof TrendingUp
}> = [
  {
    value: 'normal',
    labelKey: 'chart.priceScaleModes.normal',
    shortLabel: 'Lin',
    icon: TrendingUp,
  },
  {
    value: 'logarithmic',
    labelKey: 'chart.priceScaleModes.logarithmic',
    shortLabel: 'Log',
    icon: Scaling,
  },
  {
    value: 'percentage',
    labelKey: 'chart.priceScaleModes.percentage',
    shortLabel: '%',
    icon: Percent,
  },
  {
    value: 'indexedTo100',
    labelKey: 'chart.priceScaleModes.indexedTo100',
    shortLabel: '100',
    icon: Hash,
  },
]

export function ChartToolbar() {
  const { t } = useTranslation()
  const {
    timeframe,
    chartType,
    crosshairMode,
    priceScaleMode,
    showBidAsk,
    invertedScale,
    replayActive,
    isFullscreen,
    chartRef,
    chartSeries,
  } = useChartConfig()
  const {
    setTimeframe,
    setChartType,
    setCrosshairMode,
    setPriceScaleMode,
    setShowBidAsk,
    setInvertedScale,
    setIndicatorPaletteOpen,
    setIsFullscreen,
    startReplay,
    exitReplay,
  } = useChartActions()

  const handleScreenshot = useCallback(
    async (mode: 'copy' | 'download') => {
      const shot = chartRef.current?.takeScreenshot()
      if (!shot?.dataUrl) {
        toast.error(t('chart.toolbar.screenshotFailed'))
        return
      }
      const pairKey = chartSeries[0]?.id ?? 'chart'
      if (mode === 'download') {
        const fileName = `${pairKey.replace(/[^\w-]+/g, '_')}-${timeframe}.png`
        try {
          const saved = await saveDataUrlToDownloads(shot.dataUrl, fileName)
          const folder = savedFileFolder(saved.path)
          toast.success(
            t('chart.toolbar.screenshotSaved', { file: fileName }),
            {
              description: folder
                ? t('chart.toolbar.screenshotSavedTo', { folder })
                : t('chart.toolbar.screenshotSavedToDownloads'),
              action:
                canRevealSavedFiles && saved.path
                  ? {
                      label: t('common.showInFolder'),
                      onClick: () => void revealSavedFile(saved.path as string),
                    }
                  : undefined,
            },
          )
        } catch {
          toast.error(t('chart.toolbar.screenshotFailed'))
        }
        return
      }
      try {
        const blob = await (await fetch(shot.dataUrl)).blob()
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        toast.success(t('chart.toolbar.screenshotCopied'))
      } catch {
        toast.error(t('chart.toolbar.screenshotFailed'))
      }
    },
    [chartRef, chartSeries, t, timeframe],
  )

  const activeChartOption =
    CHART_TYPE_OPTIONS.find((o) => o.value === chartType) ??
    CHART_TYPE_OPTIONS[0]
  const activeCrosshairOption =
    CROSSHAIR_MODE_OPTIONS.find((o) => o.value === crosshairMode) ??
    CROSSHAIR_MODE_OPTIONS[1]
  const activePriceScaleOption =
    PRICE_SCALE_MODE_OPTIONS.find((o) => o.value === priceScaleMode) ??
    PRICE_SCALE_MODE_OPTIONS[0]

  return (
    <div className="flex items-center gap-1 border-b border-border/40 px-1.5 py-0.5">
      <Menubar className="h-7 border-none bg-transparent p-0">
        {/* Timeframe */}
        <MenubarMenu>
          <Tooltip>
            <TooltipTrigger
              render={<MenubarTrigger className="gap-1 font-mono text-xs" />}
            >
              <Clock className="size-3.5" />
              {TIMEFRAME_OPTIONS.find((o) => o.value === timeframe)?.short ??
                timeframe}
              <ShortcutHint keys="1-9" />
            </TooltipTrigger>
            <TooltipContent>{t('chart.toolbar.timeframe')}</TooltipContent>
          </Tooltip>
          <MenubarContent className="w-44">
            <MenubarGroup>
              <MenubarLabel>{t('chart.toolbar.timeframe')}</MenubarLabel>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarRadioGroup value={timeframe} onValueChange={setTimeframe}>
              {TIMEFRAME_OPTIONS.map((option) => (
                <MenubarRadioItem key={option.value} value={option.value}>
                  <span className="w-7 font-mono font-medium">
                    {option.short}
                  </span>
                  <span className="flex-1 text-muted-foreground">
                    {t(option.longKey)}
                  </span>
                  {option.shortcutKey ? (
                    <MenubarShortcut>{option.shortcutKey}</MenubarShortcut>
                  ) : null}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        {/* Chart type */}
        <MenubarMenu>
          <Tooltip>
            <TooltipTrigger
              render={<MenubarTrigger className="gap-1 text-xs" />}
            >
              <activeChartOption.icon className="size-3.5" />
              {t(activeChartOption.labelKey)}
            </TooltipTrigger>
            <TooltipContent>{t('chart.toolbar.chartType')}</TooltipContent>
          </Tooltip>
          <MenubarContent className="w-48">
            <MenubarGroup>
              <MenubarLabel>{t('chart.toolbar.chartType')}</MenubarLabel>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarRadioGroup
              value={chartType}
              onValueChange={(v) => setChartType(v as ChartType)}
            >
              {CHART_TYPE_OPTIONS.map((option) => (
                <MenubarRadioItem key={option.value} value={option.value}>
                  <option.icon className="size-4" />
                  {t(option.labelKey)}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        {/* Crosshair */}
        <MenubarMenu>
          <Tooltip>
            <TooltipTrigger
              render={<MenubarTrigger className="gap-1 text-xs" />}
            >
              <activeCrosshairOption.icon className="size-3.5" />
              {t(activeCrosshairOption.labelKey)}
            </TooltipTrigger>
            <TooltipContent>{t('chart.toolbar.crosshairMode')}</TooltipContent>
          </Tooltip>
          <MenubarContent className="w-40">
            <MenubarGroup>
              <MenubarLabel>{t('chart.toolbar.crosshair')}</MenubarLabel>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarRadioGroup
              value={crosshairMode}
              onValueChange={(v) => setCrosshairMode(v as CrosshairMode)}
            >
              {CROSSHAIR_MODE_OPTIONS.map((option) => (
                <MenubarRadioItem key={option.value} value={option.value}>
                  <option.icon className="size-4" />
                  {t(option.labelKey)}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        {/* Price scale */}
        <MenubarMenu>
          <Tooltip>
            <TooltipTrigger
              render={<MenubarTrigger className="gap-1 text-xs" />}
            >
              <activePriceScaleOption.icon className="size-3.5" />
              {activePriceScaleOption.shortLabel}
            </TooltipTrigger>
            <TooltipContent>{t('chart.toolbar.priceScale')}</TooltipContent>
          </Tooltip>
          <MenubarContent className="w-44">
            <MenubarGroup>
              <MenubarLabel>{t('chart.toolbar.priceScale')}</MenubarLabel>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarRadioGroup
              value={priceScaleMode}
              onValueChange={(v) => setPriceScaleMode(v as PriceScaleMode)}
            >
              {PRICE_SCALE_MODE_OPTIONS.map((option) => (
                <MenubarRadioItem key={option.value} value={option.value}>
                  <option.icon className="size-4" />
                  {t(option.labelKey)}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem
              checked={invertedScale}
              onCheckedChange={setInvertedScale}
            >
              <ArrowDownUp className="size-4" />
              {t('chart.toolbar.invertScale')}
            </MenubarCheckboxItem>
          </MenubarContent>
        </MenubarMenu>

        {/* Compare symbols */}
        <CompareMenu />

        {/* Screenshot */}
        <MenubarMenu>
          <Tooltip>
            <TooltipTrigger
              render={<MenubarTrigger className="gap-1 text-xs" />}
            >
              <Camera className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t('chart.toolbar.screenshot')}</TooltipContent>
          </Tooltip>
          <MenubarContent className="w-48">
            <MenubarGroup>
              <MenubarLabel>{t('chart.toolbar.screenshot')}</MenubarLabel>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarItem onClick={() => void handleScreenshot('copy')}>
              <Copy className="size-4" />
              {t('chart.toolbar.copyImage')}
            </MenubarItem>
            <MenubarItem onClick={() => void handleScreenshot('download')}>
              <Download className="size-4" />
              {t('chart.toolbar.downloadImage')}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* Indicators button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setIndicatorPaletteOpen(true)}
            />
          }
        >
          <Sparkles className="size-3.5" />
          {t('chart.toolbar.indicators')}
          <ShortcutHint keys={`${metaKeySymbol}I`} />
        </TooltipTrigger>
        <TooltipContent>
          {t('chart.toolbar.addIndicator')}{' '}
          <Kbd className="ml-1.5">{metaKeySymbol}I</Kbd>
        </TooltipContent>
      </Tooltip>

      {/* Bar replay toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant={replayActive ? 'secondary' : 'ghost'}
              className="gap-1 text-xs"
              aria-pressed={replayActive}
              onClick={() => (replayActive ? exitReplay() : startReplay())}
            />
          }
        >
          <History className="size-3.5" />
          {t('chart.replay.title')}
        </TooltipTrigger>
        <TooltipContent>{t('chart.replay.tooltip')}</TooltipContent>
      </Tooltip>

      {/* Bid/Ask quote lines toggle (TradingView "Bid and Ask") */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant={showBidAsk ? 'secondary' : 'ghost'}
              className="gap-1 text-xs"
              aria-pressed={showBidAsk}
              onClick={() => setShowBidAsk(!showBidAsk)}
            />
          }
        >
          <Equal className="size-3.5" />
          {t('chart.toolbar.bidAsk')}
        </TooltipTrigger>
        <TooltipContent>{t('chart.toolbar.bidAskTooltip')}</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {/* Fullscreen toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="size-7 p-0"
              onClick={() => setIsFullscreen(!isFullscreen)}
            />
          }
        >
          {isFullscreen ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {isFullscreen
            ? t('chart.toolbar.exitFullscreen')
            : t('chart.toolbar.fullscreen')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
