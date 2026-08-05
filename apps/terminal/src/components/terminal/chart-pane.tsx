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
import { ChartToolbar } from './chart-toolbar'
import { ReplayControls } from './replay-controls'
import { IndicatorPicker } from './indicator-picker'
import { IntelligenceStrip } from './intelligence-strip'
import { TerminalChart } from './terminal-chart'
import { TextInputDialog } from './text-input-dialog'
import type { SignalScan } from '@pairlens/strategy-engine'
import type {
  ChartCommand,
  DrawingToolType,
} from '@pairlens/fast-financial-charts/types'
import {
  useOptionalCandleData,
  useOptionalChartActions,
  useOptionalChartConfig,
} from '@/lib/chart-terminal-context'
import { useChartPaneShortcuts } from '@/lib/chart-shortcuts'
import { matchCommand } from '@/lib/keybindings/store'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneTransition } from '@/components/layout/pane-transition'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { DesktopOnlyState } from '@/components/layout/desktop-only-state'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useNotificationStore } from '@/stores/notification-store'

/** Command-id prefixes the chart dispatches generically. */
const TOOL_COMMAND_PREFIX = 'chart.tool.'
const TIMEFRAME_COMMAND_PREFIX = 'chart.timeframe.'

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
      signalScan={candleData.signalScan}
      hasSnapshot={candleData.hasSnapshot}
      noData={candleData.noData}
      desktopOnly={candleData.desktopOnly}
      chartConfig={chartConfig}
      chartActions={chartActions}
    />
  )
}

const ChartPaneInner = memo(function ChartPaneInner({
  pairKey,
  signalScan,
  hasSnapshot,
  noData,
  desktopOnly,
  chartConfig,
  chartActions,
}: {
  pairKey: string
  signalScan: SignalScan | null
  hasSnapshot: boolean
  noData: boolean
  desktopOnly: boolean
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
  // Chords come from the keybinding store: this resolves the event to a command
  // id and dispatches on that, so every one of them is user-rebindable.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const commandId = matchCommand(e, 'chart')
      if (!commandId) return

      let handled = true

      if (commandId.startsWith(TOOL_COMMAND_PREFIX)) {
        applyTool(
          commandId.slice(TOOL_COMMAND_PREFIX.length) as DrawingToolType,
        )
      } else if (commandId.startsWith(TIMEFRAME_COMMAND_PREFIX)) {
        setTimeframe(commandId.slice(TIMEFRAME_COMMAND_PREFIX.length))
      } else if (commandId === 'chart.indicators') {
        setIndicatorPaletteOpen(true)
      } else if (commandId === 'chart.undo') {
        runCommand({ type: 'undo', payload: {} })
      } else if (commandId === 'chart.redo') {
        runCommand({ type: 'redo', payload: {} })
      } else if (commandId === 'chart.cancel') {
        if (isFullscreen) setIsFullscreen(false)
        else if (indicatorPaletteOpen) setIndicatorPaletteOpen(false)
        else applyTool(null)
      } else if (commandId === 'chart.deleteDrawing') {
        const selected = chartRef.current?.getSnapshot()?.selectedDrawingId
        if (selected) {
          runCommand({ type: 'removeDrawing', payload: { id: selected } })
        } else {
          // Nothing selected: leave Delete/Backspace to whoever else wants it.
          handled = false
        }
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
      {/* Backstop only: a venue that DECLARES `requiresDesktop` never gets
          here, because LayoutShell replaced the whole workspace before any
          pane mounted. This catches a connector that refuses without having
          declared it. */}
      {desktopOnly ? (
        <div className="relative flex min-h-0 flex-1">
          <DesktopOnlyState
            market={chartConfig.market}
            onSelectMarket={setMarket}
          />
        </div>
      ) : noData && !hasSnapshot ? (
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
      {/* No candles will ever arrive, so the strip's "Analyzing market…" would
          spin under an empty state that has already given the verdict. */}
      {!desktopOnly && !(noData && !hasSnapshot) && (
        <IntelligenceStrip scan={signalScan} />
      )}
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
            <DialogTitle className="sr-only">
              {t('chart.fullscreenTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('chart.fullscreenHint')}
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
