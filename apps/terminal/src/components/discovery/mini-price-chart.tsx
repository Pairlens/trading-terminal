// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { SparklineState } from '@/hooks/use-sparkline'
import { buildSparkline } from '@/lib/sparkline-path'
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

export function MiniPriceChartView({
  values,
  state,
  className,
  ref,
}: {
  values: Array<number>
  state: SparklineState
  /** Sizing and responsive visibility — callers own the box. */
  className?: string
  /** Lands on whichever element is rendered, chart or empty slot. */
  ref?: React.Ref<never>
}) {
  const { t } = useTranslation()
  const rawId = useId()
  // useId's delimiters are not valid inside a `url(#…)` reference.
  const gradientId = `spark-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  const geometry =
    state === 'ready' ? buildSparkline(values, VIEW_W, VIEW_H, VIEW_PAD) : null

  if (!geometry) {
    // Same box either way, so a chart arriving never nudges the row. No
    // display utility of our own here — callers hide the slot with their own
    // responsive classes, and a `flex` of ours would fight them in the merge.
    return (
      <div
        ref={ref}
        aria-hidden
        className={cn('relative shrink-0', DEFAULT_BOX, className)}
      >
        <span
          className={cn(
            'absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rounded-full bg-muted-foreground/20',
            state === 'loading' && 'animate-pulse',
          )}
        />
      </div>
    )
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={cn(
        'shrink-0 overflow-visible',
        DEFAULT_BOX,
        geometry.up ? 'text-up' : 'text-down',
        className,
      )}
      role="img"
      aria-label={t('common.trendAriaLabel')}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={geometry.area} fill={`url(#${gradientId})`} />
      <path
        d={geometry.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        // The box is stretched to fit its slot; the line should not thicken
        // or thin with it.
        vectorEffect="non-scaling-stroke"
      />
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
}: {
  /** Venue to price the trend against — already resolved for the asset class. */
  market: string | undefined
  pair: string | undefined
  className?: string
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

  const { values, state } = useSparkline(market, pair, inView)
  return (
    <MiniPriceChartView
      ref={observe as React.Ref<never>}
      values={values}
      state={state}
      className={className}
    />
  )
})
