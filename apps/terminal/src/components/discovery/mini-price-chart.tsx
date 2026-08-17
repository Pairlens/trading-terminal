// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { SparklineState, SparklineWindow } from '@/hooks/use-sparkline'
import { buildSparkline, skeletonValues } from '@/lib/sparkline-path'
import { useSparkline } from '@/hooks/use-sparkline'

// ---------------------------------------------------------------------------
// The mini price chart that rides along every discovery row.
//
// Plain SVG, not the WebGL chart engine: a discovery list can have dozens of
// these on screen at once and none of them is interactive. The line is a trend
// cue next to the 24h number — it reads direction at a glance and nothing
// more, so there are no axes, no crosshair, and no live tick.
//
// Two things make it survive a docked pane at 300px. The box is sized in CSS,
// not props, with the path stretched to fit (`preserveAspectRatio="none"` plus
// a non-scaling stroke), so a caller can hand it a container query and the
// geometry follows without re-computing. And colour comes from `currentColor`,
// so up/down ride the theme's --up/--down tokens and the gradient stops never
// have to name a colour of their own.
// ---------------------------------------------------------------------------

/** Internal coordinate space. The rendered box comes from CSS. */
const VIEW_W = 100
const VIEW_H = 32
const VIEW_PAD = 2

const DEFAULT_BOX = 'h-5 w-16'

/** Shared by every stroke so the three states are visually one object. */
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  // The box is stretched to fit its slot; the line should not thicken or
  // thin with it.
  vectorEffect: 'non-scaling-stroke',
} as const

/**
 * The moving part of both animations: a rectangle in the chart's own
 * coordinate space that the CSS animates, clipping whichever line it is
 * pointed at.
 *
 * Deliberately not a dash offset. `non-scaling-stroke` above means the
 * browser strokes — and so dashes — in device pixels, while a
 * `pathLength="1"` normalisation is measured in viewBox units; stretch the
 * box (`w-full` in a markets table cell is nearly 3× the natural aspect) and
 * the dash covers a fraction of the line, which reads as a chart cut off
 * mid-flight. A clip window rides the same transform as the geometry, so it
 * is a proportion of the chart at every size.
 *
 * It reaches well past the top and bottom of the viewBox: the clip must never
 * be what decides where the line ends, only how much of it has arrived.
 */
function ClipWindow({
  className,
  width = VIEW_W + VIEW_PAD * 2,
}: {
  className: string
  width?: number | string
}) {
  return (
    <rect
      className={className}
      x={-VIEW_PAD}
      y={-VIEW_H}
      width={width}
      height={VIEW_H * 3}
    />
  )
}

export function MiniPriceChartView({
  values,
  state,
  seed,
  animate = true,
  className,
  ref,
}: {
  values: Array<number>
  state: SparklineState
  /** Keeps a row's loading shape stable, and unlike its neighbours'. */
  seed?: string
  /**
   * Whether this chart is on screen. A list holds far more charts than it
   * shows, and an infinite shimmer on every one of them is real compositing
   * work for pixels nobody is looking at — off screen, the placeholder holds
   * still.
   */
  animate?: boolean
  /** Sizing and responsive visibility — callers own the box. */
  className?: string
  /** Lands on the chart element, whichever state it is in. */
  ref?: React.Ref<SVGSVGElement>
}) {
  const { t } = useTranslation()
  const rawId = useId()
  // useId's delimiters are not valid inside a `url(#…)` reference.
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const gradientId = `spark-fill-${uid}`
  const clipId = `spark-clip-${uid}`

  const geometry =
    state === 'ready' ? buildSparkline(values, VIEW_W, VIEW_H, VIEW_PAD) : null

  // A wider pad than the real line uses: the placeholder should sit inside
  // the eventual chart's envelope, so the reveal reads as the line resolving
  // rather than as one shape being replaced by a taller one.
  const skeleton = useMemo(
    () =>
      state === 'loading'
        ? buildSparkline(
            skeletonValues(seed ?? 'pairlens'),
            VIEW_W,
            VIEW_H,
            VIEW_PAD * 3,
          )
        : null,
    [state, seed],
  )

  return (
    // One element in every state, always the same box, so a chart arriving
    // never nudges the row and the viewport observer never loses its target.
    <svg
      ref={ref}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={cn(
        'shrink-0 overflow-visible',
        DEFAULT_BOX,
        geometry
          ? geometry.up
            ? 'text-up'
            : 'text-down'
          : 'text-muted-foreground',
        className,
      )}
      // Only the finished chart says anything; the placeholder and the
      // nothing-to-show line are decoration, and the row already reads out
      // its price and change.
      {...(geometry
        ? { role: 'img', 'aria-label': t('common.trendAriaLabel') }
        : { 'aria-hidden': true })}
    >
      {geometry ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <ClipWindow className="spark-wipe" />
            </clipPath>
          </defs>
          <path
            className="spark-fade-in"
            d={geometry.area}
            fill={`url(#${gradientId})`}
          />
          <path {...STROKE} d={geometry.line} clipPath={`url(#${clipId})`} />
        </>
      ) : skeleton ? (
        <>
          <path {...STROKE} d={skeleton.line} strokeOpacity={0.16} />
          {/* A short segment travelling the same path — the shimmer. */}
          {animate && (
            <>
              <defs>
                <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                  <ClipWindow className="spark-sweep-window" width="25%" />
                </clipPath>
              </defs>
              <path
                {...STROKE}
                className="spark-sweep"
                d={skeleton.line}
                clipPath={`url(#${clipId})`}
                strokeOpacity={0.45}
              />
            </>
          )}
        </>
      ) : (
        // Nothing to show: settle to a flat line, dimmer than the skeleton,
        // so "this venue has no history for this pair" is legible as an
        // answer rather than as a chart that never loaded.
        <line
          {...STROKE}
          className="spark-fade-in"
          x1={0}
          x2={VIEW_W}
          y1={VIEW_H / 2}
          y2={VIEW_H / 2}
          strokeOpacity={0.22}
        />
      )}
    </svg>
  )
}

/** A little slack so a chart is fetched just before it is scrolled into view. */
const PREFETCH_MARGIN = '120px'

/**
 * The same chart, wired to its own candle fetch.
 *
 * Deliberately its own component rather than a hook call up in the row: rows
 * are memoized and re-render on every ticker tick, and candles arriving an
 * async beat later should repaint the sparkline, not the whole list item.
 *
 * It fetches only while on screen. Mounting is not a good enough signal —
 * the markets card grid is not virtualized, so every loaded page is mounted
 * whether or not anyone has scrolled to it, and without this gate opening
 * that view would queue a REST call per card.
 */
export const MiniPriceChart = memo(function MiniPriceChart({
  market,
  pair,
  className,
  historyWindow,
}: {
  /** Venue to price the trend against — already resolved for the asset class. */
  market: string | undefined
  pair: string | undefined
  className?: string
  /**
   * Span to draw, when a day of hourly closes is the wrong one. Prediction
   * outcomes ask for a month: their 24h move is already its own column, so
   * the line earns its space by showing the arc the day cannot.
   */
  historyWindow?: SparklineWindow
}) {
  const [inView, setInView] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // A callback ref, not an effect: the rendered element swaps between the
  // empty slot and the <svg> when candles land, and the observer has to
  // follow it across that swap.
  const observe = useCallback((node: Element | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: PREFETCH_MARGIN },
    )
    observer.observe(node)
    observerRef.current = observer
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  const { values, state } = useSparkline(market, pair, inView, historyWindow)
  return (
    <MiniPriceChartView
      ref={observe}
      values={values}
      state={state}
      seed={pair}
      animate={inView}
      className={className}
    />
  )
})
