// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The inspect crosshair — what a held finger draws.
 *
 * Four things, and they answer one question between them: a hairline pair
 * locked to the bar under the finger, a price tag in the price gutter, a time
 * tag on the time axis, and the bar's own OHLC where the live price usually
 * sits. The live readout fades out for exactly as long as this is up
 * (`html.pl-chart-inspecting` in mobile.css) — one price on screen at a time,
 * or the number in the corner and the number under the finger argue.
 *
 * Stacking and portalling follow `crosshair-placement.tsx` for the same
 * reasons: the chart wrapper is `isolate`d and the band paints a scrim over
 * its own top, so a hairline rendered inside that context would vanish behind
 * the scrim near the highs. z-36 puts it over the chart, under the sheet
 * layer. One consequence of the portal is worth knowing before you paint here:
 * `--pl-chart-fg` and the halo tokens derived from it live on
 * `.pl-mobile-root`, which is not an ancestor of `document.body` — colours in
 * this file come from the UI tokens (`--primary`, `--foreground`), never from
 * the chart-paint ones.
 *
 * Per-tick discipline: this subscribes to no stream context. The finger comes
 * from the gesture hook's own store, the bars are read imperatively off the
 * chart, and a live tick only re-renders this overlay when the crosshair is
 * actually parked on the bar that is still forming — throttled, because a
 * streaming market emits a data change several times a second.
 */
import {
  memo,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { CHART_TIME_AXIS_HEIGHT } from '../lib/mobile-geometry'
import { useMobileFocus } from '../mobile-focus-context'
import { PRESS } from '../primitives/press'
import { clampToPlot } from './drawing-placement'
import {
  barMove,
  findBarByTs,
  formatVolume,
  inspectPoint,
  labelLeft,
  showsClock,
} from './chart-inspect'
import type { InspectStore } from './use-chart-inspect'
import type { PlacementFrame } from './drawing-placement'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type { RefObject } from 'react'
import { useChartConfig } from '@/lib/chart-terminal-context'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'
import {
  formatChartPrice,
  formatPredictionChartPrice,
} from '@/lib/format-price'

export type ChartInspectorProps = {
  /** The chart's own box — measured, not assumed, so the tags map 1:1. */
  frameRef: RefObject<HTMLDivElement | null>
  /** The price gutter, in px. Mirrors the theme `MobileChart` hands the engine. */
  priceAxisWidth: number
  store: InspectStore
  onDismiss: () => void
}

type Rect = { top: number; left: number; width: number; height: number }

/** Width of the time tag on the axis. Fixed, so it can be clamped before paint. */
const TIME_TAG_WIDTH = 118
const TAG_HEIGHT = 18

/**
 * Smallest gap between two refreshes of a bar that is still forming.
 *
 * A liquid market emits a data change on every trade. The legend is reading a
 * bar, not a tape: four updates a second is past the eye's ability to tell one
 * number from the next, and it is 1/20th of the renders the raw event stream
 * would ask for.
 */
const LIVE_REFRESH_MS = 250

export const ChartInspector = memo(function ChartInspector({
  frameRef,
  priceAxisWidth,
  store,
  onDismiss,
}: ChartInspectorProps) {
  const { t } = useTranslation()
  const { chartRef, chartTimeframe, crosshairMode } = useChartConfig()
  const { focusedPair, focusedVenue } = useMobileFocus()
  // Low-churn reads only (focus + the directory pin), as in `MobileChart`.
  const prediction = useIsPredictionPair(focusedPair, focusedVenue)

  const touch = useSyncExternalStore(store.subscribe, store.read, store.read)
  const [rect, setRect] = useState<Rect | null>(null)
  const [, refresh] = useReducer((n: number) => n + 1, 0)

  /**
   * The bars, re-read only when the chart says they moved.
   *
   * `chart.data()` hands back a CLONE of the whole buffer — 500 objects. A
   * scrub is a stream of pointer moves, so cloning per move would allocate
   * tens of thousands of objects a second to answer a question about one bar.
   * The cache is invalidated by the subscription below and refilled during the
   * next render, which is a pure fold: same input, same array.
   */
  const bars = useRef<{ value: ReadonlyArray<ChartBar>; stale: boolean }>({
    value: [],
    stale: true,
  })
  /** Is the crosshair parked on the bar that is still forming? */
  const onLiveBar = useRef(false)
  const lastLiveRefresh = useRef(0)

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

  /**
   * Stand the live readout down while this is up.
   *
   * A class on the document rather than a prop through the surface: the price
   * readout is a sibling of the chart two components above this one, and
   * lifting a per-gesture boolean up there would re-render the whole chart
   * band twice per look. The rule lives beside the readout's own paint in
   * mobile.css.
   */
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('pl-chart-inspecting')
    return () => root.classList.remove('pl-chart-inspecting')
  }, [])

  // ── Follow the data ──
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    return chart.subscribe((event) => {
      if (
        event.type === 'visibleTimeRangeChange' ||
        event.type === 'sizeChange'
      ) {
        // Bars arrived or the viewport shifted: the crosshair holds its pixel
        // and the bar under it changes, so both the cache and the paint go.
        bars.current.stale = true
        refresh()
        return
      }
      if (event.type !== 'stateChange' || event.payload.reason !== 'data') {
        return
      }
      bars.current.stale = true
      // Every other bar in the buffer is history and cannot have changed, so a
      // tick is only worth a render when the crosshair is sitting on the one
      // bar that is still being written.
      if (!onLiveBar.current) return
      const now = performance.now()
      if (now - lastLiveRefresh.current < LIVE_REFRESH_MS) return
      lastLiveRefresh.current = now
      refresh()
    })
  }, [chartRef])

  // ── The crosshair's own paint ──
  if (!rect || !touch || typeof document === 'undefined') return null

  const chart = chartRef.current
  const frame: PlacementFrame = {
    width: rect.width,
    height: rect.height,
    priceAxisWidth,
    timeAxisHeight: CHART_TIME_AXIS_HEIGHT,
  }
  const plotWidth = Math.max(0, frame.width - frame.priceAxisWidth)
  const plotHeight = Math.max(0, frame.height - frame.timeAxisHeight)

  if (bars.current.stale) {
    bars.current = { value: chart?.data() ?? [], stale: false }
  }
  const series = bars.current.value

  // `coordinateToTime` already snaps an x onto a bar, which is what makes the
  // vertical hairline land on a candle rather than between two.
  const anchored = clampToPlot(touch, frame)
  const ts = chart?.coordinateToTime(anchored.x) ?? null
  const bar = ts == null ? null : findBarByTs(series, ts)
  onLiveBar.current = bar != null && series[series.length - 1]?.ts === bar.ts

  // Magnet is the shipped default and the same chip that drives drawing snap:
  // the hairline rides the closes instead of floating over them. `hidden` is
  // deliberately not honoured here — it names the ENGINE's hover crosshair,
  // and this one only exists because a finger asked for it (the placement
  // reticle ignores it for the same reason).
  const snapY =
    crosshairMode === 'magnet' && bar
      ? (chart?.priceToCoordinate(bar.close) ?? null)
      : null
  const cursor = inspectPoint(touch, frame, snapY)
  const barX = (ts == null ? null : chart?.timeToCoordinate(ts)) ?? cursor.x
  const price = chart?.coordinateToPrice(cursor.y) ?? null
  const formatValue = prediction ? formatPredictionChartPrice : formatChartPrice
  const move = bar ? barMove(bar) : null
  const withClock = showsClock(chartTimeframe)

  return createPortal(
    <div
      aria-label={t('mobile.chart.inspect.label')}
      className="pointer-events-none fixed z-[36]"
      role="group"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    >
      {/* `border-dashed` is a utility and not part of `.pl-xh-*` on purpose:
          Tailwind's `border-t` writes `border-top-style` from its own variable
          in the utilities layer, which beats anything a components-layer class
          says about the style. The colour is `--primary` for the reason the
          module doc gives — this layer is portaled out of `.pl-mobile-root`. */}
      <span
        aria-hidden
        className="absolute border-t border-dashed border-primary/60"
        style={{ left: 0, width: plotWidth, top: cursor.y }}
      />
      <span
        aria-hidden
        className="absolute border-l border-dashed border-primary/60"
        style={{ top: 0, height: plotHeight, left: barX }}
      />
      <span
        aria-hidden
        className="absolute rounded-full bg-primary ring-2 ring-primary/25"
        style={{ width: 7, height: 7, left: barX - 3.5, top: cursor.y - 3.5 }}
      />

      {/* The price, in the gutter the price scale already owns. */}
      {price != null ? (
        <span
          className="pl-xh-tag absolute flex items-center justify-center"
          style={{
            left: plotWidth,
            width: priceAxisWidth,
            height: TAG_HEIGHT,
            top: cursor.y - TAG_HEIGHT / 2,
          }}
        >
          {formatValue(price)}
        </span>
      ) : null}

      {/* The date, on the axis it belongs to. */}
      {ts != null ? (
        <span
          className="pl-xh-tag absolute flex items-center justify-center"
          style={{
            left: labelLeft(barX, TIME_TAG_WIDTH, plotWidth),
            width: TIME_TAG_WIDTH,
            height: TAG_HEIGHT,
            top: plotHeight + (CHART_TIME_AXIS_HEIGHT - TAG_HEIGHT) / 2,
          }}
        >
          {formatStamp(ts, withClock)}
        </span>
      ) : null}

      {bar ? (
        <div className="pl-popover pointer-events-auto absolute inset-x-2 top-2 flex items-start gap-2 py-2 pl-3 pr-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {formatStamp(bar.ts, withClock)}
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-mono text-[11.5px] font-medium tabular-nums text-foreground">
              <Field label="O" value={formatValue(bar.open)} />
              <Field label="H" value={formatValue(bar.high)} />
              <Field label="L" value={formatValue(bar.low)} />
              <Field
                label="C"
                tone={move ? (move.up ? 'text-up' : 'text-down') : undefined}
                value={formatValue(bar.close)}
              />
            </p>
            <p className="mt-1 flex items-baseline gap-2.5 text-[11px] tabular-nums">
              {move ? (
                <span
                  className={cn(
                    'font-mono font-medium',
                    move.up ? 'text-up' : 'text-down',
                  )}
                >
                  {`${move.percent >= 0 ? '+' : ''}${move.percent.toFixed(2)}%`}
                </span>
              ) : null}
              <span className="text-muted-foreground">
                {t('mobile.chart.inspect.volume', {
                  value: formatVolume(bar.volume),
                })}
              </span>
            </p>
          </div>
          <button
            aria-label={t('mobile.chart.inspect.close')}
            className="pl-press-soft flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground"
            onClick={onDismiss}
            type="button"
            {...PRESS}
          >
            <X className="size-[18px]" />
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
})

const Field = memo(function Field({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <span className={tone}>
      <span className="mr-1 text-muted-foreground">{label}</span>
      {value}
    </span>
  )
})

// Two formatters rather than one, for the reason `crosshair-placement.tsx`
// gives: a combined `Intl` pattern puts a comma between the date and the time
// in most locales, and these tags are one line.
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})
const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function formatStamp(ts: number, withClock: boolean): string {
  const at = new Date(ts)
  const date = dateFormat.format(at)
  return withClock ? `${date} ${clockFormat.format(at)}` : date
}
