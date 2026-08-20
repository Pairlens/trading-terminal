// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The tape against the number it settles on, drawn as one picture.
 *
 * This is the whole reason the focus card exists. A probability and a countdown
 * are what both venues already show you; the line crossing a target line is what
 * neither of them can draw, because neither carries the spot market its own
 * contract settles against.
 *
 * Hand-rolled SVG rather than recharts, and the reason is the refresh rate: this
 * gains a point a second for the life of a window, and recharts re-lays-out
 * every series and axis it owns on each data change. The whole drawing here is
 * two paths and a line.
 *
 * The projection trick worth knowing: the viewBox is a fixed 1000x200 stretched
 * with `preserveAspectRatio="none"`, so nothing has to measure the pane. That
 * distorts anything with a shape, which is why strokes carry
 * `vector-effect="non-scaling-stroke"` and why the price dot, the target label
 * and the clock are HTML positioned over the box rather than SVG inside it.
 */
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { SeriesBounds, SpotPoint } from '@/lib/predictions/updown-focus'
import { priceToY, seriesPath } from '@/lib/predictions/updown-focus'
import { formatPrice } from '@/lib/format-price'

/** The coordinate system the paths are built in. Stretched to fit by CSS. */
const VIEW_W = 1000
const VIEW_H = 200

export type UpDownLiveChartProps = {
  points: ReadonlyArray<SpotPoint>
  bounds: SeriesBounds | null
  /** The settlement reference. Drawn as the dashed line, always in frame. */
  reference: number | undefined
  /** Whether the reference is exact, or a candle that merely contains it. */
  referenceExact: boolean
  fromMs: number
  toMs: number
  /** Which side of the target the tape is on: decides every colour here. */
  side: 'above' | 'below' | 'at' | 'unknown'
  /** Clock labels under the box, left to right. */
  ticks: ReadonlyArray<{ ts: number; label: string }>
}

export function UpDownLiveChart({
  points,
  bounds,
  reference,
  referenceExact,
  fromMs,
  toMs,
  side,
  ticks,
}: UpDownLiveChartProps) {
  const { t } = useTranslation()
  const gradientId = useId()

  const tone =
    side === 'below'
      ? 'var(--down)'
      : side === 'above'
        ? 'var(--up)'
        : 'var(--muted-foreground)'

  const geometry = useMemo(() => {
    if (!bounds) return null
    const line = seriesPath(points, bounds, fromMs, toMs, VIEW_W, VIEW_H)
    if (!line) return null
    const last = points[points.length - 1]
    return {
      line,
      // The line closed down to the floor. Filling to the target instead would
      // read better on a chart that never crosses it and turns into a pair of
      // disjoint slivers on one that does, which is the case that matters.
      area: `${line}L${VIEW_W} ${VIEW_H}L0 ${VIEW_H}Z`,
      referenceY:
        reference === undefined ? null : priceToY(reference, bounds, VIEW_H),
      lastY: last ? priceToY(last.price, bounds, VIEW_H) : null,
    }
  }, [points, bounds, reference, fromMs, toMs])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity="0.28" />
              <stop offset="100%" stopColor={tone} stopOpacity="0" />
            </linearGradient>
          </defs>

          {geometry ? (
            <>
              <path d={geometry.area} fill={`url(#${gradientId})`} />
              {geometry.referenceY === null ? null : (
                <line
                  stroke="var(--muted-foreground)"
                  strokeDasharray="6 5"
                  strokeOpacity="0.75"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  x1="0"
                  x2={VIEW_W}
                  y1={geometry.referenceY}
                  y2={geometry.referenceY}
                />
              )}
              <path
                d={geometry.line}
                fill="none"
                stroke={tone}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>

        {/* HTML, not SVG: the box is stretched, so anything with a shape has to
            sit outside it or come out an ellipse. */}
        {geometry?.referenceY !== null && geometry !== null ? (
          <span
            className="pointer-events-none absolute right-0 -translate-y-1/2 rounded-sm bg-muted/80 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
            style={{ top: `${(geometry.referenceY! / VIEW_H) * 100}%` }}
          >
            {referenceExact ? '' : '≈'}
            {reference === undefined ? '' : formatPrice(reference)}
          </span>
        ) : null}

        {geometry?.lastY !== null && geometry !== null ? (
          // `left: 100%` and centred on it, NOT `right-0`. The path's last point
          // lands exactly on the box's right edge, and `right-0` puts a dot's
          // right EDGE there — leaving its centre half a dot inside the box,
          // visibly behind the tip of the line it is supposed to be sitting on.
          <span
            className="pointer-events-none absolute left-full size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              top: `${(geometry.lastY! / VIEW_H) * 100}%`,
              background: tone,
              boxShadow: `0 0 0 3px color-mix(in oklch, ${tone} 22%, transparent)`,
            }}
          >
            {/* The pulse is the whole "live" signal. It is one element and a
                CSS animation, so it costs a compositor layer and no renders. */}
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ background: tone }}
            />
          </span>
        ) : null}

        {geometry === null ? (
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
            {t('cryptoUpDown.focus.chartWaiting')}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex shrink-0 justify-between font-mono text-[9px] tabular-nums text-muted-foreground">
        {ticks.map((tick, index) => (
          <span
            className={cn(index === 0 && 'text-left', 'truncate')}
            key={tick.ts}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  )
}
