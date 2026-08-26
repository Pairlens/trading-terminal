// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
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
import type { CopilotMarketContext } from '@/lib/copilot/tool-deps'
import type { ChartServiceHandle } from '@/lib/assistant-core/chart-service'
import {
  useOptionalCandleData,
  useOptionalChartActions,
  useOptionalChartConfig,
} from '@/lib/chart-terminal-context'
import { CHART_SERVICE_NAME } from '@/lib/assistant-core/chart-service'
import { buildChartSnapshot } from '@/lib/assistant-core/client-tools'
import { useChartPaneShortcuts } from '@/lib/chart-shortcuts'
import { matchCommand } from '@/lib/keybindings/store'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneTransition } from '@/components/layout/pane-transition'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { DesktopOnlyState } from '@/components/layout/desktop-only-state'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'
import { useNotificationStore } from '@/stores/notification-store'

/** Command-id prefixes the chart dispatches generically. */
const TOOL_COMMAND_PREFIX = 'chart.tool.'
const TIMEFRAME_COMMAND_PREFIX = 'chart.timeframe.'

export function ChartPane() {
  const candleData = useOptionalCandleData()
  const chartConfig = useOptionalChartConfig()
  const chartActions = useOptionalChartActions()
  const activePair = usePanePair()

  // The live candle context the assistant reads, mirrored into a ref rather
  // than passed down: this component already re-renders on every candle tick
  // (it subscribes to the stream), and the memoized inner pane must not join
  // it. A ref object is a stable prop, so the memo still holds.
  const marketContextRef = useRef<CopilotMarketContext>({})
  marketContextRef.current = {
    candles: candleData?.candles ?? [],
    signal: candleData?.latestSignal ?? undefined,
  }

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
      marketContextRef={marketContextRef}
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
  marketContextRef,
}: {
  pairKey: string
  signalScan: SignalScan | null
  hasSnapshot: boolean
  noData: boolean
  desktopOnly: boolean
  chartConfig: NonNullable<ReturnType<typeof useOptionalChartConfig>>
  chartActions: NonNullable<ReturnType<typeof useOptionalChartActions>>
  marketContextRef: React.RefObject<CopilotMarketContext>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const serviceRegistry = useServiceRegistry()
  const { markets } = useAvailableMarkets()
  // A probability series reads in cents on both axes; the venue's asset class
  // is the signal, with the directory pin covering a shared link.
  const predictionPrices = useIsPredictionPair(pairKey, chartConfig.market)
  const marketLabel =
    markets.find((m) => m.value === chartConfig.market)?.label ??
    chartConfig.market
  const credentialGate = useMarketCredentialGate(chartConfig.market)

  const {
    activeTool,
    activeToolMeta,
    drawingToolMode,
    chartRef,
    chartSeries,
    chartTimeframe,
    chartType,
    supportedTimeframes,
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
  // consumers (e.g. copilot from pairlens-intelligence) can discover them,
  // and so the assistant, which mounts above the router outlet where
  // ChartTerminalContext does not reach, can drive the chart the user is on.
  //
  // Everything is read through this ref so the object we register is stable
  // for the pane's lifetime. `register` notifies every listener on each call,
  // and the config below changes on every venue or timeframe switch.
  const live = {
    chartRef,
    chartActions,
    market: chartConfig.market,
    pair: pairKey,
    timeframe: chartConfig.timeframe,
    marketContextRef,
  }
  const liveRef = useRef(live)
  liveRef.current = live

  const chartService = useMemo<ChartServiceHandle>(
    () => ({
      get chartRef() {
        return liveRef.current.chartRef
      },
      get chartActions() {
        return liveRef.current.chartActions
      },
      get market() {
        return liveRef.current.market
      },
      get pair() {
        return liveRef.current.pair
      },
      get timeframe() {
        return liveRef.current.timeframe
      },
      addIndicator: (indicator) =>
        liveRef.current.chartActions.addIndicator(indicator),
      removeIndicator: (id) => liveRef.current.chartActions.removeIndicator(id),
      removeAllIndicators: () =>
        liveRef.current.chartActions.removeAllIndicators(),
      getSnapshot: () =>
        buildChartSnapshot(liveRef.current.chartRef.current ?? null),
      // Candles and the latest signal only. The ticker is deliberately absent:
      // subscribing to it here would make the chart pane re-render on every
      // ticker message, which is exactly the invariant the pane exists to keep.
      getMarketContext: () => liveRef.current.marketContextRef.current,
    }),
    [],
  )

  // `useServiceRegistry()` hands back a fresh wrapper on every render, so it
  // can never be a dependency: it would re-register (and notify every
  // listener) on each one.
  const serviceRegistryRef = useRef(serviceRegistry)
  serviceRegistryRef.current = serviceRegistry

  useEffect(
    () => serviceRegistryRef.current.register(CHART_SERVICE_NAME, chartService),
    [chartService],
  )

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
        const requested = commandId.slice(TIMEFRAME_COMMAND_PREFIX.length)
        // All eleven digits are bound, but the venue being charted may serve
        // three. Storing an interval it cannot draw is worse than doing
        // nothing: the chart clamps and stays where it was, so the keypress
        // looks like a no-op while it has quietly replaced the preference the
        // user gets back on their next CEX — and fired a timeframe_changed
        // event for an interval that was never charted. So an unsupported
        // digit is simply not a timeframe command here.
        if (supportedTimeframes.includes(requested)) setTimeframe(requested)
        else handled = false
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
      supportedTimeframes,
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
            pairKey={pairKey}
          />
        </div>
      ) : /* Ahead of `noData`, because it is the CAUSE of it: nothing was ever
            subscribed, so "this venue has no data for the pair" would blame
            the venue for a locked keychain and offer to switch away from it. */
      credentialGate.state !== 'ok' ? (
        <div className="relative flex min-h-0 flex-1">
          <PaneCredentialsRequired
            state={credentialGate.state}
            market={chartConfig.market}
            venueLabel={credentialGate.venueLabel}
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
            predictionPrices={predictionPrices}
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
      {!desktopOnly &&
        credentialGate.state === 'ok' &&
        !(noData && !hasSnapshot) && <IntelligenceStrip scan={signalScan} />}
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
