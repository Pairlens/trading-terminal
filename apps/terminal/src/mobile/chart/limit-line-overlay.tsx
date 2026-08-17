// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The draggable limit price, drawn over the chart (design screen 7).
 *
 * It is a DOM overlay, not an engine drawing, and that is a decision rather
 * than a shortcut. Three candidates existed:
 *
 *   - `addDrawing` with an `hline` — draggable for free, but it flows through
 *     `onDrawingsChange → handleDrawingsChange`, which PERSISTS to
 *     `pairlens:terminal.drawings`. A transient order line would be saved on
 *     the user's symbol and reappear on their desktop. Rejected.
 *   - `addPrimitive` (`SeriesPrimitive`) — render-only. The engine gives
 *     primitives a `paneRenderer` and coordinate helpers but no hit-testing,
 *     so nothing can be dragged. Rejected.
 *   - A DOM overlay — chosen.
 *
 * Chart API, verified against `@pairlens/fast-financial-charts` in
 * node_modules: `FastFinancialChartRef` exposes `priceToCoordinate(price)` and
 * `coordinateToPrice(y)` DIRECTLY, both returning `number | null`, alongside
 * the `executeCommand({ type: 'priceToCoordinate' | 'coordinateToPrice' })`
 * forms the blueprint named (`src/types/mcp.ts`, `core/mcp/executor.ts`, both
 * delegating to the same engine methods). The direct methods are used here:
 * same engine call, one hop fewer, and a typed `number | null` instead of an
 * unwrapped command result.
 *
 * Coordinates are CSS pixels from the top of the chart's MAIN PANE, and both
 * conversions are unclamped linear maps over `mainHeight - timeAxisHeight` —
 * feed them a y past the bottom of the plot and they extrapolate a price
 * happily. So the first two numbers this file clamps against are the chart's:
 * `MobileChartSurface` sizes the overlay slot with the same frame it gives the
 * chart, and `CHART_TIME_AXIS_HEIGHT` takes off the axis gutter that the price
 * scale does not cover.
 *
 * The third is the sheet's. The chart no longer shrinks when a panel docks — it
 * is full height in all five views and the Trade sheet covers most of it — so
 * the plot is ~700px tall while only the top `stripHeight` px are on screen. A
 * level below that strip is drawn correctly and seen by nobody, so it PINS to
 * the bottom of the strip instead, flagged (`data-pinned`) and still grabbable.
 * The rule lives in `./limit-line-geometry`; the strip's height arrives as a
 * prop because only the shell knows which snap the sheet is resting at.
 *
 * Repositioning rides callbacks that already fire: `chartRef.current.subscribe()`
 * for the engine's own `visibleTimeRangeChange` (pan/zoom), `sizeChange` and
 * `stateChange` (a tick that re-auto-scales the price axis), plus a
 * `ResizeObserver` on the overlay. Everything coalesces into one rAF and is
 * written straight to `style.transform`, so following the market costs no React
 * render at all.
 *
 * Why the line is PORTALED to <body> rather than left in the overlay slot: the
 * chart engine's topmost canvas — the one it hit-tests crosshair and drawing
 * gestures on — carries `z-index: 30`, and the surface's overlay slot is
 * `z-20`. Painted inside the slot the line is visible (the canvas is
 * transparent) but not grabbable, because hit-testing goes to the topmost
 * element regardless of what it painted. The portal lands the line at `z-35`:
 * above that canvas, below the sheet (40) and the tab bar (50). An in-place
 * anchor keeps the band's geometry, and the portal is positioned from its rect.
 *
 * One thing this file deliberately does NOT know: what unit the draft's price
 * field is in. On a probability venue it is cents against a chart that plots
 * 0..1, so every crossing goes through `./limit-line-scale` — `toChartPrice` on
 * the way in, `toField` on the way out, `formatTag` for the reading. Between
 * those calls every price here is a CHART price.
 */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOrderDraftStore } from '../lib/order-draft-store'
import { CHART_TIME_AXIS_HEIGHT } from '../lib/mobile-geometry'
import { useMobileFocus } from '../mobile-focus-context'
import { clampLimitDragY, placeLimitLine } from './limit-line-geometry'
import { limitLineScale } from './limit-line-scale'
import type { FastFinancialChartRef } from '@pairlens/fast-financial-charts/types'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useChartConfig } from '@/lib/chart-terminal-context'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'

/**
 * How often the overlay checks it is still listening to the LIVE engine. A
 * chart remount (fullscreen toggle, StrictMode cycle) builds a new engine and
 * takes the old listeners with it; without this the line would silently stop
 * following the market. One reference comparison a second, only while the line
 * is on screen.
 */
const ENGINE_WATCH_MS = 1000

/**
 * Travel, in px, before a press on the tag becomes a drag.
 *
 * A tap on a PINNED tag must leave the draft alone: the tag is sitting above
 * its own level, so the first move event — one stray pixel of finger roll —
 * would otherwise rewrite the price from wherever it really is to the strip's
 * edge. Below the threshold the gesture writes neither the DOM nor the store,
 * so "grabbed it and let go" is a no-op and "grabbed it and moved" hands the
 * level to the finger. It applies to every drag, pinned or not; on an
 * unpinned line the first 4px were writing back the price it already had.
 */
const DRAG_SLOP_PX = 4

/** Toggle the pinned flag the tag and the dashes style themselves off. */
function markPinned(line: HTMLDivElement, pinned: boolean): void {
  if (pinned) line.dataset.pinned = 'below'
  else line.removeAttribute('data-pinned')
}

function chartToY(
  chartRef: RefObject<FastFinancialChartRef | null>,
  price: number,
): number | null {
  const y = chartRef.current?.priceToCoordinate(price)
  return y == null || !Number.isFinite(y) ? null : y
}

export type LimitLineOverlayProps = {
  /**
   * Chart band visible above the docked sheet, in px, measured from the top of
   * the overlay slot — i.e. the sheet's current snap expressed as a height of
   * chart. `SHEET_BAND.trade` at the default snap, `EXPANDED_BAND` at the
   * expanded one; omit it (Infinity) when nothing covers the chart and the
   * whole plot is usable.
   */
  stripHeight?: number
}

export default function LimitLineOverlay({
  stripHeight = Number.POSITIVE_INFINITY,
}: LimitLineOverlayProps) {
  const orderType = useOrderDraftStore((s) => s.orderType)
  const ticketOpened = useOrderDraftStore((s) => s.ticketOpened)
  const tradeReady = useOrderDraftStore((s) => s.tradeReady)

  // Mounted only for a limit order on a ticket the user has actually opened
  // AND that can place an order (`tradeReady`, written by the trade panel) —
  // a dashed level over a chart nobody has traded from is an unexplained
  // mark, and one over the ConnectCard sells a capability the ticket does
  // not have yet.
  if (!ticketOpened || !tradeReady || orderType !== 'limit') return null
  return <LimitLine stripHeight={stripHeight} />
}

const LimitLine = memo(function LimitLine({
  stripHeight,
}: Required<LimitLineOverlayProps>) {
  const { i18n } = useTranslation()
  const { chartRef } = useChartConfig()
  const limitPrice = useOrderDraftStore((s) => s.limitPrice)
  const setLimitPrice = useOrderDraftStore((s) => s.setLimitPrice)

  // Which unit the one price field is in. Read off the FOCUS, the same signal
  // `MobileChart` picks its price formatter from, because the conversion has to
  // agree with the axis this line is drawn against — not with the draft, which
  // keeps its numbers across a venue switch. Neither hook touches a streaming
  // context, so this stays out of the per-tick budget.
  const { focusedPair, focusedVenue } = useMobileFocus()
  const isPrediction = useIsPredictionPair(focusedPair, focusedVenue)
  const scale = useMemo(() => limitLineScale(isPrediction), [isPrediction])

  const anchorRef = useRef<HTMLDivElement | null>(null)
  const lineRef = useRef<HTMLDivElement | null>(null)
  const tagRef = useRef<HTMLSpanElement | null>(null)
  /**
   * The CHART price the line is drawn at, kept out of render on purpose. Chart
   * price, never the field's own value: past this ref everything in this file is
   * in the unit the engine maps, and `scaleRef` is the only crossing.
   */
  const priceRef = useRef<number | null>(null)
  /**
   * Latest PLOT rect, refreshed by `paint` — the portal's frame and the drag's
   * clamp. `height` is the anchor's height minus the time-axis gutter, i.e.
   * exactly the box the engine maps prices into.
   */
  const plotRef = useRef<{ top: number; height: number }>({
    top: 0,
    height: 0,
  })
  const draggingRef = useRef(false)
  /** The gesture has passed DRAG_SLOP_PX and may write. */
  const movedRef = useRef(false)
  const startYRef = useRef(0)
  const grabOffsetRef = useRef(0)
  const paintFrameRef = useRef<number | null>(null)
  const writeFrameRef = useRef<number | null>(null)
  const pendingPriceRef = useRef<string | null>(null)
  const localeRef = useRef(i18n.language)
  localeRef.current = i18n.language
  /**
   * The visible strip, read inside the rAF path. A ref and not the prop
   * itself: `paint` and the drag handlers are stable callbacks bound to the
   * engine's subscription, and re-creating them on every snap change would
   * re-attach the listener for a number that only moves when the user drags
   * the sheet.
   */
  const stripRef = useRef(stripHeight)
  stripRef.current = stripHeight
  /**
   * The scale, reachable from the rAF paint path and the drag handlers. A ref
   * for exactly the reason `stripRef` is one: those callbacks are stable and the
   * engine subscription is bound to them, so taking `scale` as a dependency
   * would re-attach the listener on a venue switch.
   */
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  priceRef.current = scale.toChartPrice(limitPrice)

  /** Price → pixels. Writes the DOM directly; never sets React state. */
  const paint = useCallback(() => {
    paintFrameRef.current = null
    const line = lineRef.current
    const anchor = anchorRef.current
    if (!line || !anchor) return
    const rect = anchor.getBoundingClientRect()
    const plotHeight = Math.max(0, rect.height - CHART_TIME_AXIS_HEIGHT)
    plotRef.current = { top: rect.top, height: plotHeight }

    const value = priceRef.current
    // Off the plot (the time-axis gutter, above the context bar, unmappable)
    // hides; on the plot but under the sheet pins to the strip. The portal is
    // not clipped by the chart's `overflow: hidden`, so both are explicit.
    const placement = placeLimitLine(
      value == null ? null : chartToY(chartRef, value),
      plotHeight,
      stripRef.current,
    )
    if (!placement.visible) {
      line.style.opacity = '0'
      return
    }
    line.style.opacity = '1'
    markPinned(line, placement.pinned)
    line.style.transform = `translate3d(0, ${Math.round(rect.top + placement.y)}px, 0)`
  }, [chartRef])

  const schedulePaint = useCallback(() => {
    if (paintFrameRef.current != null) return
    paintFrameRef.current = requestAnimationFrame(paint)
  }, [paint])

  // Follow the chart. The engine already emits everything needed; the watchdog
  // exists only to re-attach after a remount replaces the engine.
  useEffect(() => {
    let detach: (() => void) | null = null
    let attached: FastFinancialChartRef | null = null

    const attach = () => {
      const chart = chartRef.current
      if (chart === attached) return
      detach?.()
      attached = chart
      detach =
        chart?.subscribe((event) => {
          if (
            event.type === 'visibleTimeRangeChange' ||
            event.type === 'sizeChange' ||
            event.type === 'stateChange'
          ) {
            schedulePaint()
          }
        }) ?? null
      schedulePaint()
    }

    attach()
    const watchdog = setInterval(attach, ENGINE_WATCH_MS)
    const observer = new ResizeObserver(schedulePaint)
    if (anchorRef.current) observer.observe(anchorRef.current)

    return () => {
      clearInterval(watchdog)
      observer.disconnect()
      detach?.()
      if (paintFrameRef.current != null) {
        cancelAnimationFrame(paintFrameRef.current)
        paintFrameRef.current = null
      }
      if (writeFrameRef.current != null) {
        cancelAnimationFrame(writeFrameRef.current)
        writeFrameRef.current = null
      }
    }
  }, [chartRef, schedulePaint])

  // Field → line. The other direction is the drag below; both read and write
  // the one number in the draft store through the one scale, so they cannot
  // disagree about either the level or its unit.
  //
  // `scale` is a dependency, not just a ref read: switching from a spot venue to
  // a probability one reinterprets the SAME field value (the draft keeps its
  // numbers when only the venue changes), so the line has to be redrawn and
  // relabelled without the field having been touched.
  useEffect(() => {
    if (draggingRef.current) return
    const tag = tagRef.current
    if (tag) {
      tag.textContent =
        priceRef.current == null
          ? '—'
          : scale.formatTag(priceRef.current, localeRef.current)
    }
    schedulePaint()
  }, [limitPrice, scale, schedulePaint])

  // The sheet settled on its other snap. The strip changed size, so a level
  // that was pinned may now be free (or the reverse) — one repaint per snap
  // change, through the same rAF the market updates ride.
  useEffect(() => {
    schedulePaint()
  }, [stripHeight, schedulePaint])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const anchor = anchorRef.current
      if (!anchor || priceRef.current == null) return
      const y = chartToY(chartRef, priceRef.current)
      if (y == null) return
      const rect = anchor.getBoundingClientRect()
      const plotHeight = Math.max(0, rect.height - CHART_TIME_AXIS_HEIGHT)
      plotRef.current = { top: rect.top, height: plotHeight }
      draggingRef.current = true
      movedRef.current = false
      startYRef.current = event.clientY
      // Measured against where the tag IS, not where its price maps: a pinned
      // tag sits above its own level, and an offset taken from the true y would
      // teleport the line by that difference on the first move.
      grabOffsetRef.current =
        event.clientY -
        rect.top -
        placeLimitLine(y, plotHeight, stripRef.current).y
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    },
    [chartRef],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      const line = lineRef.current
      const chart = chartRef.current
      if (!line || !chart) return

      // A press is not a drag: nothing is written until the finger has
      // actually travelled (see DRAG_SLOP_PX). Crossing the threshold also
      // clears the pinned flag — from here the line is wherever the finger is.
      if (!movedRef.current) {
        if (Math.abs(event.clientY - startYRef.current) < DRAG_SLOP_PX) return
        movedRef.current = true
        markPinned(line, false)
      }

      // Clamped to the visible STRIP, not to the slot and not to the whole
      // plot: pointer capture keeps delivering moves once the finger crosses
      // onto the sheet, and `coordinateToPrice` would extrapolate every one of
      // those pixels into a price the user cannot see and write it into the
      // order draft. Dragging to the strip's floor is as far down as the line
      // goes; a level below the sheet is typed into the field, not dragged to.
      const plot = plotRef.current
      const y = clampLimitDragY(
        event.clientY - plot.top - grabOffsetRef.current,
        plot.height,
        stripRef.current,
      )
      // Paint from the finger, not from the round-tripped price: the pixel is
      // what is being dragged, and the conversion back rounds.
      line.style.transform = `translate3d(0, ${Math.round(plot.top + y)}px, 0)`

      const next = chart.coordinateToPrice(y)
      if (next == null || !Number.isFinite(next) || next <= 0) return
      // `toField` is where the engine's price becomes the field's own unit:
      // cents on a probability venue, the pair's quote everywhere else.
      const active = scaleRef.current
      const written = active.toField(next)
      // The tag reads the value that will be WRITTEN, not the raw finger price.
      // The pixel is the gesture and stays exactly where the finger is (above);
      // the tag is the order, and on a probability venue `toField` clamps the top
      // of the range, so a tag showing `100¢` would name a price the field is
      // about to refuse to hold.
      const tag = tagRef.current
      if (tag) {
        tag.textContent = active.formatTag(
          active.toChartPrice(written) ?? next,
          localeRef.current,
        )
      }

      // One store write per frame at most: the field, the risk row and the
      // order value all re-render off it.
      pendingPriceRef.current = written
      if (writeFrameRef.current == null) {
        writeFrameRef.current = requestAnimationFrame(() => {
          writeFrameRef.current = null
          const value = pendingPriceRef.current
          if (value != null) setLimitPrice(value)
        })
      }
    },
    [chartRef, setLimitPrice],
  )

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    // Nothing moved, so nothing is pending and the draft keeps the price it
    // had — including the off-strip price a pinned tag was standing in for.
    movedRef.current = false
    if (writeFrameRef.current != null) {
      cancelAnimationFrame(writeFrameRef.current)
      writeFrameRef.current = null
    }
    const value = pendingPriceRef.current
    pendingPriceRef.current = null
    if (value != null) setLimitPrice(value)
    schedulePaint()
  }, [setLimitPrice, schedulePaint])

  return (
    <>
      {/* Measurement anchor: it fills the overlay slot, which the surface
          sizes to the chart element, so the portal below always knows where
          the plot box is. */}
      <div className="pointer-events-none absolute inset-0" ref={anchorRef} />
      {createPortal(
        <div
          className="group pointer-events-none fixed inset-x-0 top-0 z-[35] h-0 opacity-0"
          data-pl-limit-line
          ref={lineRef}
          style={{ willChange: 'transform' }}
        >
          {/* Half-tone dashes while pinned: the level is real, this is not
              where it sits. The chevron in the tag says which way. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 border-t-[1.5px] border-dashed border-primary group-data-[pinned=below]:opacity-45"
          />
          <span className="absolute right-1 top-[-13px] flex h-[26px] items-center gap-1 rounded-md bg-primary pl-1.5 pr-2 font-mono text-[11.5px] font-semibold tabular-nums text-primary-foreground shadow-[var(--pl-shadow-tag)]">
            <GripVertical aria-hidden className="size-3 opacity-80" />
            <span ref={tagRef} />
            <ChevronDown
              aria-hidden
              className="hidden size-3 opacity-80 group-data-[pinned=below]:block"
            />
          </span>
          {/* A 44px grab strip centred on a 1.5px line. `pointer-events: auto`
              is load-bearing twice over: it re-enables hit-testing under the
              `pointer-events: none` vaul puts on <body> while a sheet is open,
              and it is what makes the strip — rather than the chart's UI
              canvas — the drag target. */}
          <div
            className="pointer-events-auto absolute inset-x-0 top-[-22px] h-11 touch-none"
            data-pl-limit-grab
            onPointerCancel={endDrag}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
          />
        </div>,
        document.body,
      )}
    </>
  )
})
