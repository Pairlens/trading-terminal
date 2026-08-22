// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { MarketOption } from '@/hooks/use-available-markets'
import { CompareFeeds } from '@/components/terminal/compare-feeds'
import { useChartTerminalState } from '@/hooks/use-chart-terminal-state'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useActivePair } from '@/lib/active-pair-context'

export type ChartTerminalStateValue = ReturnType<typeof useChartTerminalState>

// ── Ticker Stream (updates on every ticker WS message ~1-3/sec) ─────

export type TickerStreamValue = Pick<
  ChartTerminalStateValue,
  | 'lastTradePrice'
  | 'bestBid'
  | 'bestAsk'
  | 'midPrice'
  | 'spread'
  | 'tradingStatus'
>

// ── Orderbook Stream (updates on every orderbook WS message ~1-5/sec)

export type OrderbookStreamValue = Pick<
  ChartTerminalStateValue,
  'orderbook' | 'baseTickSize' | 'orderbookStatus' | 'orderbookError'
>

// ── Candle Stream (updates on candle ticks ~1-3/sec) ─────────────────

export type CandleStreamValue = Pick<
  ChartTerminalStateValue,
  | 'candles'
  | 'latestCandle'
  | 'latestSignal'
  | 'signalScan'
  | 'status'
  | 'stale'
  | 'noData'
  | 'desktopOnly'
  | 'hasSnapshot'
  | 'errorMessage'
>

// ── Chart Config (changes on user interaction only) ──────────────────

export type ChartConfigValue = Pick<
  ChartTerminalStateValue,
  | 'market'
  | 'timeframe'
  | 'supportedTimeframes'
  | 'chartType'
  | 'crosshairMode'
  | 'priceScaleMode'
  | 'drawingToolMode'
  | 'showBidAsk'
  | 'invertedScale'
  | 'compareSymbols'
  | 'compareScaleMode'
  | 'replayActive'
  | 'replayCursor'
  | 'replayTotal'
  | 'activeTool'
  | 'activeToolMeta'
  | 'drawingHistory'
  | 'drawingStyleDefaults'
  | 'activeIndicators'
  | 'indicatorPaletteOpen'
  | 'isFullscreen'
  | 'contextMenuState'
  | 'textInputDialog'
  | 'chartRef'
  | 'chartSeries'
  | 'chartTimeframe'
>

// ── Chart Actions (stable callbacks) ─────────────────────────────────

export type ChartActionsValue = Pick<
  ChartTerminalStateValue,
  | 'setMarket'
  | 'setTimeframe'
  | 'setChartType'
  | 'setCrosshairMode'
  | 'setPriceScaleMode'
  | 'setDrawingToolMode'
  | 'setShowBidAsk'
  | 'setInvertedScale'
  | 'setCompareScaleMode'
  | 'addCompareSymbol'
  | 'removeCompareSymbol'
  | 'handleChartViewportChange'
  | 'handleDrawingsChange'
  | 'handleChartReady'
  | 'startReplay'
  | 'exitReplay'
  | 'stepReplay'
  | 'toggleReplayPlay'
  | 'setReplaySpeed'
  | 'applyTool'
  | 'addIndicator'
  | 'updateIndicator'
  | 'removeIndicator'
  | 'removeAllIndicators'
  | 'clearAll'
  | 'clearAllDrawings'
  | 'updateDrawingStyleDefault'
  | 'setIndicatorPaletteOpen'
  | 'setIsFullscreen'
  | 'setContextMenuState'
  | 'setTextInputDialog'
  | 'runCommand'
>

// ── Contexts ─────────────────────────────────────────────────────────

const TickerStreamContext = createContext<TickerStreamValue | null>(null)
const OrderbookStreamContext = createContext<OrderbookStreamValue | null>(null)
const CandleStreamContext = createContext<CandleStreamValue | null>(null)
const ChartConfigContext = createContext<ChartConfigValue | null>(null)
const ChartActionsContext = createContext<ChartActionsValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────

type ChartTerminalProviderProps = {
  pairKey: string
  markets: Array<MarketOption>
  defaultMarket: string
  defaultTimeframe?: string
  /** Per-pane persistence scope — see useChartTerminalState options.scope. */
  stateScope?: string
  /** Venue owned from above (the chart route's URL) — see the same options. */
  marketOverride?: string
  /**
   * Asset class owned from above, for the shells that read it off an address.
   * See `useChartTerminalState`'s option of the same name: it exists so the
   * stale-venue correction never substitutes a venue that is half of the
   * instrument's identity.
   */
  instrumentClass?: InstrumentClass
  onMarketChange?: (market: string) => void
  children: ReactNode
}

export function ChartTerminalProvider({
  pairKey,
  markets,
  defaultMarket,
  defaultTimeframe,
  stateScope,
  marketOverride,
  instrumentClass,
  onMarketChange,
  children,
}: ChartTerminalProviderProps) {
  const state = useChartTerminalState(pairKey, {
    availableMarkets: markets,
    defaultMarket,
    defaultTimeframe,
    scope: stateScope,
    marketOverride,
    instrumentClass,
    onMarketChange,
  })

  const tickerStream = useMemo<TickerStreamValue>(
    () => ({
      lastTradePrice: state.lastTradePrice,
      bestBid: state.bestBid,
      bestAsk: state.bestAsk,
      midPrice: state.midPrice,
      spread: state.spread,
      tradingStatus: state.tradingStatus,
    }),
    [
      state.lastTradePrice,
      state.bestBid,
      state.bestAsk,
      state.midPrice,
      state.spread,
      state.tradingStatus,
    ],
  )

  const orderbookStream = useMemo<OrderbookStreamValue>(
    () => ({
      orderbook: state.orderbook,
      baseTickSize: state.baseTickSize,
      orderbookStatus: state.orderbookStatus,
      orderbookError: state.orderbookError,
    }),
    [
      state.orderbook,
      state.baseTickSize,
      state.orderbookStatus,
      state.orderbookError,
    ],
  )

  const candleStream = useMemo<CandleStreamValue>(
    () => ({
      candles: state.candles,
      latestCandle: state.latestCandle,
      latestSignal: state.latestSignal,
      signalScan: state.signalScan,
      status: state.status,
      stale: state.stale,
      noData: state.noData,
      desktopOnly: state.desktopOnly,
      hasSnapshot: state.hasSnapshot,
      errorMessage: state.errorMessage,
    }),
    [
      state.candles,
      state.latestCandle,
      state.latestSignal,
      state.signalScan,
      state.status,
      state.stale,
      state.noData,
      state.desktopOnly,
      state.hasSnapshot,
      state.errorMessage,
    ],
  )

  const chartConfig = useMemo<ChartConfigValue>(
    () => ({
      market: state.market,
      timeframe: state.timeframe,
      supportedTimeframes: state.supportedTimeframes,
      chartType: state.chartType,
      crosshairMode: state.crosshairMode,
      priceScaleMode: state.priceScaleMode,
      drawingToolMode: state.drawingToolMode,
      showBidAsk: state.showBidAsk,
      invertedScale: state.invertedScale,
      compareSymbols: state.compareSymbols,
      compareScaleMode: state.compareScaleMode,
      replayActive: state.replayActive,
      replayCursor: state.replayCursor,
      replayTotal: state.replayTotal,
      activeTool: state.activeTool,
      activeToolMeta: state.activeToolMeta,
      drawingHistory: state.drawingHistory,
      drawingStyleDefaults: state.drawingStyleDefaults,
      activeIndicators: state.activeIndicators,
      indicatorPaletteOpen: state.indicatorPaletteOpen,
      isFullscreen: state.isFullscreen,
      contextMenuState: state.contextMenuState,
      textInputDialog: state.textInputDialog,
      chartRef: state.chartRef,
      chartSeries: state.chartSeries,
      chartTimeframe: state.chartTimeframe,
    }),
    [
      state.market,
      state.timeframe,
      state.supportedTimeframes,
      state.chartType,
      state.crosshairMode,
      state.priceScaleMode,
      state.drawingToolMode,
      state.showBidAsk,
      state.invertedScale,
      state.compareSymbols,
      state.compareScaleMode,
      state.replayActive,
      state.replayCursor,
      state.replayTotal,
      state.activeTool,
      state.activeToolMeta,
      state.drawingHistory,
      state.drawingStyleDefaults,
      state.activeIndicators,
      state.indicatorPaletteOpen,
      state.isFullscreen,
      state.contextMenuState,
      state.textInputDialog,
      state.chartSeries,
      state.chartTimeframe,
    ],
  )

  const chartActions = useMemo<ChartActionsValue>(
    () => ({
      setMarket: state.setMarket,
      setTimeframe: state.setTimeframe,
      setChartType: state.setChartType,
      setCrosshairMode: state.setCrosshairMode,
      setPriceScaleMode: state.setPriceScaleMode,
      setDrawingToolMode: state.setDrawingToolMode,
      setShowBidAsk: state.setShowBidAsk,
      setInvertedScale: state.setInvertedScale,
      setCompareScaleMode: state.setCompareScaleMode,
      addCompareSymbol: state.addCompareSymbol,
      removeCompareSymbol: state.removeCompareSymbol,
      handleChartViewportChange: state.handleChartViewportChange,
      handleDrawingsChange: state.handleDrawingsChange,
      handleChartReady: state.handleChartReady,
      startReplay: state.startReplay,
      exitReplay: state.exitReplay,
      stepReplay: state.stepReplay,
      toggleReplayPlay: state.toggleReplayPlay,
      setReplaySpeed: state.setReplaySpeed,
      applyTool: state.applyTool,
      addIndicator: state.addIndicator,
      updateIndicator: state.updateIndicator,
      removeIndicator: state.removeIndicator,
      removeAllIndicators: state.removeAllIndicators,
      clearAll: state.clearAll,
      clearAllDrawings: state.clearAllDrawings,
      updateDrawingStyleDefault: state.updateDrawingStyleDefault,
      setIndicatorPaletteOpen: state.setIndicatorPaletteOpen,
      setIsFullscreen: state.setIsFullscreen,
      setContextMenuState: state.setContextMenuState,
      setTextInputDialog: state.setTextInputDialog,
      runCommand: state.runCommand,
    }),
    [
      state.setMarket,
      state.setTimeframe,
      state.setChartType,
      state.setCrosshairMode,
      state.setPriceScaleMode,
      state.setDrawingToolMode,
      state.setShowBidAsk,
      state.setInvertedScale,
      state.setCompareScaleMode,
      state.addCompareSymbol,
      state.removeCompareSymbol,
      state.handleChartViewportChange,
      state.handleDrawingsChange,
      state.handleChartReady,
      state.startReplay,
      state.exitReplay,
      state.stepReplay,
      state.toggleReplayPlay,
      state.setReplaySpeed,
      state.applyTool,
      state.addIndicator,
      state.updateIndicator,
      state.removeIndicator,
      state.removeAllIndicators,
      state.clearAll,
      state.clearAllDrawings,
      state.updateDrawingStyleDefault,
      state.setIndicatorPaletteOpen,
      state.setIsFullscreen,
      state.setContextMenuState,
      state.setTextInputDialog,
      state.runCommand,
    ],
  )

  return (
    <ChartActionsContext value={chartActions}>
      <ChartConfigContext value={chartConfig}>
        <TickerStreamContext value={tickerStream}>
          <OrderbookStreamContext value={orderbookStream}>
            <CandleStreamContext value={candleStream}>
              <CompareFeeds
                compareSymbols={state.compareSymbols}
                timeframe={state.timeframe}
                onSnapshot={state.handleCompareSnapshot}
                onCandle={state.handleCompareCandle}
              />
              {children}
            </CandleStreamContext>
          </OrderbookStreamContext>
        </TickerStreamContext>
      </ChartConfigContext>
    </ChartActionsContext>
  )
}

// ── Config / action hooks ───────────────────────────────────────────

export function useChartConfig(): ChartConfigValue {
  const ctx = useContext(ChartConfigContext)
  if (!ctx)
    throw new Error(
      'useChartConfig must be used within a ChartTerminalProvider',
    )
  return ctx
}

export function useChartActions(): ChartActionsValue {
  const ctx = useContext(ChartActionsContext)
  if (!ctx)
    throw new Error(
      'useChartActions must be used within a ChartTerminalProvider',
    )
  return ctx
}

// ── Optional hooks (return null instead of throwing) ────────────────

export function useOptionalTickerData(): TickerStreamValue | null {
  return useContext(TickerStreamContext)
}

export function useOptionalOrderbookData(): OrderbookStreamValue | null {
  return useContext(OrderbookStreamContext)
}

export function useOptionalCandleData(): CandleStreamValue | null {
  return useContext(CandleStreamContext)
}

export function useOptionalChartConfig(): ChartConfigValue | null {
  return useContext(ChartConfigContext)
}

export function useOptionalChartActions(): ChartActionsValue | null {
  return useContext(ChartActionsContext)
}

// ── Auto Provider (mounts ChartTerminalProvider when active pair exists) ─

export function ChartTerminalAutoProvider({
  children,
}: {
  children: ReactNode
}) {
  const { activePair } = useActivePair()
  const { markets, defaultMarket } = useAvailableMarkets()

  if (!activePair || markets.length === 0) {
    return <>{children}</>
  }

  return (
    <ChartTerminalProvider
      pairKey={activePair.pairKey}
      markets={markets}
      defaultMarket={activePair.market ?? defaultMarket}
    >
      {children}
    </ChartTerminalProvider>
  )
}
