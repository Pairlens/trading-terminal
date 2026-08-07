// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The hero card on /charts: one real @pairlens/fast-financial-charts instance streaming a
// seeded synthetic BTC-USD, under page-owned chrome. Every chip is plain HTML
// driving plain library props — the engine ships no CSS classes, so the frame,
// the labels and the price readout are all ours.
//
// The card lands with a trend line, a resistance level and a Fibonacci
// retracement already on it, because most visitors read the hero without
// touching it and "drawings" has to be visible, not just clickable. The rail
// down the left arms nine of the engine's 42 tools for everyone else.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LiveChart } from './charts/LiveChart'
import { DrawingRail } from './charts/DrawingRail'
import {
  DRAWING_TOOLS,
  TONE,
  TickStream,
  drawingStyleDefaults,
  formatPrice,
  makeBars,
  makeDrawings,
  seededDrawingColor,
} from './charts/chart-kit'
import { usePageSkin } from './charts/use-page-skin'
import type {
  ChartType,
  DrawingObject,
  DrawingToolType,
  FastFinancialChartRef,
} from '@pairlens/fast-financial-charts/types'
import type { ChartConfig, IndicatorKey, LiveTick } from './charts/chart-kit'

const SERIES_ID = 'BTC-USD'
const BASE = 63_200
const CHART_HEIGHT = 480

/** Registered in the engine's drawing registry, `select` aside. */
const TOOL_COUNT = 42

const TYPES: Array<{ type: ChartType; label: string }> = [
  { type: 'candles', label: 'Candles' },
  { type: 'line', label: 'Line' },
  { type: 'area', label: 'Area' },
]

const INDICATORS: Array<{ key: IndicatorKey; label: string }> = [
  { key: 'ema', label: 'EMA 21' },
  { key: 'bb', label: 'Bollinger' },
  { key: 'rsi', label: 'RSI pane' },
  { key: 'vol', label: 'Volume' },
]

export function ChartsLiveDemo() {
  // The card's frame is page-owned chrome, so the skin bar re-points its
  // tokens directly; the island only needs the engine half of the skin.
  const skin = usePageSkin()
  const bars = useMemo(() => makeBars(150, 7, BASE, '1m'), [])
  const stream = useMemo(
    () => new TickStream(BASE, '1m', bars[bars.length - 1]),
    [bars],
  )
  const priceRef = useRef<HTMLSpanElement>(null)
  const chartRef = useRef<FastFinancialChartRef>(null)

  const [cfg, setCfg] = useState<ChartConfig>({
    type: 'candles',
    ema: true,
    bb: false,
    rsi: false,
    vol: true,
  })

  // Built on the skin the card mounts with: the engine takes the drawing set at
  // construction and owns it from there, so this is a seed and not a binding.
  // Re-skinning reaches the survivors through the effect below.
  const mountSkin = useRef(skin.chart).current
  const seeded = useMemo(
    () => makeDrawings(SERIES_ID, bars, mountSkin),
    [bars, mountSkin],
  )

  const styleDefaults = useMemo(
    () => drawingStyleDefaults(skin.chart),
    [skin.chart],
  )

  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null)
  const [drawn, setDrawn] = useState({
    count: seeded.length,
    /** Any change at all means the engine has an undo step to give back. */
    touched: false,
  })

  const armed = DRAWING_TOOLS.find(({ tool }) => tool === activeTool)

  // Written straight to the DOM: at ~1 tick/second a state update here would
  // re-render the card (and its chart subtree) for a four-character label.
  const onTick = useCallback((tick: LiveTick) => {
    const el = priceRef.current
    if (!el) return
    el.textContent = `$${formatPrice(tick.price, BASE)}`
    el.style.color =
      tick.price >= tick.open ? 'var(--chart-2)' : 'var(--destructive)'
  }, [])

  // The re-skin below edits the drawings through the store, so it comes back
  // here as a change event. That is the page repainting itself, not the visitor
  // editing anything, and it must not arm Undo.
  const recolouring = useRef(false)
  const onDrawingsChange = useCallback((next: Array<DrawingObject>) => {
    // Read the flag here, not inside the updater: React runs that later, by
    // which time the re-skin loop has already put the flag back down.
    const theirs = !recolouring.current
    setDrawn((prev) => ({
      count: next.length,
      touched: prev.touched || theirs,
    }))
  }, [])

  // The seeded three were handed over before the skin bar was ever clicked, and
  // the drawings prop stops being read after construction — so a palette change
  // reaches them as commands instead. Anything the visitor drew keeps the hue
  // it was drawn in, the same way a real app would not restyle their work.
  const skinRef = useRef(skin.chart)
  useEffect(() => {
    if (skin.chart === skinRef.current) return
    skinRef.current = skin.chart
    const chart = chartRef.current
    if (!chart) return
    recolouring.current = true
    for (const drawing of seeded) {
      const color = seededDrawingColor(drawing.id, skin.chart)
      if (!color) continue
      chart.executeCommand({
        type: 'updateDrawing',
        payload: { id: drawing.id, patch: { color } },
      })
    }
    recolouring.current = false
  }, [skin.chart, seeded])

  // The engine's own shortcuts stay off — a marketing page must not swallow
  // the visitor's keys — but Escape has to work, or an armed tool is a trap for
  // anyone who reached the rail with a keyboard.
  useEffect(() => {
    if (activeTool === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveTool(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool])

  const undo = useCallback(() => {
    chartRef.current?.executeCommand({ type: 'undo' })
  }, [])

  const clear = useCallback(() => {
    chartRef.current?.executeCommand({ type: 'clearDrawings' })
    setActiveTool(null)
  }, [])

  // The card frame itself is painted by the page, not here: it lands with the
  // first HTML while this island is still loading, so nothing shifts.
  return (
    <div>
      <div
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-border px-[18px] py-3"
        style={{
          background: 'color-mix(in oklch, var(--background) 55%, transparent)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <span className="font-serif text-[15.5px] font-semibold tracking-[-0.01em] text-foreground">
            BTC-USD
          </span>
          <span
            ref={priceRef}
            className="font-mono text-[14px] font-semibold"
            style={{ color: 'var(--chart-2)' }}
          >
            —
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">
            <span
              className="size-1.5 rounded-full motion-safe:animate-pulse"
              style={{ background: 'var(--chart-2)' }}
              aria-hidden="true"
            />
            Streaming
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1">
            {TYPES.map(({ type, label }) => {
              const on = cfg.type === type
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCfg((prev) => ({ ...prev, type }))}
                  className="cursor-pointer rounded-lg border px-2.5 py-[5px] font-mono text-[11px] transition-colors"
                  style={{
                    borderColor: on ? 'var(--border)' : 'transparent',
                    background: on ? 'var(--muted)' : 'none',
                    color: on ? 'var(--foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <span
            aria-hidden="true"
            className="hidden h-[18px] w-px bg-border min-[721px]:block"
          />
          <div className="flex gap-1">
            {INDICATORS.map(({ key, label }) => {
              const on = cfg[key]
              const tone = TONE[key]
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setCfg((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                  className="cursor-pointer rounded-lg border px-2.5 py-[5px] font-mono text-[11px] transition-colors"
                  style={{
                    borderColor: on ? 'var(--border)' : 'transparent',
                    background: on
                      ? `color-mix(in oklch, ${tone} 16%, transparent)`
                      : 'none',
                    color: on ? tone : 'var(--muted-foreground)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex" style={{ height: CHART_HEIGHT }}>
        <DrawingRail
          active={activeTool}
          skin={skin.chart}
          canUndo={drawn.touched}
          canClear={drawn.count > 0}
          onPick={setActiveTool}
          onUndo={undo}
          onClear={clear}
        />

        <LiveChart
          seriesId={SERIES_ID}
          bars={bars}
          timeframe="1m"
          base={BASE}
          cfg={cfg}
          skin={skin.chart}
          showGrid={skin.showGrid}
          fontFamily={skin.fontFamily}
          stream={stream}
          fill
          priceAxisWidth={68}
          maxFps={60}
          worker
          pannable
          hud
          onTick={onTick}
          drawings={seeded}
          drawingStyleDefaults={styleDefaults}
          activeTool={activeTool}
          onActiveToolChange={setActiveTool}
          onDrawingsChange={onDrawingsChange}
          controllerRef={chartRef}
        />
      </div>

      {/* The instruction belongs under the canvas, not over it: a pill floating
          on the price action is the one thing a charting demo cannot afford.
          Armed, the strip becomes the tool's own prompt. */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 border-t border-border px-[18px] py-2.5"
        style={{
          background: 'color-mix(in oklch, var(--background) 55%, transparent)',
        }}
      >
        <p className="flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
          <span
            className="text-[10px] font-semibold tracking-[0.14em] uppercase"
            style={{ color: armed ? skin.chart[armed.tone] : undefined }}
          >
            {armed ? armed.label : 'Drawings'}
          </span>
          <span aria-hidden="true" className="h-[13px] w-px bg-border" />
          {armed
            ? armed.hint
            : 'Pick a tool, drag on the chart. Drag a drawing to move it.'}
        </p>
        <p className="hidden font-mono text-[11px] text-muted-foreground/70 min-[721px]:block">
          {drawn.count} on chart
          <span aria-hidden="true" className="px-2 opacity-50">
            ·
          </span>
          {DRAWING_TOOLS.length - 1} of {TOOL_COUNT} tools shown
        </p>
      </div>
    </div>
  )
}
