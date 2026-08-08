// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fear & Greed, full screen — the Discover card's number with its history
 * behind it.
 *
 * Same data as the card and as the desktop `FearGreedPane`: one
 * `['fear-greed']` react-query entry, `fetchFearGreedWithFallback` underneath
 * it. Opening this screen issues no request at all in the common case, because
 * the card that was just tapped already filled that cache entry. REST, cached
 * for five minutes — nothing here subscribes to a streaming context, so the
 * screen renders like any other page.
 *
 * The chart is hand-drawn SVG rather than the pane's recharts AreaChart, and
 * that is a deliberate divergence from "reuse the desktop component":
 *
 *   - recharts is ~300KB into a chunk that exists to draw thirty points on a
 *     phone. The mobile shell does not otherwise load it, and the repo's
 *     performance rule is not a suggestion.
 *   - the index has a FIXED 0–100 domain. Every shared sparkline helper in this
 *     codebase (`buildSparkline`) normalises to the window's own min/max, which
 *     is right for a price and wrong for an index: a month spent between 48 and
 *     52 would draw as a dramatic swing.
 *   - a tooltip that opens on hover is not a phone interaction. The scrub below
 *     is one pointer handler and reads a value out of an array.
 */
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import {
  FearGreedScale,
  classificationKey,
  toneFor,
  useFearGreed,
} from '../panels/discover-fear-greed-card'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FearGreedDataPoint } from '@pairlens/shared/instrument-types'
import type { MobileOverlay } from '../mobile-focus-context'
import { formatRelativeTime } from '@/lib/format-time'

/** Plot box, in px. The width is measured; only the height is a design number. */
const CHART_HEIGHT = 180
/** Keeps the 0 and 100 extremes off the box edges so the line never clips. */
const CHART_PAD = 10

/** The index is a 0–100 reading, and the plot says so at every scale. */
const DOMAIN_MIN = 0
const DOMAIN_MAX = 100

/** Bucket edges, in the order the legend lists them. */
const BUCKETS: Array<{ from: number; to: number }> = [
  { from: 0, to: 25 },
  { from: 26, to: 45 },
  { from: 46, to: 55 },
  { from: 56, to: 75 },
  { from: 76, to: 100 },
]

type ChartPoint = { value: number; label: string }

/** `timestamp` is unix seconds as a string on both feeds; be liberal anyway. */
function pointDate(timestamp: string): Date {
  const seconds = Number(timestamp)
  return Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : new Date(timestamp)
}

function shortDate(timestamp: string): string {
  const date = pointDate(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default memo(function FearGreedScreen({
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'fearGreed' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useFearGreed()

  const latest = data?.latest ?? null

  // Oldest first: the feed hands back newest first, the same reversal the
  // desktop pane makes before it draws.
  const points = useMemo<Array<ChartPoint>>(() => {
    const historical: Array<FearGreedDataPoint> = data?.historical ?? []
    return [...historical]
      .reverse()
      .map((p) => ({ value: p.value, label: shortDate(p.timestamp) }))
  }, [data])

  return (
    <FullScreenOverlay display onBack={onClose} title={t('fearGreed.title')}>
      {latest == null ? (
        <div className="flex flex-col items-center px-8 pt-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-[color:var(--pl-wash)]">
            <Gauge className="size-6 text-muted-foreground" />
          </span>
          <p className="mt-3.5 text-[15px] font-semibold text-foreground">
            {isLoading
              ? t('common.loading')
              : error
                ? t('fearGreed.failed')
                : t('fearGreed.noData')}
          </p>
          {!isLoading ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {error ? t('fearGreed.tryLater') : t('fearGreed.willAppear')}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="pb-8">
          <section className="px-4 pt-1">
            <div className="flex items-end gap-3">
              <span className="font-mono text-[52px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">
                {latest.value}
              </span>
              <span className="min-w-0 pb-1.5">
                <span
                  className={cn(
                    'block text-[15px] font-semibold leading-tight',
                    toneFor(latest.value),
                  )}
                >
                  {t(classificationKey(latest.value))}
                </span>
                {data?.fetchedAt ? (
                  <span className="mt-1 block text-[11px] leading-none text-muted-foreground">
                    {t('common.updated', {
                      time: formatRelativeTime(data.fetchedAt),
                    })}
                  </span>
                ) : null}
              </span>
            </div>

            <FearGreedScale className="mt-4 h-2" value={latest.value} />
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{t('fearGreed.extremeFear')}</span>
              <span>{t('fearGreed.extremeGreed')}</span>
            </div>
          </section>

          <SectionLabel>
            {points.length > 0
              ? t('mobile.fearGreed.historyLabel', { count: points.length })
              : t('mobile.fearGreed.noHistory')}
          </SectionLabel>

          {points.length > 1 ? (
            <FearGreedHistory points={points} tone={toneFor(latest.value)} />
          ) : (
            <p className="px-4 text-[12.5px] text-muted-foreground">
              {t('fearGreed.willAppear')}
            </p>
          )}

          <SectionLabel>{t('mobile.fearGreed.bucketsLabel')}</SectionLabel>
          <div className="mx-4 overflow-hidden rounded-xl bg-[color:var(--pl-wash)] shadow-[inset_0_0_0_1px_var(--pl-edge)]">
            {BUCKETS.map((bucket) => (
              <div
                className="flex min-h-11 items-center gap-3 border-t border-t-[color:var(--pl-hairline)] px-3.5 py-2 first:border-t-0"
                key={bucket.from}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  // The swatch sits on the same continuous down→up ramp the
                  // scale bar draws, sampled at the bucket's midpoint.
                  style={{
                    background: `color-mix(in oklch, var(--down) ${
                      100 - Math.round((bucket.from + bucket.to) / 2)
                    }%, var(--up))`,
                  }}
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px] font-medium',
                    latest.value >= bucket.from && latest.value <= bucket.to
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(classificationKey(bucket.to))}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                  {bucket.from}–{bucket.to}
                </span>
              </div>
            ))}
          </div>

          <p className="px-4 pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
            {t('mobile.fearGreed.aboutBody')}
          </p>
        </div>
      )}
    </FullScreenOverlay>
  )
})

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-4 pb-2 pt-6 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
      {children}
    </h3>
  )
}

/**
 * The history plot: a fixed-domain area chart with a scrub.
 *
 * Drawn in real pixels off a measured width rather than in a stretched
 * viewBox, so the stroke keeps its weight and the scrub dot stays round. The
 * scrub is component-local state on purpose — it is a user gesture, not a
 * stream, and it re-renders this subtree only.
 */
const FearGreedHistory = memo(function FearGreedHistory({
  points,
  tone,
}: {
  points: Array<ChartPoint>
  tone: string
}) {
  const { t } = useTranslation()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  // `useId`'s delimiters are not valid inside a `url(#…)` reference.
  const gradientId = `fg-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      const next = Math.round(box.getBoundingClientRect().width)
      setWidth((prev) => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    if (width <= 0 || points.length < 2) return null
    const usable = CHART_HEIGHT - CHART_PAD * 2
    const xAt = (i: number) => (i / (points.length - 1)) * width
    const yAt = (value: number) =>
      CHART_HEIGHT -
      CHART_PAD -
      ((Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, value)) - DOMAIN_MIN) /
        (DOMAIN_MAX - DOMAIN_MIN)) *
        usable
    const line = points
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(p.value).toFixed(2)}`,
      )
      .join('')
    return {
      line,
      area: `${line}L${width.toFixed(2)},${CHART_HEIGHT}L0,${CHART_HEIGHT}Z`,
      xAt,
      yAt,
    }
  }, [points, width])

  const scrub = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = (event.clientX - rect.left) / rect.width
      const index = Math.round(ratio * (points.length - 1))
      setActive(Math.max(0, Math.min(points.length - 1, index)))
    },
    [points.length],
  )

  const shown = active == null ? points.length - 1 : active
  const point = points[shown]

  return (
    <div className={cn('px-4', tone)}>
      {/* The readout sits above the plot rather than floating over it: a
          tooltip under a fingertip is a tooltip nobody can read. */}
      <div className="mb-2 flex h-4 items-center justify-between text-[11px] leading-none">
        <span className="font-mono tabular-nums text-foreground">
          {point ? point.value : ''}
          <span className="ml-1.5 text-muted-foreground">
            {point ? t(classificationKey(point.value)) : ''}
          </span>
        </span>
        <span className="text-muted-foreground">
          {point ? point.label : ''}
        </span>
      </div>

      <div
        className="relative"
        ref={boxRef}
        style={{ height: `${CHART_HEIGHT}px` }}
      >
        {geometry ? (
          <svg
            aria-label={t('mobile.fearGreed.chartAria')}
            height={CHART_HEIGHT}
            onPointerCancel={() => setActive(null)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              scrub(event)
            }}
            onPointerLeave={() => setActive(null)}
            onPointerMove={(event) => {
              if (event.buttons === 0 && event.pointerType === 'mouse') return
              scrub(event)
            }}
            onPointerUp={() => setActive(null)}
            role="img"
            style={{ touchAction: 'none' }}
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
            width={width}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* The five buckets as bands.
                A 0–100 domain leaves a lot of empty plot when the index sits
                at 40, and empty plot reads as a chart that failed to fill.
                Tinting the bands turns that space into the answer to "how far
                from greed is this?" — the same down→up ramp the scale bar and
                the legend swatches use, at an alpha that never competes with
                the line. */}
            {BUCKETS.map((bucket) => (
              <rect
                fill={`color-mix(in oklch, var(--down) ${
                  100 - Math.round((bucket.from + bucket.to) / 2)
                }%, var(--up))`}
                fillOpacity={0.07}
                height={Math.abs(
                  geometry.yAt(bucket.to) - geometry.yAt(bucket.from),
                )}
                key={bucket.from}
                width={width}
                x={0}
                y={geometry.yAt(bucket.to)}
              />
            ))}

            {/* 25 / 50 / 75, the bucket edges the legend below names. */}
            {[25, 50, 75].map((level) => (
              <line
                key={level}
                stroke="currentColor"
                strokeDasharray={level === 50 ? undefined : '3 4'}
                strokeOpacity={level === 50 ? 0.22 : 0.12}
                x1={0}
                x2={width}
                y1={geometry.yAt(level)}
                y2={geometry.yAt(level)}
              />
            ))}

            <path d={geometry.area} fill={`url(#${gradientId})`} />
            <path
              d={geometry.line}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />

            {active != null ? (
              <>
                <line
                  stroke="currentColor"
                  strokeOpacity={0.45}
                  x1={geometry.xAt(active)}
                  x2={geometry.xAt(active)}
                  y1={0}
                  y2={CHART_HEIGHT}
                />
                <circle
                  cx={geometry.xAt(active)}
                  cy={geometry.yAt(points[active].value)}
                  fill="currentColor"
                  r={4}
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              </>
            ) : null}
          </svg>
        ) : null}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
})
