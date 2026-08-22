// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What Crypto Up/Down draws while the venues are answering.
 *
 * It used to draw the Odds Movers rail's skeleton, borrowed wholesale: seven
 * two-line rows with a probability bar under each. That pane has none of those
 * things in either of its shapes, so the wait read as a column of stripes and
 * then rebuilt itself into a card with a chart in it — which is the exact
 * failure `pane-skeletons` was written to stop. A skeleton is the real layout
 * with the unknowns taken out, and this pane has two real layouts.
 *
 * So there are two here, chosen by the same toggle that chooses the real ones:
 *
 *  - **Focus** is the card. Two stats, a countdown over its own progress track,
 *    the chart, both legs as buttons, and the tape.
 *  - **Board** is the table, at its real row height and column alignment, under
 *    its real header row.
 *
 * Everything already known stays real, and that is most of the effect. The
 * column headers, the stat labels, the two legs' arrows and their up/down tint,
 * the progress track and the flow bar's track are all furniture — they do not
 * depend on a venue answering, so drawing them now is what stops the pane
 * assembling itself in front of the reader. What is withheld is every number,
 * every venue name, and the fill of every bar.
 *
 * The chart is drawn rather than blocked out, because a grey rectangle where a
 * chart goes says "something is broken here" and a trendline with a highlight
 * running along it says "a chart is coming". It reuses the discovery
 * sparklines' machinery for both halves of that: `skeletonValues` for a walk
 * that is stable across renders, and the `spark-sweep-window` clip for the
 * highlight — a clip window rather than a dash offset, because the box is
 * stretched to fit and a dash pattern is measured in device pixels. See the
 * long note beside `.spark-sweep-window` in the design system's stylesheet.
 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { cn } from '@pairlens/ui'

import { Shimmer } from '@/components/panes/pane-skeletons'
import { Th } from '@/components/panes/pane-primitives'
import { buildSparkline, skeletonValues } from '@/lib/sparkline-path'

/** Rows the board ghosts. Both venues together list a dozen-odd windows. */
const GHOST_ROWS = 8

/** Prints the tape ghosts, which is what the real strip holds: `TAPE_ROWS`. */
const GHOST_PRINTS = 6

/** Clock labels under the chart, matching the card's `AXIS_TICKS`. */
const GHOST_TICKS = 4

/**
 * Widths that keep a column of ghosts from reading as a bar chart.
 *
 * Fixed rather than random, for the same reason the walk below is seeded: a
 * placeholder that reshuffles on every render is a second animation competing
 * with the sweep.
 */
const CELL_WIDTHS = ['64%', '82%', '58%', '74%', '90%', '61%', '78%', '68%']

export function UpDownFocusSkeleton() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The heading the card sits under: asset, horizon chip, venue. */}
      <div className="flex shrink-0 items-center gap-1.5 pb-1">
        <Shimmer className="h-3 w-10" />
        <Shimmer className="h-2.5 w-7 rounded-sm" delayIndex={1} />
        <Shimmer className="h-2.5 w-16" delayIndex={2} />
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 pb-2">
            <div className="flex items-start gap-5">
              <StatGhost label={t('cryptoUpDown.focus.toBeat')} />
              <StatGhost delayIndex={1} label={t('cryptoUpDown.focus.now')} />
            </div>
            <CountdownGhost />
          </div>

          <GhostChart />

          <div className="mt-1 flex shrink-0 justify-between">
            {Array.from({ length: GHOST_TICKS }, (_, index) => (
              <Shimmer className="h-2 w-7" delayIndex={index} key={index} />
            ))}
          </div>
        </div>

        <div className="flex w-[190px] shrink-0 flex-col gap-1.5">
          <LegGhost side="up" />
          <LegGhost side="down" />
          <TapeGhost />
        </div>
      </div>
    </div>
  )
}

export function UpDownBoardSkeleton({ rows = GHOST_ROWS }: { rows?: number }) {
  const { t } = useTranslation()

  return (
    <table className="w-full text-[11px]">
      {/* Real, because a column header is not waiting on anything. */}
      <thead>
        <tr className="text-muted-foreground">
          <Th>{t('cryptoUpDown.colContract')}</Th>
          <Th align="right">{t('cryptoUpDown.colCloses')}</Th>
          <Th align="right">{t('cryptoUpDown.colReference')}</Th>
          <Th align="right">{t('cryptoUpDown.colSpot')}</Th>
          <Th align="right">{t('cryptoUpDown.colDistance')}</Th>
          <Th align="right">{t('cryptoUpDown.colMarket')}</Th>
          <Th align="right">{t('cryptoUpDown.colModel')}</Th>
          <Th align="right">{t('cryptoUpDown.colEdge')}</Th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, index) => (
          <tr className="border-b border-border/40 last:border-0" key={index}>
            <td className="py-1.5 pr-3">
              <div className="flex items-center gap-1.5">
                <Shimmer className="h-3 w-9" delayIndex={index} />
                <Shimmer className="h-2.5 w-6 rounded-sm" delayIndex={index} />
              </div>
              <Shimmer
                className="mt-1 h-2.5"
                delayIndex={index}
                style={{ width: CELL_WIDTHS[index % CELL_WIDTHS.length] }}
              />
            </td>
            {/* Seven numeric cells, each ghosted at the width its own number
                runs to: a countdown is short, a BTC reference is long, and a
                row of equal blocks would re-space itself when they land. */}
            <NumberCell delayIndex={index} width="w-10" />
            <NumberCell delayIndex={index} width="w-16" />
            <NumberCell delayIndex={index} width="w-16" />
            <NumberCell delayIndex={index} width="w-11" />
            <NumberCell delayIndex={index} width="w-9" />
            <NumberCell delayIndex={index} width="w-9" />
            <NumberCell delayIndex={index} last width="w-8" />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function NumberCell({
  width,
  delayIndex,
  last = false,
}: {
  width: string
  delayIndex: number
  last?: boolean
}) {
  return (
    <td className={cn('py-1.5', last ? '' : 'pr-3')}>
      {/* `ml-auto`, not a right-aligned inline block: the ghost is a block
          element, so the cell's own text alignment does not move it. */}
      <Shimmer className={cn('ml-auto h-3', width)} delayIndex={delayIndex} />
    </td>
  )
}

/**
 * One of the card's two headline numbers.
 *
 * The label is real. "To beat" and "Now" are the questions the card asks, not
 * answers it is waiting for, and printing them now means the reader knows what
 * is arriving before it does.
 */
function StatGhost({
  label,
  delayIndex = 0,
}: {
  label: string
  delayIndex?: number
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <Shimmer className="my-[3px] h-4 w-[88px]" delayIndex={delayIndex} />
      <Shimmer className="h-2.5 w-16" delayIndex={delayIndex} />
    </div>
  )
}

/**
 * The clock and its window.
 *
 * The track is real and empty. Filling it to any width would be a claim about
 * how much of a window is gone, which is the one thing this pane exists to say.
 */
function CountdownGhost() {
  const { t } = useTranslation()
  return (
    <div className="w-[104px] shrink-0">
      <p className="text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {t('cryptoUpDown.focus.closesIn')}
      </p>
      <Shimmer className="my-[3px] ml-auto h-4 w-14" />
      <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted" />
    </div>
  )
}

/**
 * One leg of the contract.
 *
 * Tinted and arrowed for real: which way Up points is the contract's structure,
 * not data, and two grey rectangles here would be the one place on this card
 * where the skeleton is less honest than the layout it stands in for. The
 * probability fill behind the label is what is missing, so the shell is empty.
 */
function LegGhost({ side }: { side: 'up' | 'down' }) {
  const up = side === 'up'
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <div
      className={cn(
        'rounded-lg px-2.5 py-2',
        up ? 'bg-up/10' : 'bg-down/10',
        // Dimmer than the live button's icon, so the arrows read as part of
        // the placeholder rather than as a control that is ready to click.
        up ? 'text-up/50' : 'text-down/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Icon aria-hidden="true" className="size-3" />
          <Shimmer className="h-2.5 w-8" delayIndex={up ? 0 : 1} />
        </div>
        <Shimmer className="h-3.5 w-9" delayIndex={up ? 0 : 1} />
      </div>
      <Shimmer className="mt-1 h-2 w-12" delayIndex={up ? 0 : 1} />
    </div>
  )
}

/**
 * The spot tape.
 *
 * The flow bar's track is drawn and its split is not: which side is pushing is
 * the whole point of the strip, and a half-and-half ghost is a reading of the
 * tape rather than a placeholder for one.
 */
function TapeGhost() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Shimmer className="my-1 h-2 w-20" />
      <div className="shrink-0 pb-1.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted" />
        <div className="mt-0.5 flex justify-between">
          <Shimmer className="h-2 w-12" />
          <Shimmer className="h-2 w-12" delayIndex={1} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-px overflow-hidden">
        {Array.from({ length: GHOST_PRINTS }, (_, index) => (
          <Shimmer className="h-3 shrink-0" delayIndex={index} key={index} />
        ))}
      </div>
    </div>
  )
}

// ── The chart ─────────────────────────────────────────────────────────

/** The focus chart's coordinate system, matched exactly so nothing resizes. */
const VIEW_W = 1000
const VIEW_H = 200

/**
 * Where the dashed reference sits, as a fraction of the box.
 *
 * Just above the middle, which is where a live one usually lands: the chart's
 * bounds are computed to keep the target in frame, so it is rarely at an edge.
 */
const REFERENCE_Y = VIEW_H * 0.46

/**
 * The ghost walk, built once at module load.
 *
 * Seeded rather than random so the shape never changes between renders, and
 * padded well inside the box so the real line — which is scaled to its own
 * extremes — does not read as a taller shape replacing a shorter one.
 */
const GHOST_LINE = buildSparkline(
  skeletonValues('crypto-updown', 44),
  VIEW_W,
  VIEW_H,
  VIEW_H * 0.16,
)

function GhostChart() {
  const rawId = useId()
  // useId's delimiters are not valid inside a `url(#…)` reference.
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const fillId = `updown-ghost-fill-${uid}`
  const clipId = `updown-ghost-clip-${uid}`

  return (
    <div className="relative min-h-0 flex-1">
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--muted-foreground)"
              stopOpacity="0.14"
            />
            <stop
              offset="100%"
              stopColor="var(--muted-foreground)"
              stopOpacity="0"
            />
          </linearGradient>
          {/* A window a quarter of the box wide, travelling left to right.
              It reaches far past the top and bottom edges: the clip decides
              how much of the line is lit, never where the line ends. */}
          <clipPath clipPathUnits="userSpaceOnUse" id={clipId}>
            <rect
              className="spark-sweep-window"
              height={VIEW_H * 3}
              width="25%"
              x={0}
              y={-VIEW_H}
            />
          </clipPath>
        </defs>

        {GHOST_LINE ? (
          <>
            <path d={GHOST_LINE.area} fill={`url(#${fillId})`} />
            {/* The settlement reference. Every one of these windows has one,
                so the dashed line is structure; the number it carries is not,
                and the chip at its right end stays a ghost. */}
            <line
              stroke="var(--muted-foreground)"
              strokeDasharray="6 5"
              strokeOpacity="0.28"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              x1="0"
              x2={VIEW_W}
              y1={REFERENCE_Y}
              y2={REFERENCE_Y}
            />
            <path
              d={GHOST_LINE.line}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.2"
              strokeWidth="1.75"
              vectorEffect="non-scaling-stroke"
            />
            {/* The same line again, brighter, showing only through the window
                — this is the whole animation. `spark-sweep` carries no rule of
                its own; it is the hook that drops the highlight entirely under
                `prefers-reduced-motion`, leaving the dim line behind. */}
            <path
              className="spark-sweep"
              clipPath={`url(#${clipId})`}
              d={GHOST_LINE.line}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.55"
              strokeWidth="1.75"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>

      {/* The chip that carries the reference price, empty. It rides a wrapper
          rather than taking the positioning itself: `.shimmer` declares
          `position: relative` unlayered, and an unlayered rule beats anything
          in `@layer utilities` — an `absolute` straight on the block is
          silently ignored and it stays where the flow put it. */}
      <span
        className="pointer-events-none absolute right-0 -translate-y-1/2"
        style={{ top: `${(REFERENCE_Y / VIEW_H) * 100}%` }}
      >
        <Shimmer className="h-3 w-14" />
      </span>
    </div>
  )
}
