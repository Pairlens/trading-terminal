// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the perps boards draw while the venues are still answering.
 *
 * The rule these follow: a loading pane keeps its own shape. Every skeleton
 * here is the real layout with the numbers taken out, at the real row height
 * and the real column widths, so the moment data lands nothing moves. A line
 * of prose saying "reading funding rates" does the opposite — it tells the
 * reader to wait, tells them nothing about what for, and then reflows the pane
 * out from under them when the answer arrives.
 *
 * Two things are real even before a venue answers, and using them is most of
 * the effect. The VENUE COLUMNS are known from the installed connectors, so
 * the board can name the exchanges it is waiting on. The ASSET COLUMN comes
 * from the top-coins ranking, which lands well before any exchange sweep, so
 * the rows carry the logo and ticker a reader is looking for while the rates
 * fill in beside them. What shimmers is only what is genuinely unknown.
 */
import { useMemo } from 'react'

import { cn } from '@pairlens/ui/lib/utils'
import { AssetMark } from './funding-scanner'
import type { TopCoin } from '@pairlens/shared/instrument-types'

/** Rows a skeleton draws before it knows how many there will be. */
export const GHOST_ROWS = 12

/**
 * One shimmering block.
 *
 * `delayIndex` staggers the sweep down a list — 60ms per row, which is slow
 * enough to read as a wave and fast enough that the bottom of a twelve-row
 * pane is not visibly behind the top.
 */
export function Shimmer({
  className,
  delayIndex = 0,
  still = false,
  style,
}: {
  className?: string
  delayIndex?: number
  /**
   * Draw the block without the travelling highlight.
   *
   * For placeholders below the fold. The sweep is a compositor layer per
   * element, and the funding matrix can hold several hundred cells in a
   * scroll container while one venue is still out; animating the ones nobody
   * can see spends GPU memory on nothing. The block itself is identical, so a
   * still row and a swept one look the same once scrolled to.
   */
  still?: boolean
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'block rounded-sm',
        still ? 'bg-muted' : 'shimmer',
        className,
      )}
      style={
        {
          ...style,
          ...(still ? {} : { '--shimmer-delay': `${delayIndex * 60}ms` }),
        } as React.CSSProperties
      }
    />
  )
}

/**
 * Rows deep into a scroller that keep the sweep.
 *
 * Roughly a tall pane's worth. Past it the placeholder is still drawn, just
 * not animated.
 */
export const SWEPT_ROWS = 16

/**
 * What a screen reader gets while a pane is a skeleton.
 *
 * The blocks themselves are `aria-hidden` — a reader announcing forty empty
 * boxes is worse than silence. `aria-busy` on the container tells an assistive
 * technology the region is mid-update, and this line is the sentence that says
 * what it is waiting for. `role="status"` announces it once, politely, and
 * never interrupts.
 */
export function SkeletonStatus({ label }: { label: string }) {
  return (
    <span className="sr-only" role="status">
      {label}
    </span>
  )
}

/**
 * The assets a skeleton row is labelled with.
 *
 * Real symbols, in ranking order, because they are the ones the venues are
 * about to answer for: the ghost board and the real board start with the same
 * dozen tickers, so the swap is the rates appearing rather than the pane
 * redrawing. An empty ranking degrades to unlabelled rows rather than to
 * invented tickers.
 */
export function useGhostBases(
  topCoins: Map<string, TopCoin>,
  count = GHOST_ROWS,
): Array<string | null> {
  return useMemo(() => {
    const ranked = [...topCoins.values()]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, count)
    if (ranked.length === 0) return Array.from({ length: count }, () => null)
    return ranked.map((coin) => coin.symbol.toUpperCase())
  }, [topCoins, count])
}

/**
 * The asset cell of a skeleton row: the real mark and ticker when the ranking
 * is in, a shimmering disc and pill when it is not.
 */
export function GhostAsset({
  base,
  logoUrl,
  index,
}: {
  base: string | null
  logoUrl?: string | null
  index: number
}) {
  if (!base) {
    return (
      <div className="flex min-w-0 items-center gap-2 py-1.5">
        <Shimmer className="size-5 shrink-0 rounded-full" delayIndex={index} />
        <Shimmer className="h-3 w-12" delayIndex={index} />
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-2 py-1.5">
      <AssetMark base={base} logoUrl={logoUrl ?? null} />
      <span className="truncate font-mono text-[11px] font-semibold text-muted-foreground">
        {base}
      </span>
    </div>
  )
}

/**
 * Basis Monitor, mid-flight.
 *
 * Same row height, same four fixed columns, same centred zero line: the bar
 * track and its tick are REAL, because they are furniture rather than data and
 * drawing them now is what stops the pane assembling itself in front of the
 * reader. Only the two prices and the bps figure are unknown, so only they
 * shimmer.
 */
export function BasisMonitorSkeleton({
  rows = 10,
  bases,
}: {
  rows?: number
  bases: Array<string | null>
}) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-3 text-[11px]" key={index}>
          <span className="w-12 shrink-0 truncate font-mono font-semibold text-muted-foreground">
            {bases[index] ?? <Shimmer className="h-3 w-9" delayIndex={index} />}
          </span>
          <Shimmer className="h-3 w-24 shrink-0" delayIndex={index} />
          <Shimmer className="h-3 w-24 shrink-0" delayIndex={index} />
          <span className="relative hidden h-1.5 min-w-0 flex-1 rounded-full bg-muted @sm/pane:block">
            <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-(--pane-rule)" />
          </span>
          <span className="flex w-20 shrink-0 justify-end">
            <Shimmer className="h-3 w-12" delayIndex={index} />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * OI leaders, mid-flight.
 *
 * The rows are ranked by size, so the skeleton bars step down: a column of
 * equal bars would promise a flat board and then rearrange itself. The step is
 * cosmetic and says only "these are sorted", which they will be.
 */
export function OpenInterestSkeleton({
  rows = 5,
  bases,
}: {
  rows?: number
  bases: Array<string | null>
}) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="border-b border-border/40 px-1.5 py-2 last:border-0"
          key={index}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-[11px] font-semibold text-muted-foreground">
              {bases[index] ?? (
                <Shimmer className="h-3 w-10" delayIndex={index} />
              )}
            </span>
            <Shimmer className="h-3 w-14 shrink-0" delayIndex={index} />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <Shimmer
                className="h-full rounded-full"
                delayIndex={index}
                style={{ width: `${100 - index * 14}%` }}
              />
            </span>
            <Shimmer className="h-3 w-10 shrink-0" delayIndex={index} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Funding Extremes, mid-flight.
 *
 * The rail's rows are an icon, two lines of text and a rate, and the icon slot
 * shimmers rather than guessing a direction: this pane's whole point is which
 * way the carry runs, and a skeleton that guessed would flip half its rows.
 */
export function FundingExtremesSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="flex items-center gap-2.5 border-b border-border/40 px-1.5 py-2 last:border-0"
          key={index}
        >
          <Shimmer
            className="size-4 shrink-0 rounded-full"
            delayIndex={index}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Shimmer className="h-3 w-32" delayIndex={index} />
            <Shimmer className="h-2.5 w-44 max-w-full" delayIndex={index} />
          </div>
          <Shimmer className="h-3.5 w-14 shrink-0" delayIndex={index} />
        </div>
      ))}
    </div>
  )
}
