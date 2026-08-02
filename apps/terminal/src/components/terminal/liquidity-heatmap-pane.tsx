// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'

import { FastFinancialChart } from 'fast-financial-charts/react'
import { usePanePair } from '@pairlens/plugin-sdk'
import type {
  ChartSeriesInput,
  FastFinancialChartRef,
  PrimitiveCoordinateHelpers,
  PrimitivePaneRenderContext,
  Timeframe,
} from 'fast-financial-charts/types'

import type {
  HeatmapDataStore,
  HeatmapSample,
} from '@/hooks/use-liquidity-heatmap'
import {
  useOptionalCandleData,
  useOptionalChartConfig,
  useOptionalOrderbookData,
} from '@/lib/chart-terminal-context'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { usePairlensChartTheme } from '@/hooks/use-chart-theme'
import {
  findFirstSampleIndex,
  useLiquidityHeatmapData,
} from '@/hooks/use-liquidity-heatmap'

// ── Color scale: dark purple → blue → cyan → green → yellow ─────────

// Module-level so it is allocated once, not rebuilt on every liquidityColor call.
const LIQ_STOPS: Array<[number, number, number]> = [
  [26, 5, 51],
  [45, 27, 105],
  [30, 96, 145],
  [44, 160, 137],
  [94, 201, 98],
  [253, 231, 37],
]

function liquidityColor(t: number): [number, number, number, number] {
  if (t <= 0) return [26, 5, 51, 0.05]
  if (t >= 1) return [253, 231, 37, 0.75]

  const segment = t * (LIQ_STOPS.length - 1)
  const idx = Math.min(Math.floor(segment), LIQ_STOPS.length - 2)
  const frac = segment - idx

  const a = LIQ_STOPS[idx]
  const b = LIQ_STOPS[idx + 1]
  return [
    Math.round(a[0] + frac * (b[0] - a[0])),
    Math.round(a[1] + frac * (b[1] - a[1])),
    Math.round(a[2] + frac * (b[2] - a[2])),
    0.15 + 0.6 * t,
  ]
}

// Prebuilt fill-string LUT keyed by the quantized colour ramp (t → 0..LUT-1).
// The per-cell hot path just indexes this — no per-cell string building, no
// `toFixed`, no `liquidityColor` tuple allocation. The cell's `fade` is applied
// via ctx.globalAlpha (which multiplies the fillStyle alpha), so a single
// fade-independent string per bucket is enough.
const LIQ_LUT_SIZE = 256
const LIQ_FILL_LUT: Array<string> = Array.from(
  { length: LIQ_LUT_SIZE },
  (_, i) => {
    const [r, g, b, a] = liquidityColor((i + 0.5) / LIQ_LUT_SIZE)
    return `rgba(${r},${g},${b},${a})`
  },
)

// The legend gradient is static — cache it in an offscreen canvas keyed by
// dimensions and blit it, instead of re-rasterizing ~140 rows (each an
// allocating liquidityColor call) on every repaint. Keyed in a small map (not
// a single slot) so two heatmap panes of different heights don't thrash the
// cache and re-allocate a canvas every frame.
const LEGEND_CACHE_MAX = 8
const legendGradientCache = new Map<string, HTMLCanvasElement>()
function legendGradientCanvas(
  barW: number,
  barH: number,
): HTMLCanvasElement | null {
  const h = Math.max(1, Math.round(barH))
  const key = `${barW}x${h}`
  const cached = legendGradientCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = barW
  canvas.height = h
  const gctx = canvas.getContext('2d')
  if (!gctx) return null
  for (let y = 0; y < h; y++) {
    const [r, g, b] = liquidityColor(1 - y / h)
    gctx.fillStyle = `rgb(${r},${g},${b})`
    gctx.fillRect(0, y, barW, 1)
  }

  if (legendGradientCache.size >= LEGEND_CACHE_MAX) {
    const oldest = legendGradientCache.keys().next().value
    if (oldest !== undefined) legendGradientCache.delete(oldest)
  }
  legendGradientCache.set(key, canvas)
  return canvas
}

// ── Bin drawing helper ───────────────────────────────────────────────

// Draws at the caller's current ctx.globalAlpha (used to fade projected
// columns). Fill colour comes from the prebuilt LUT — no per-cell allocation.
function drawBins(
  ctx: CanvasRenderingContext2D,
  sample: HeatmapSample,
  coords: PrimitiveCoordinateHelpers,
  logMax: number,
  x: number,
  w: number,
) {
  const { bins, priceLow, binSize } = sample
  const rx = Math.round(x)
  const rw = Math.ceil(w) + 1
  for (let b = 0; b < bins.length; b++) {
    const val = bins[b]
    if (val <= 0) continue

    const binPriceBot = priceLow + b * binSize
    const binPriceTop = binPriceBot + binSize

    const yTop = coords.priceToY(binPriceTop)
    const yBot = coords.priceToY(binPriceBot)
    const cellH = yBot - yTop
    if (cellH < 0.3) continue

    const t = Math.log1p(val) / logMax
    const idx = t >= 1 ? LIQ_LUT_SIZE - 1 : (t * LIQ_LUT_SIZE) | 0

    ctx.fillStyle = LIQ_FILL_LUT[idx]
    ctx.fillRect(rx, Math.round(yTop), rw, Math.ceil(cellH) + 1)
  }
}

// ── Primitive renderer ───────────────────────────────────────────────

/**
 * For each visible candle bar, finds all heatmap samples within that
 * bar's time range and renders them as sub-columns. Bars without real
 * data show the latest orderbook snapshot projected backward with
 * fading alpha.
 */
function renderHeatmapPrimitive(
  renderCtx: PrimitivePaneRenderContext,
  store: HeatmapDataStore,
) {
  const { ctx, bars, viewport, coords, height } = renderCtx
  const { meta, samples } = store
  if (samples.length === 0 || meta.maxLiquidity <= 0 || meta.binSize <= 0)
    return

  const logMax = Math.log1p(meta.maxLiquidity)
  const startIdx = Math.max(0, viewport.startIndex)
  const endIdx = Math.min(bars.length - 1, viewport.endIndex)

  // The engine reuses this overlay context for every later draw and does not
  // save/restore around primitives — so start from a known alpha and never
  // leave it changed on return (projection is the only thing that fades it).
  ctx.globalAlpha = 1

  // Find the latest sample for projection
  const latestSample = samples[samples.length - 1] ?? null

  // Track which bars have real data so projection skips them
  const barsWithData = new Set<number>()

  // ── Draw real heatmap cells ────────────────────────────────────

  for (let i = startIdx; i <= endIdx; i++) {
    const bar = bars[i]
    if (!bar) continue

    const barStartTs = bar.ts
    const nextBar = bars[i + 1]
    const barEndTs = nextBar
      ? nextBar.ts
      : i > 0
        ? bar.ts + (bar.ts - bars[i - 1].ts)
        : bar.ts + 60_000

    const sampleStart = findFirstSampleIndex(samples, barStartTs)
    const sampleEnd = findFirstSampleIndex(samples, barEndTs)
    const count = sampleEnd - sampleStart
    if (count <= 0) continue

    barsWithData.add(i)

    const barX = coords.indexToX(i)
    const barXEnd = coords.indexToX(i + 1)
    const barW = barXEnd - barX
    const subColW = barW / count

    for (let s = 0; s < count; s++) {
      const sample = samples[sampleStart + s]!
      const subX = barX + s * subColW

      drawBins(ctx, sample, coords, logMax, subX, subColW)
    }
  }

  // ── Project latest snapshot backward (fading) ──────────────────
  // Fill bars that have no real data with the latest orderbook
  // snapshot, fading alpha from right to left.

  if (latestSample) {
    // Find the rightmost bar with real data (or the last visible bar)
    let projectionAnchor = endIdx
    for (let i = endIdx; i >= startIdx; i--) {
      if (barsWithData.has(i)) {
        projectionAnchor = i
        break
      }
    }

    // Project leftward from the anchor
    const projectionBars = projectionAnchor - startIdx
    if (projectionBars > 0) {
      for (let i = projectionAnchor - 1; i >= startIdx; i--) {
        if (barsWithData.has(i)) continue

        // Fade: 1.0 at anchor → 0.0 at startIdx
        const distFromAnchor = projectionAnchor - i
        const fade = Math.max(0, 1 - distFromAnchor / projectionBars)
        if (fade < 0.02) break

        const barX = coords.indexToX(i)
        const barXEnd = coords.indexToX(i + 1)
        const barW = barXEnd - barX

        ctx.globalAlpha = fade
        drawBins(ctx, latestSample, coords, logMax, barX, barW)
      }
      ctx.globalAlpha = 1
    }
  }

  // ── Draw color legend (top-left corner) ──────────────────────────

  const legendBarW = 16
  const legendBarH = Math.min(height * 0.35, 140)
  const legendPadX = 8
  const legendPadY = 6
  const legendLabelW = 48
  const legendTotalW = legendPadX + legendBarW + 6 + legendLabelW + legendPadX
  const legendTotalH = legendPadY + 14 + legendBarH + 14 + legendPadY
  const legendX = 6
  const legendY = 6

  // Background panel
  ctx.fillStyle = 'rgba(13, 1, 23, 0.85)'
  ctx.beginPath()
  ctx.roundRect(legendX, legendY, legendTotalW, legendTotalH, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(legendX, legendY, legendTotalW, legendTotalH, 4)
  ctx.stroke()

  const barX = legendX + legendPadX
  const barTop = legendY + legendPadY + 14
  const labelX = barX + legendBarW + 6

  // Gradient bar (static — blit the cached raster)
  const gradient = legendGradientCanvas(legendBarW, legendBarH)
  if (gradient) ctx.drawImage(gradient, barX, barTop)

  // Max label (top)
  ctx.fillStyle = '#d0c8e0'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(formatCompactValue(meta.maxLiquidity), barX, barTop - 3)

  // Mid label
  ctx.fillStyle = '#8a80a0'
  ctx.font = '9px monospace'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    formatCompactValue(meta.maxLiquidity * 0.5),
    labelX,
    barTop + legendBarH * 0.5,
  )

  // Zero label (bottom)
  ctx.fillStyle = '#8a80a0'
  ctx.textBaseline = 'top'
  ctx.fillText('0', barX, barTop + legendBarH + 3)
}

function formatCompactValue(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
  return val.toFixed(0)
}

// ── Pane entry point ─────────────────────────────────────────────────

export function LiquidityHeatmapPane() {
  const activePair = usePanePair()
  const orderbookData = useOptionalOrderbookData()
  const candleData = useOptionalCandleData()
  const chartConfig = useOptionalChartConfig()

  if (!activePair) {
    return <PanePairPicker />
  }

  if (!candleData?.hasSnapshot) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading candles...</span>
      </div>
    )
  }

  return (
    <LiquidityHeatmapInner
      pairKey={activePair.pairKey}
      candles={candleData.candles}
      timeframe={(chartConfig?.timeframe as Timeframe) ?? '1m'}
      orderbookData={orderbookData}
    />
  )
}

// ── Inner component ──────────────────────────────────────────────────

function LiquidityHeatmapInner({
  pairKey,
  candles,
  timeframe,
  orderbookData,
}: {
  pairKey: string
  candles: Array<{
    ts: number
    open: number
    high: number
    low: number
    close: number
    volume: number
  }>
  timeframe: Timeframe
  orderbookData: ReturnType<typeof useOptionalOrderbookData>
}) {
  const chartRef = useRef<FastFinancialChartRef | null>(null)
  const primitiveIdRef = useRef<string | null>(null)
  const theme = usePairlensChartTheme()

  // Accumulate orderbook samples (independent of candle timestamps)
  const heatmapStore = useLiquidityHeatmapData(orderbookData)

  // Chart series from shared candle data (matches main chart timeframe)
  const series = useMemo<Array<ChartSeriesInput>>(
    () => [
      {
        id: pairKey,
        label: pairKey,
        bars: candles.map((c) => ({
          ts: c.ts,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
      },
    ],
    [pairKey, candles],
  )

  // Nudge the chart to repaint by re-sending the last candle tick
  const nudgeRedraw = useCallback(() => {
    const ref = chartRef.current
    if (!ref) return
    const bars = ref.data(pairKey)
    if (!bars?.length) return
    const last = bars[bars.length - 1]
    ref.applyTick({
      seriesId: pairKey,
      ts: last.ts,
      price: last.close,
      volume: last.volume,
    })
  }, [pairKey])

  // Register the heatmap primitive when the chart is ready
  const handleReady = useCallback(
    (ref: FastFinancialChartRef) => {
      chartRef.current = ref

      if (primitiveIdRef.current) {
        ref.removePrimitive(primitiveIdRef.current)
      }

      const id = ref.addPrimitive({
        seriesId: pairKey,
        zOrder: 'behindSeries',
        paneRenderer: (ctx: PrimitivePaneRenderContext) => {
          renderHeatmapPrimitive(ctx, heatmapStore.current)
        },
      })
      primitiveIdRef.current = id

      // The chart already finished its initial render before the primitive
      // was added — force a repaint so it shows immediately.
      requestAnimationFrame(nudgeRedraw)
    },
    [pairKey, heatmapStore, nudgeRedraw],
  )

  // Clean up primitive on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current && primitiveIdRef.current) {
        chartRef.current.removePrimitive(primitiveIdRef.current)
      }
    }
  }, [])

  // Force chart redraws when new heatmap data arrives
  const versionRef = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      const v = heatmapStore.current.version
      if (v !== versionRef.current) {
        versionRef.current = v
        nudgeRedraw()
      }
    }, 500)
    return () => clearInterval(id)
  }, [heatmapStore, nudgeRedraw])

  const defaultViewport = useMemo(
    () => ({ type: 'last-bars' as const, bars: 60 }),
    [],
  )

  const timeScale = useMemo(
    () => ({
      rightOffset: 5,
      fixLeftEdge: true,
      shiftVisibleRangeOnNewBar: true,
    }),
    [],
  )

  const interaction = useMemo(
    () => ({
      wheelZoom: true,
      dragPan: true,
      keyboardShortcuts: true,
      kineticScroll: { touch: true, mouse: true },
    }),
    [],
  )

  return (
    <div className="relative h-full w-full overflow-hidden">
      <FastFinancialChart
        series={series}
        timeframe={timeframe}
        chartType="candles"
        theme={theme}
        className="h-full w-full"
        defaultViewport={defaultViewport}
        timeScale={timeScale}
        interaction={interaction}
        snapshotThrottleMs={120}
        onReady={handleReady}
      />
    </div>
  )
}
