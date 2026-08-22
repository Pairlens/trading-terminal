// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chart floor.
 *
 * It renders `FastFinancialChart` directly rather than reusing
 * `TerminalChart`. `TerminalChart` hardcodes the HUD, the indicators top bar,
 * the watermark, a 200-bar default viewport, `rightOffset: 20` and desktop
 * interaction flags — mobile wants the opposite of every one of those, and
 * adding seven props to a desktop component so it can disable itself is
 * exactly the restructuring the house rules forbid. What IS shared is the
 * theme hook, the price formatter, and — mandatorily — the memoization
 * discipline: every object prop gets its own `useMemo`, and the component is
 * `memo`. A new inline object literal in these props is a bug.
 *
 * The chart NEVER unmounts for the life of a mobile session. Panels layer over
 * it; the co-pilot draws on it while its own sheet covers two thirds of it.
 */
import { Suspense, memo, useCallback, useMemo, useRef } from 'react'
import { FastFinancialChart } from '@pairlens/fast-financial-charts/react'

import { CHART_TIME_AXIS_HEIGHT } from '../lib/mobile-geometry'
import { useMobileFocus } from '../mobile-focus-context'
import { isPlaceableTool } from './drawing-placement'
import { InspectHint, useInspectHint } from './inspect-hint'
import { ChartInspector } from './chart-inspector'
import { useChartInspect } from './use-chart-inspect'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { usePairlensChartTheme } from '@/hooks/use-chart-theme'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'
import {
  formatChartPrice,
  formatPredictionChartPrice,
} from '@/lib/format-price'
import { lazyChunk } from '@/lib/lazy-chunk'
import { track } from '@/lib/analytics-events'

/**
 * Lazy because it pulls the drawing-tool catalog in for its labels. By the
 * time a tool is armed the toolbar chunk that armed it has already loaded the
 * catalog, so this costs one small module and never touches the shell chunk.
 */
const CrosshairPlacement = lazyChunk(() => import('./crosshair-placement'))

export type MobileChartProps = {
  /**
   * 'full' when the chart owns the screen, 'compact' when a panel is docked
   * over it.
   *
   * It changes NOTHING about the chart's geometry — same box, same bars, same
   * gutter, so a panel opening cannot make the engine re-layout. Its one job
   * here is the placement layer below, which must not sit over a chart strip
   * whose remaining purpose is to be tapped.
   */
  band: 'full' | 'compact'
}

/** The design's Chart screen shows ~80 bars. */
const DEFAULT_BARS = 80

/**
 * The price gutter, in px (design §"Chart rendering" draws 56 on the Chart
 * screen). The engine's own default is 74, drawn for a desktop pane; on a
 * 402px phone that is 18% of the width spent on five digits. It is a theme
 * layout field, so this is a config change and not a charts-repo change.
 *
 * One value, not two: the design's narrower 52px gutter belonged to the
 * shrunken compact chart, and a chart that no longer resizes must not re-layout
 * its axis when a panel opens either.
 */
const PRICE_AXIS_WIDTH = 56

export const MobileChart = memo(function MobileChart({
  band,
}: MobileChartProps) {
  const {
    chartRef,
    chartSeries,
    chartTimeframe,
    chartType,
    compareScaleMode,
    crosshairMode,
    priceScaleMode,
    invertedScale,
    activeTool,
    drawingToolMode,
    drawingStyleDefaults,
  } = useChartConfig()
  const {
    applyTool,
    handleChartReady,
    handleChartViewportChange,
    handleDrawingsChange,
  } = useChartActions()

  // 'palette', not the board's 'card': the phone's chart is full-bleed and the
  // shell paints its own ground from this value (see lib/chart-paint.ts), so
  // the two agree already and a derived surface would only move both.
  const baseTheme = usePairlensChartTheme('palette')
  const frameRef = useRef<HTMLDivElement | null>(null)

  // `timeAxisHeight` is the engine's own default, pinned rather than inherited:
  // the limit-line overlay subtracts it to find the bottom of the plot box, and
  // an invariant two modules depend on should be written down in one of them.
  // `priceAxisWidth` is the same contract on the other axis — the crosshair
  // placement layer clamps the reticle out of the gutter with it.
  const theme = useMemo(
    () => ({
      ...baseTheme,
      fontSizeAxis: 10,
      layout: {
        timeAxisHeight: CHART_TIME_AXIS_HEIGHT,
        priceAxisWidth: PRICE_AXIS_WIDTH,
      },
    }),
    [baseTheme],
  )

  const crosshairConfig = useMemo(
    () => ({ mode: crosshairMode }),
    [crosshairMode],
  )

  const priceScale = useMemo(
    () => ({ inverted: invertedScale }),
    [invertedScale],
  )

  const timeScale = useMemo(
    () => ({
      rightOffset: 6,
      fixLeftEdge: true,
      shiftVisibleRangeOnNewBar: true,
    }),
    [],
  )

  // Constant, like the box it draws into: re-aiming the viewport at a smaller
  // bar count when a panel docks would zoom the series the user was reading.
  const defaultViewport = useMemo(
    () => ({ type: 'last-bars' as const, bars: DEFAULT_BARS }),
    [],
  )

  // Focus, not a stream: the pair and the venue change on navigation, which
  // already repaints this component. Nothing here ticks.
  const { focusedPair, focusedVenue } = useMobileFocus()
  const predictionPrices = useIsPredictionPair(focusedPair, focusedVenue)

  /**
   * Press and hold to read a bar.
   *
   * Gated on the same `band === 'full'` as placement, and off while a drawing
   * tool is armed — that tool's own reticle owns the finger, and two
   * crosshairs on one chart is one too many. Nothing here is mounted unless
   * the hold succeeds, so the cost of the feature on a chart nobody touches is
   * four pointer listeners.
   */
  const hint = useInspectHint()
  const inspectable = band === 'full' && !isPlaceableTool(activeTool)
  const retireHint = hint.retire
  const onArm = useCallback(() => {
    // From the gesture, never from the state change (see lib/haptics).
    track('mobile_chart_inspected', { timeframe: chartTimeframe })
    retireHint()
  }, [chartTimeframe, retireHint])
  const inspect = useChartInspect({
    enabled: inspectable,
    frameRef,
    onArm,
    resetKey: `${focusedVenue}:${focusedPair}:${chartTimeframe}`,
  })

  const localization = useMemo(
    () => ({
      priceFormatter: predictionPrices
        ? formatPredictionChartPrice
        : formatChartPrice,
    }),
    [predictionPrices],
  )

  const interaction = useMemo(
    () => ({
      // No wheel on a phone, and no keyboard to shortcut from. Kinetic scroll
      // is touch-only: enabling the mouse path costs a listener nothing here
      // ever fires.
      wheelZoom: false,
      dragPan: true,
      keyboardShortcuts: false,
      drawingSnap: crosshairMode === 'magnet',
      drawingToolMode,
      kineticScroll: { touch: true, mouse: false },
    }),
    [crosshairMode, drawingToolMode],
  )

  // `compareMode` below is not decoration. The phone has no compare UI, but
  // compare symbols persist per pair key and this provider is mounted without a
  // `stateScope`, so one added on the laptop is drawn here too. Left unset, the
  // engine fell back to its own `indexed` default: a prediction outcome with a
  // compare on it read `10099.5¢` up the axis on the phone while the same chart
  // read cents on the desktop, because only the desktop pane passed the prop.
  //
  // The wrapper exists so the placement layer can measure the chart's exact
  // box: it paints from a body portal (the band's scrim would swallow a
  // reticle rendered inside this stacking context) and has to be told where
  // the plot actually is.
  return (
    <div className="relative h-full w-full" ref={frameRef}>
      <FastFinancialChart
        activeTool={activeTool}
        chartType={chartType}
        className="h-full w-full"
        compareMode={compareScaleMode}
        crosshairConfig={crosshairConfig}
        defaultViewport={defaultViewport}
        drawingStyleDefaults={drawingStyleDefaults}
        interaction={interaction}
        localization={localization}
        onActiveToolChange={applyTool}
        onDrawingsChange={handleDrawingsChange}
        onReady={handleChartReady}
        onViewportChange={handleChartViewportChange}
        priceScale={priceScale}
        priceScaleMode={priceScaleMode}
        ref={chartRef}
        series={chartSeries}
        snapshotThrottleMs={200}
        theme={theme}
        timeframe={chartTimeframe}
        timeScale={timeScale}
      />

      {/* Drawing with a finger: the reticle replaces drag-to-draw for every
          tool that is not freehand. Freehand keeps the engine's own drag —
          a stroke is the one gesture a finger is better at.

          `band === 'full'` is the gate, and it is load-bearing rather than
          cosmetic: 'compact' means a panel is docked, the drawing toolbar has
          unmounted, and the chart strip's job is to be tapped to dismiss the
          panel. A capture layer left over an armed tool would eat that tap. */}
      {band === 'full' && isPlaceableTool(activeTool) ? (
        <Suspense fallback={null}>
          <CrosshairPlacement
            frameRef={frameRef}
            priceAxisWidth={PRICE_AXIS_WIDTH}
          />
        </Suspense>
      ) : null}

      {/* Reading with a finger. Mounted only once a hold has landed, so the
          chart carries no extra layer, no extra subscription and no extra
          paint until somebody asks a question of it.

          Statically imported, unlike the placement layer above: that one pulls
          the whole drawing-tool catalog in for its labels, this one imports
          nothing the shell does not already have. Behind `lazyChunk` it cost
          ~300ms between the hold landing and the crosshair appearing — on the
          one gesture whose entire promise is that it answers immediately. */}
      {inspect.armed ? (
        <ChartInspector
          frameRef={frameRef}
          onDismiss={inspect.dismiss}
          priceAxisWidth={PRICE_AXIS_WIDTH}
          store={inspect.store}
        />
      ) : null}

      {inspectable && hint.visible && !inspect.armed ? <InspectHint /> : null}
    </div>
  )
})
