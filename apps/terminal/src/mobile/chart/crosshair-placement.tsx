// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crosshair placement mode — how a finger draws.
 *
 * Arming a tool parks a reticle on the chart. Dragging anywhere moves the
 * reticle, floated ~48px above the fingertip so the hand never covers the
 * thing it is aiming; the chart itself does not pan, because this layer eats
 * the gesture before the engine's canvas sees it. "Set point" commits the
 * reticle's (time, price); single-point tools finish there, two- and
 * three-point tools keep the reticle live for the next one.
 *
 * The completed object is created with an `addDrawing` command, which lands in
 * the same store, fires the same `drawingsChange` and is written by the same
 * debounced `handleDrawingsChange` as a drawing made with a mouse — a placed
 * line survives a reload for exactly the reason a dragged one does. Shape
 * construction lives in `drawing-placement.ts`, pure and tested.
 *
 * Stacking: this layer is PORTALED to the body and positioned over the
 * measured chart rect, not rendered inside the chart wrapper. The wrapper is
 * `isolate`d (the engine's canvases climb to z-30) and the chart band paints a
 * 148px gradient scrim over its own top — a reticle inside that stacking
 * context would vanish under the scrim the moment it went near the highs.
 * z-36 puts it over the chart and its scrim, and under the sheet layer (40),
 * the popover scrim (45) and the full-screen overlays (60).
 *
 * Per-tick discipline: nothing here subscribes to a stream context. The
 * readout is derived from the reticle's pixel position through the engine's
 * own `coordinateToPrice` / `coordinateToTime`, refreshed when the visible
 * range moves — so a streaming ticker costs this component zero renders.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CHART_TIME_AXIS_HEIGHT } from '../lib/mobile-geometry'
import {
  buildPlacedDrawing,
  centreOfPlot,
  clampToPlot,
  placementPointCount,
  reticleForTouch,
  toolTakesContent,
} from './drawing-placement'
import type { PlacementFrame, ReticlePoint } from './drawing-placement'
import type {
  DrawingPoint,
  DrawingToolType,
} from '@pairlens/fast-financial-charts/types'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'
import { drawingToolKey } from '@/lib/chart-drawing-tools'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { formatChartPrice } from '@/lib/format-price'

export type CrosshairPlacementProps = {
  /** The chart's own box — measured, not assumed, so the reticle maps 1:1. */
  frameRef: RefObject<HTMLDivElement | null>
  /** The price gutter, in px. Mirrors the theme `MobileChart` hands the engine. */
  priceAxisWidth: number
}

/** The reticle's centre dot and the confirmed-point handles, in px. */
const HANDLE = 9

export default memo(function CrosshairPlacement({
  frameRef,
  priceAxisWidth,
}: CrosshairPlacementProps) {
  const { activeTool, activeToolMeta } = useChartConfig()
  if (!activeTool) return null
  return (
    <PlacementLayer
      // Switching tools mid-placement restarts placement rather than carrying
      // half a channel into a trend line.
      key={drawingToolKey(activeTool, activeToolMeta)}
      frameRef={frameRef}
      meta={activeToolMeta}
      priceAxisWidth={priceAxisWidth}
      tool={activeTool}
    />
  )
})

type Rect = { top: number; left: number; width: number; height: number }

function PlacementLayer({
  frameRef,
  priceAxisWidth,
  tool,
  meta,
}: CrosshairPlacementProps & {
  tool: DrawingToolType
  meta: Record<string, unknown> | null
}) {
  const { t } = useTranslation()
  const { chartRef, chartSeries, drawingStyleDefaults, drawingToolMode } =
    useChartConfig()
  const { applyTool, runCommand } = useChartActions()

  const [rect, setRect] = useState<Rect | null>(null)
  const [reticle, setReticle] = useState<ReticlePoint | null>(null)
  const [placed, setPlaced] = useState<Array<DrawingPoint>>([])
  /** Non-null only during the text step of a text-bearing tool. */
  const [content, setContent] = useState<string | null>(null)
  // The reticle sits still while the chart scrolls under it, so the readout
  // has to re-read on every visible-range change. A counter, not the range —
  // the values are pulled imperatively from the engine.
  const [, refreshReadout] = useReducer((n: number) => n + 1, 0)
  const captureRef = useRef<HTMLDivElement | null>(null)

  const needed = placementPointCount(tool)

  // ── Measure the chart box ──
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      setRect((prev) =>
        prev &&
        prev.top === box.top &&
        prev.left === box.left &&
        prev.width === box.width &&
        prev.height === box.height
          ? prev
          : {
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [frameRef])

  // ── Keep the readout honest while bars arrive ──
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    return chart.subscribe((event) => {
      if (
        event.type === 'visibleTimeRangeChange' ||
        event.type === 'sizeChange'
      ) {
        refreshReadout()
      }
    })
  }, [chartRef])

  const frame: PlacementFrame | null = rect
    ? {
        width: rect.width,
        height: rect.height,
        priceAxisWidth,
        timeAxisHeight: CHART_TIME_AXIS_HEIGHT,
      }
    : null

  // Until the first drag the reticle rests in the middle of the plot; after
  // one it is re-clamped every render so a viewport resize can never strand it
  // in the price gutter.
  const cursor = frame
    ? reticle
      ? clampToPlot(reticle, frame)
      : centreOfPlot(frame)
    : null

  const toPoint = useCallback(
    (at: ReticlePoint): DrawingPoint | null => {
      const chart = chartRef.current
      if (!chart) return null
      const price = chart.coordinateToPrice(at.y)
      const ts = chart.coordinateToTime(at.x)
      if (price == null || ts == null) return null
      return { ts, price }
    },
    [chartRef],
  )

  const commit = useCallback(
    (points: Array<DrawingPoint>, text?: string) => {
      const drawing = buildPlacedDrawing({
        tool,
        meta,
        points,
        seriesId: chartSeries[0]?.id,
        styleDefaults: drawingStyleDefaults,
        content: text,
      })
      if (!drawing) return

      // The engine keeps one measurement at a time; a placed one must not
      // leave a trail the dragged one would have replaced.
      if (tool === 'measure') {
        const snapshot = chartRef.current?.getSnapshot()
        for (const existing of snapshot?.drawings ?? []) {
          if (existing.type === 'measure') {
            runCommand({ type: 'removeDrawing', payload: { id: existing.id } })
          }
        }
      }

      runCommand({ type: 'addDrawing', payload: drawing })
      setPlaced([])
      setContent(null)
      setReticle(null)

      // Mirrors the engine's post-draw behaviour: single-use disarms, sticky
      // stays armed for the next one, and measure is always sticky.
      if (drawingToolMode === 'single-use' && tool !== 'measure') {
        applyTool(null)
      }
    },
    [
      applyTool,
      chartRef,
      chartSeries,
      drawingStyleDefaults,
      drawingToolMode,
      meta,
      runCommand,
      tool,
    ],
  )

  const confirmPoint = useCallback(() => {
    if (!cursor) return
    const point = toPoint(cursor)
    if (!point) return
    navigator.vibrate?.(10)
    const next = [...placed, point]
    if (next.length < needed) {
      setPlaced(next)
      return
    }
    if (toolTakesContent(tool)) {
      setPlaced(next)
      setContent('')
      return
    }
    commit(next)
  }, [commit, cursor, needed, placed, toPoint, tool])

  const cancel = useCallback(() => applyTool(null), [applyTool])

  const movePointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!rect || !frame) return
      setReticle(
        reticleForTouch(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          frame,
        ),
      )
    },
    [frame, rect],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      captureRef.current?.setPointerCapture(event.pointerId)
      movePointer(event)
    },
    [movePointer],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!captureRef.current?.hasPointerCapture(event.pointerId)) return
      movePointer(event)
    },
    [movePointer],
  )

  const option = useMemo(
    () => findDrawingTool(drawingToolKey(tool, meta)),
    [meta, tool],
  )
  const toolLabel = option ? t(option.labelKey) : tool

  if (!rect || !frame || !cursor || typeof document === 'undefined') return null

  const readoutPoint = toPoint(cursor)
  const plotWidth = Math.max(0, frame.width - frame.priceAxisWidth)
  const plotHeight = Math.max(0, frame.height - frame.timeAxisHeight)

  // Confirmed points come back to pixels through the engine so the guide
  // tracks the bars it was anchored to rather than the screen it was tapped on.
  const anchors = placed.flatMap((point) => {
    const x = chartRef.current?.timeToCoordinate(point.ts)
    const y = chartRef.current?.priceToCoordinate(point.price)
    return x == null || y == null ? [] : [{ x, y }]
  })
  const guide = [...anchors, cursor]

  return createPortal(
    <div
      aria-label={t('mobile.drawing.placementLabel')}
      className="pointer-events-none fixed z-[36]"
      role="group"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    >
      {/* The guide through the points confirmed so far and the live reticle. */}
      {guide.length > 1 ? (
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${frame.width} ${frame.height}`}
        >
          <polyline
            fill="none"
            points={guide.map((p) => `${p.x},${p.y}`).join(' ')}
            stroke="var(--primary)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
          />
        </svg>
      ) : null}

      {anchors.map((anchor, index) => (
        <span
          aria-hidden
          className="absolute rounded-[2px] border-[1.6px] border-primary bg-background"
          key={index}
          style={{
            width: HANDLE,
            height: HANDLE,
            left: anchor.x - HANDLE / 2,
            top: anchor.y - HANDLE / 2,
          }}
        />
      ))}

      {/* Reticle: two hairlines and a ring, bounded by the plot so they never
          cut across the price scale. */}
      <span
        aria-hidden
        className="absolute border-t border-dashed border-primary/70"
        style={{ left: 0, width: plotWidth, top: cursor.y }}
      />
      <span
        aria-hidden
        className="absolute border-l border-dashed border-primary/70"
        style={{ top: 0, height: plotHeight, left: cursor.x }}
      />
      <span
        aria-hidden
        className="absolute rounded-full border-2 border-primary"
        style={{ width: 18, height: 18, left: cursor.x - 9, top: cursor.y - 9 }}
      />
      <span
        aria-hidden
        className="absolute rounded-full bg-primary"
        style={{ width: 4, height: 4, left: cursor.x - 2, top: cursor.y - 2 }}
      />

      {readoutPoint ? (
        <Readout
          plotHeight={plotHeight}
          plotWidth={plotWidth}
          point={readoutPoint}
          x={cursor.x}
          y={cursor.y}
        />
      ) : null}

      {/* Gesture capture. It is the whole chart rect on purpose: a placement
          drag has to be catchable wherever the thumb happens to land, and the
          engine must not receive it or the chart would pan under the reticle. */}
      <div
        className="pointer-events-auto absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        ref={captureRef}
      />

      <div className="pointer-events-auto absolute inset-x-2 bottom-2">
        {content === null ? (
          <div className="pl-popover flex items-center gap-2 p-1.5">
            <button
              aria-label={t('mobile.drawing.cancel')}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground"
              onClick={cancel}
              type="button"
            >
              <X className="size-[18px]" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">
                {toolLabel}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {needed > 1
                  ? t('mobile.drawing.step', {
                      current: placed.length + 1,
                      total: needed,
                    })
                  : t('mobile.drawing.dragHint')}
              </p>
            </div>
            <button
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground"
              onClick={confirmPoint}
              type="button"
            >
              <Check className="size-4" />
              {t('mobile.drawing.setPoint')}
            </button>
          </div>
        ) : (
          <div className="pl-popover flex items-center gap-2 p-1.5">
            <button
              aria-label={t('mobile.drawing.cancel')}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground"
              onClick={cancel}
              type="button"
            >
              <X className="size-[18px]" />
            </button>
            <div className="pl-field flex h-11 min-w-0 flex-1 items-center rounded-xl px-3">
              <input
                aria-label={t('mobile.drawing.textLabel')}
                autoComplete="off"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                enterKeyHint="done"
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commit(placed, content)
                }}
                placeholder={t('mobile.drawing.textPlaceholder')}
                value={content}
              />
            </div>
            <button
              className="flex h-11 shrink-0 items-center rounded-xl bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground"
              onClick={() => commit(placed, content)}
              type="button"
            >
              {t('mobile.drawing.done')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * The price/time chip. It rides under the reticle, flipping above it near the
 * bottom of the plot and clamping horizontally so it is never half off-screen.
 */
const Readout = memo(function Readout({
  point,
  x,
  y,
  plotWidth,
  plotHeight,
}: {
  point: DrawingPoint
  x: number
  y: number
  plotWidth: number
  plotHeight: number
}) {
  // Fixed, because the chip is positioned before it is painted: a measured
  // width would need a layout pass per reticle move to stay centred.
  const width = 168
  const height = 26
  const left = Math.min(
    Math.max(x - width / 2, 4),
    Math.max(4, plotWidth - width - 4),
  )
  // Below the reticle, except at the bottom of the plot where "below" is off
  // the chart — then it flips above, which is also where the finger is not.
  const below = y + 16 + height <= plotHeight
  const top = below ? y + 16 : y - 16 - height

  return (
    <div
      className="pl-popover pointer-events-none absolute flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg px-2.5"
      style={{ left, top, width, height }}
    >
      <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
        {formatChartPrice(point.price)}
      </span>
      <span className="text-[10.5px] text-muted-foreground">
        {formatReticleTime(point.ts)}
      </span>
    </div>
  )
})

// Two formatters rather than one: a combined `Intl` pattern puts a comma
// between the date and the time in most locales, and the chip has one line.
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})
const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function formatReticleTime(ts: number): string {
  const at = new Date(ts)
  return `${dateFormat.format(at)} ${clockFormat.format(at)}`
}
