// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useMemo } from 'react'
import { FastFinancialChart } from 'fast-financial-charts/react'
import { ChartHud } from './chart-hud'
import { ChartIndicatorsBar } from './chart-indicators-bar'
import type { RefObject } from 'react'

import type {
  ChartContextMenuPayload,
  ChartSeriesInput,
  ChartType,
  CompareMode,
  CrosshairMode,
  DrawingObject,
  DrawingStyleDefaults,
  DrawingToolMode,
  DrawingToolType,
  FastFinancialChartRef,
  PriceScaleMode,
  Timeframe,
} from 'fast-financial-charts/types'
import { formatChartPrice } from '@/lib/format-price'
import { usePairlensChartTheme } from '@/hooks/use-chart-theme'

const noop = () => undefined

type TerminalChartProps = {
  chartRef: RefObject<FastFinancialChartRef | null>
  series: Array<ChartSeriesInput>
  timeframe: Timeframe
  chartType: ChartType
  crosshairMode: CrosshairMode
  priceScaleMode: PriceScaleMode
  invertedScale: boolean
  compareMode: CompareMode
  drawingToolMode: DrawingToolMode
  activeTool: DrawingToolType | null
  drawingStyleDefaults?: DrawingStyleDefaults
  pairKey: string
  onContextMenu: (
    payload: ChartContextMenuPayload & { clientX: number; clientY: number },
  ) => void
  onRemoveIndicator: (id: string) => void
  onActiveToolChange?: (tool: DrawingToolType | null) => void
  onRequestTextInput?: (drawingId: string, currentText: string) => void
  onViewportChange?: (viewport: {
    startIndex: number
    endIndex: number
  }) => void
  onDrawingsChange?: (drawings: Array<DrawingObject>) => void
  /** Fires when the chart engine (re)mounts — a fresh engine has no drawings/indicators. */
  onChartReady?: () => void
}

// Memoized: the WebGL chart is the heaviest child of the chart pane, and
// parent re-renders (e.g. a new signal for the intelligence strip) shouldn't
// reach it when its own props are unchanged.
export const TerminalChart = memo(function TerminalChart({
  chartRef,
  series,
  timeframe,
  chartType,
  crosshairMode,
  priceScaleMode,
  invertedScale,
  compareMode,
  drawingToolMode,
  activeTool,
  drawingStyleDefaults,
  pairKey,
  onContextMenu,
  onRemoveIndicator,
  onActiveToolChange,
  onRequestTextInput,
  onViewportChange,
  onDrawingsChange,
  onChartReady,
}: TerminalChartProps) {
  const theme = usePairlensChartTheme()

  // Compute baseline config from first bar's close price
  const baselineConfig = useMemo(() => {
    const firstBar = series[0]?.bars[0]
    if (!firstBar) return undefined
    return { baseValue: firstBar.close }
  }, [series])

  const crosshairConfig = useMemo(
    () => ({ mode: crosshairMode }),
    [crosshairMode],
  )

  const priceScale = useMemo(
    () => ({ inverted: invertedScale }),
    [invertedScale],
  )

  const watermark = useMemo(
    () => ({ text: pairKey, color: '#ffffff06', fontSize: 48 }),
    [pairKey],
  )

  const timeScale = useMemo(
    () => ({
      rightOffset: 20,
      fixLeftEdge: true,
      shiftVisibleRangeOnNewBar: true,
    }),
    [],
  )

  const defaultViewport = useMemo(
    () => ({ type: 'last-bars' as const, bars: 200 }),
    [],
  )

  const localization = useMemo(() => ({ priceFormatter: formatChartPrice }), [])

  const interaction = useMemo(
    () => ({
      wheelZoom: true,
      dragPan: true,
      keyboardShortcuts: true,
      // The toolbar's Magnet crosshair mode doubles as drawing-point snapping:
      // with magnet on, drawing anchors snap to OHLC values of the nearest bar.
      drawingSnap: crosshairMode === 'magnet',
      drawingToolMode,
      kineticScroll: { touch: true, mouse: true },
    }),
    [drawingToolMode, crosshairMode],
  )

  const handleContextMenu = useCallback(
    (
      payload: ChartContextMenuPayload & { clientX: number; clientY: number },
    ) => {
      onContextMenu(payload)
    },
    [onContextMenu],
  )

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
      <FastFinancialChart
        ref={chartRef}
        series={series}
        timeframe={timeframe}
        chartType={chartType}
        priceScaleMode={priceScaleMode}
        priceScale={priceScale}
        activeTool={activeTool}
        drawingStyleDefaults={drawingStyleDefaults}
        theme={theme}
        className="h-full w-full"
        compareMode={compareMode}
        crosshairConfig={crosshairConfig}
        baselineConfig={baselineConfig}
        watermark={watermark}
        timeScale={timeScale}
        defaultViewport={defaultViewport}
        snapshotThrottleMs={120}
        localization={localization}
        interaction={interaction}
        onDrawingsChange={onDrawingsChange ?? noop}
        onReady={onChartReady}
        onViewportChange={onViewportChange}
        onActiveToolChange={onActiveToolChange}
        onRequestTextInput={onRequestTextInput}
        onContextMenu={handleContextMenu}
        renderHud={(hud) => <ChartHud hud={hud} />}
        renderTopBar={(topbar) => (
          <ChartIndicatorsBar
            topbar={topbar}
            onRemoveIndicator={onRemoveIndicator}
          />
        )}
      />
    </div>
  )
})
