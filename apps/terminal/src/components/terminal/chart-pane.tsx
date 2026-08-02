// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { usePanePair, useServiceRegistry } from '@pairlens/plugin-sdk'
import { ChartContextMenu } from './chart-context-menu'

import { ChartDrawingProperties } from './chart-drawing-properties'
import { ChartDrawingToolbar } from './chart-drawing-toolbar'
import { ChartToolbar, TIMEFRAME_SHORTCUT_MAP } from './chart-toolbar'
import { ReplayControls } from './replay-controls'
import { IndicatorPicker } from './indicator-picker'
import { IntelligenceStrip } from './intelligence-strip'
import { TerminalChart } from './terminal-chart'
import { TextInputDialog } from './text-input-dialog'
import type { SignalPayload } from '@pairlens/shared/types'
import type { ChartCommand } from 'fast-financial-charts/types'
import {
  useOptionalCandleData,
  useOptionalChartActions,
  useOptionalChartConfig,
} from '@/lib/chart-terminal-context'
import { useChartPaneShortcuts } from '@/lib/chart-shortcuts'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneTransition } from '@/components/layout/pane-transition'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useNotificationStore } from '@/stores/notification-store'

export function ChartPane() {
  const candleData = useOptionalCandleData()
  const chartConfig = useOptionalChartConfig()
  const chartActions = useOptionalChartActions()
  const activePair = usePanePair()

  if (!candleData || !chartConfig || !chartActions || !activePair) {
    return <PanePairPicker />
  }

  return (
    <ChartPaneInner
      pairKey={activePair.pairKey}
      latestSignal={candleData.latestSignal}
      hasSnapshot={candleData.hasSnapshot}
      noData={candleData.noData}
      chartConfig={chartConfig}
      chartActions={chartActions}
    />
  )
}

const ChartPaneInner = memo(function ChartPaneInner({
  pairKey,
  latestSignal,
  hasSnapshot,
  noData,
  chartConfig,
  chartActions,
}: {
  pairKey: string
  latestSignal: SignalPayload | null
  hasSnapshot: boolean
  noData: boolean
  chartConfig: NonNullable<ReturnType<typeof useOptionalChartConfig>>
  chartActions: NonNullable<ReturnType<typeof useOptionalChartActions>>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const serviceRegistry = useServiceRegistry()
  const { markets } = useAvailableMarkets()
  const marketLabel =
    markets.find((m) => m.value === chartConfig.market)?.label ??
    chartConfig.market

  const {
    activeTool,
    activeToolMeta,
    drawingToolMode,
    chartRef,
    chartSeries,
    chartTimeframe,
    chartType,
    crosshairMode,
    priceScaleMode,
    invertedScale,
    compareScaleMode,
    isFullscreen,
    contextMenuState,
    textInputDialog,
    indicatorPaletteOpen,
    activeIndicators,
    drawingHistory,
    drawingStyleDefaults,
  } = chartConfig
  const {
    applyTool,
    setDrawingToolMode,
    clearAll,
    clearAllDrawings,
    updateDrawingStyleDefault,
    runCommand,
    setContextMenuState,
    removeIndicator,
    removeAllIndicators,
    setTextInputDialog,
    setIsFullscreen,
    setIndicatorPaletteOpen,
    addIndicator,
    setTimeframe,
    setMarket,
    handleChartViewportChange,
    handleDrawingsChange,
    handleChartReady,
  } = chartActions

  const { t } = useTranslation()
  const createPriceAlertRule = useNotificationStore(
    (s) => s.createPriceAlertRule,
  )

  // Create a level alert at the clicked price. Direction is inferred from the
  // live last close (read imperatively off the engine — no per-tick renders).
  const handleAddAlert = useCallback(
    (price: number) => {
      const bars = chartRef.current?.data() ?? []
      const lastClose = bars[bars.length - 1]?.close
      const direction =
        lastClose != null && price < lastClose ? 'below' : 'above'
      createPriceAlertRule({
        pair: pairKey,
        market: chartConfig.market,
        price,
        direction,
      })
      toast.success(
        t('chart.alerts.created', {
          pair: pairKey,
          direction: t(`chart.alerts.${direction}`),
          price: price.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          }),
        }),
      )
    },
    [chartRef, chartConfig.market, createPriceAlertRule, pairKey, t],
  )

  const handleUndo = useCallback(
    () => runCommand({ type: 'undo', payload: {} }),
    [runCommand],
  )
  const handleRedo = useCallback(
    () => runCommand({ type: 'redo', payload: {} }),
    [runCommand],
  )
  const handleRequestTextInput = useCallback(
    (drawingId: string, currentText: string) => {
      setTextInputDialog({ drawingId, currentText })
    },
    [setTextInputDialog],
  )

  // Register chart actions via the shared service registry so cross-plugin
  // consumers (e.g. copilot from pairlens-intelligence) can discover them.
  useEffect(() => {
    return serviceRegistry.register('chart-actions', {
      chartRef,
      addIndicator,
      removeIndicator,
      removeAllIndicators,
    })
  }, [
    serviceRegistry,
    chartRef,
    addIndicator,
    removeIndicator,
    removeAllIndicators,
  ])

  // Keyboard shortcuts delivered by the window-level router — they work no
  // matter where DOM focus sits, targeting the active (last-used) chart pane.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const alt = e.altKey
      const shift = e.shiftKey
      const key = e.key.toLowerCase()
      // Use e.code for Alt shortcuts — on macOS, Option+key produces
      // composed characters (e.g. Option+T → †) so e.key won't match.
      const code = e.code

      let handled = true

      if (meta && !alt && !shift && key === 'i') {
        setIndicatorPaletteOpen(true)
      } else if (meta && !alt && !shift && key === 'z') {
        runCommand({ type: 'undo', payload: {} })
      } else if (meta && !alt && shift && key === 'z') {
        runCommand({ type: 'redo', payload: {} })
      } else if (!meta && alt && !shift && code === 'KeyT') {
        applyTool('line')
      } else if (!meta && alt && !shift && code === 'KeyH') {
        applyTool('hline')
      } else if (!meta && alt && !shift && code === 'KeyV') {
        applyTool('vline')
      } else if (!meta && alt && !shift && code === 'KeyR') {
        applyTool('rectangle')
      } else if (!meta && alt && !shift && code === 'KeyM') {
        applyTool('measure')
      } else if (!meta && alt && !shift && code === 'KeyF') {
        applyTool('fibonacci')
      } else if (!meta && alt && !shift && code === 'KeyX') {
        applyTool('text')
      } else if (!meta && alt && !shift && code === 'KeyY') {
        applyTool('ray')
      } else if (!meta && alt && !shift && code === 'KeyE') {
        applyTool('xline')
      } else if (!meta && alt && !shift && code === 'KeyA') {
        applyTool('arrow')
      } else if (!meta && alt && !shift && code === 'KeyI') {
        applyTool('info-line')
      } else if (!meta && alt && !shift && code === 'KeyC') {
        applyTool('crossline')
      } else if (!meta && alt && !shift && code === 'KeyL') {
        applyTool('long-position')
      } else if (!meta && alt && !shift && code === 'KeyS') {
        applyTool('short-position')
      } else if (!meta && alt && !shift && code === 'KeyD') {
        applyTool('date-range')
      } else if (!meta && !alt && !shift && key === 'escape') {
        if (isFullscreen) setIsFullscreen(false)
        else if (indicatorPaletteOpen) setIndicatorPaletteOpen(false)
        else applyTool(null)
      } else if (
        !meta &&
        !alt &&
        !shift &&
        (key === 'backspace' || key === 'delete')
      ) {
        const snapshot = chartRef.current?.getSnapshot()
        const selected = snapshot?.selectedDrawingId
        if (selected) {
          runCommand({ type: 'removeDrawing', payload: { id: selected } })
        } else {
          handled = false
        }
      } else if (!meta && !alt && !shift && key in TIMEFRAME_SHORTCUT_MAP) {
        setTimeframe(TIMEFRAME_SHORTCUT_MAP[key])
      } else {
        handled = false
      }

      if (handled) {
        e.preventDefault()
      }
    },
    [
      applyTool,
      runCommand,
      setIsFullscreen,
      setIndicatorPaletteOpen,
      setTimeframe,
      isFullscreen,
      indicatorPaletteOpen,
      chartRef,
    ],
  )

  useChartPaneShortcuts(containerRef, handleKeyDown)

  const chartContent = (
    // tabIndex={-1} lets clicks move focus here, blurring inputs elsewhere so
    // plain-key shortcuts (timeframe digits, Delete) resume working.
    <div
      ref={containerRef}
      className="flex h-full flex-col outline-none"
      tabIndex={-1}
      onPointerDown={() => containerRef.current?.focus()}
    >
      <ChartToolbar />
      {noData && !hasSnapshot ? (
        <div className="relative flex min-h-0 flex-1">
          <PaneDataUnavailable
            pairKey={pairKey}
            market={chartConfig.market}
            onSelectMarket={setMarket}
          />
        </div>
      ) : (
        <PaneTransition
          className="relative flex min-h-0 flex-1"
          phase={hasSnapshot ? 'live' : 'switching'}
          marketLabel={marketLabel}
        >
          <ChartDrawingToolbar
            activeTool={activeTool}
            activeToolMeta={activeToolMeta}
            toolMode={drawingToolMode}
            onToolChange={applyTool}
            onToolModeChange={setDrawingToolMode}
            onClearAll={clearAll}
            onClearDrawings={clearAllDrawings}
            onClearIndicators={removeAllIndicators}
            canUndo={drawingHistory.canUndo}
            canRedo={drawingHistory.canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
          <TerminalChart
            chartRef={chartRef}
            series={chartSeries}
            timeframe={chartTimeframe}
            chartType={chartType}
            crosshairMode={crosshairMode}
            priceScaleMode={priceScaleMode}
            invertedScale={invertedScale}
            compareMode={compareScaleMode}
            drawingToolMode={drawingToolMode}
            activeTool={activeTool}
            drawingStyleDefaults={drawingStyleDefaults}
            pairKey={pairKey}
            onContextMenu={setContextMenuState}
            onRemoveIndicator={removeIndicator}
            onActiveToolChange={applyTool}
            onRequestTextInput={handleRequestTextInput}
            onViewportChange={handleChartViewportChange}
            onDrawingsChange={handleDrawingsChange}
            onChartReady={handleChartReady}
          />
          <ChartDrawingProperties
            chartRef={chartRef}
            runCommand={runCommand}
            onStyleChange={updateDrawingStyleDefault}
          />
          <ReplayControls />
        </PaneTransition>
      )}
      <IntelligenceStrip signal={latestSignal} />
    </div>
  )

  const overlays = (
    <>
      {/* Context menu */}
      <ChartContextMenu
        state={contextMenuState}
        onClose={() => setContextMenuState(null)}
        onAddIndicator={() => setIndicatorPaletteOpen(true)}
        onAddAlert={handleAddAlert}
        onDrawHLine={(price) =>
          runCommand({
            type: 'addDrawing',
            payload: {
              type: 'hline',
              price,
              color: '#ffb020',
              lineWidth: 1,
              visible: true,
            },
          } as ChartCommand)
        }
        onDrawTrendLine={() => applyTool('line')}
        onDrawRay={() => applyTool('ray')}
        onDrawArrow={() => applyTool('arrow')}
        onDrawFibonacci={() => applyTool('fibonacci')}
        onFitContent={() => runCommand({ type: 'fitContent', payload: {} })}
        onScrollToLatest={() =>
          runCommand({ type: 'scrollToLatest', payload: { bars: 200 } })
        }
        onDeleteDrawing={(id) =>
          runCommand({ type: 'removeDrawing', payload: { id } })
        }
      />

      {/* Text input dialog */}
      <TextInputDialog
        open={textInputDialog !== null}
        onOpenChange={(open) => {
          if (!open) setTextInputDialog(null)
        }}
        defaultText={textInputDialog?.currentText ?? ''}
        onSubmit={(text) => {
          if (textInputDialog) {
            runCommand({
              type: 'updateDrawing',
              payload: {
                id: textInputDialog.drawingId,
                patch: { content: text },
              },
            })
            setTextInputDialog(null)
          }
        }}
        onDelete={() => {
          if (textInputDialog) {
            runCommand({
              type: 'removeDrawing',
              payload: { id: textInputDialog.drawingId },
            })
            setTextInputDialog(null)
          }
        }}
      />

      {/* Indicator command palette */}
      <IndicatorPicker
        open={indicatorPaletteOpen}
        onOpenChange={setIndicatorPaletteOpen}
        activeIndicators={activeIndicators}
        onAddIndicator={addIndicator}
        seriesId={pairKey}
      />
    </>
  )

  if (isFullscreen) {
    return (
      <>
        <div className="h-full" />
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setIsFullscreen(false)
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="sm:max-w-none w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] p-0 gap-0"
          >
            <DialogTitle className="sr-only">Fullscreen Chart</DialogTitle>
            <DialogDescription className="sr-only">
              Chart in fullscreen mode. Press Escape to exit.
            </DialogDescription>
            {chartContent}
          </DialogContent>
        </Dialog>
        {overlays}
      </>
    )
  }

  return (
    <>
      {chartContent}
      {overlays}
    </>
  )
})
