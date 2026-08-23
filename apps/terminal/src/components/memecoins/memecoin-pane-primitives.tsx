// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The vocabulary the memecoin panes share.
 *
 * Two things here do real work beyond saving keystrokes. `CurveBar` is the
 * only place a bonding-curve percentage is drawn, so the rule that an
 * UNKNOWN progress renders as a dash rather than an empty bar is enforced
 * once — an empty bar is a claim that a token has not moved, and that claim
 * would be wrong for every launchpad we hold no curve for. And `FlowBar` is
 * the only place buys are put against sells, so the two panes that show flow
 * cannot end up disagreeing about which side is which colour.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'

import type { LaunchpadFlow } from '@pairlens/shared/instrument-types'
import { IdentityMark } from '@/components/identity-mark'

/**
 * Time since a timestamp, in the shortest form that is still true.
 *
 * Seconds matter here in a way they do not anywhere else in the terminal: the
 * difference between a token minted forty seconds ago and one minted four
 * minutes ago is the whole trade.
 */
export function formatAge(iso: string | null, now: number): string {
  if (!iso) return '·'
  const ms = now - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return '·'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * A memecoin market cap, which spans nine orders of magnitude on one board.
 *
 * $2.6k on a fresh mint and $14.6B on DOGE are rows in the same layout, so
 * everything is compacted and nothing carries decimals it has not earned.
 */
export function formatMcap(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '·'
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}k`
  return `$${Math.round(value)}`
}

export function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '·'
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return String(Math.round(value))
}

/**
 * A trade count in at most four characters.
 *
 * `formatCount` is the general one and it is one character too wide here:
 * 123.4k inside a fixed-width bar either clips or pushes its neighbour, and
 * both numbers in that bar have to fit at every magnitude a launch reaches in
 * its first hour. The precision that gets dropped is precision nobody reads —
 * 123k against 118k is the same glance as 123.4k against 118.2k.
 */
export function formatFlowCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '·'
  if (value < 1e3) return String(Math.round(value))
  if (value < 1e4) return `${(value / 1e3).toFixed(1)}k`
  if (value < 1e6) return `${Math.round(value / 1e3)}k`
  if (value < 1e7) return `${(value / 1e6).toFixed(1)}M`
  return `${Math.round(value / 1e6)}M`
}

/**
 * One label-and-value line, for the two panes that are a list of figures
 * rather than a table. The board's third surface is not used here.
 *
 * Lives beside the bars rather than in the pane that draws it because the
 * loading skeleton has to draw the identical line with a ghost where the value
 * goes, and two definitions of a 17px row is exactly how a skeleton starts
 * lying about the layout it is standing in for.
 */
export function StatLine({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="truncate text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums">
        {children}
      </span>
    </div>
  )
}

/** A signed percentage with its own colour. Null renders as a dash. */
export function ChangeCell({
  percent,
  className,
}: {
  percent: number | null
  className?: string
}) {
  if (percent === null || !Number.isFinite(percent)) {
    return <span className={cn('text-muted-foreground', className)}>·</span>
  }
  const up = percent >= 0
  return (
    <span className={cn(up ? 'text-up' : 'text-down', className)}>
      {up ? '+' : ''}
      {percent >= 100 || percent <= -100
        ? percent.toFixed(0)
        : percent.toFixed(1)}
      %
    </span>
  )
}

/**
 * Bonding-curve progress.
 *
 * `estimated` marks a percentage the terminal reconstructed rather than one
 * the venue published, and it earns its tilde: the reconstruction is accurate
 * to a fraction of a point in the middle of the curve and can drift a couple
 * of points near the top, which is exactly where somebody is deciding whether
 * to front-run a migration. Saying which number is which is cheaper than being
 * wrong quietly.
 */
export function CurveBar({
  progress,
  estimated,
}: {
  progress: number | null
  estimated: boolean
}) {
  const { t } = useTranslation()
  if (progress === null) {
    return (
      <span
        // The same width a filled cell claims, so an unknown does not pull the
        // column in and out as rows arrive.
        className="inline-flex justify-end text-muted-foreground"
        style={{ width: CURVE_CELL_WIDTH }}
        title={t('memecoins.curveUnknown')}
      >
        ·
      </span>
    )
  }
  const percent = Math.round(progress * 100)
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="relative h-1 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            progress >= 0.9 ? 'bg-asset-memecoin' : 'bg-muted-foreground/60',
          )}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </span>
      {/* Fixed width, so the bars line up down the column. Right-aligned text
          after a bar means the bar moves whenever the number changes length,
          and `~100%` is two characters wider than `9%`. */}
      <span
        className={cn(
          'w-9 text-right',
          progress >= 0.9 ? 'text-asset-memecoin' : undefined,
        )}
      >
        {estimated ? '~' : ''}
        {percent}%
      </span>
    </span>
  )
}

/**
 * The one width every flow cell claims, filled or empty.
 *
 * Two widths, strictly: the counts need the full 84px, and a quarter-width
 * column on a laptop cannot spare them, so below 16rem of pane the cell falls
 * back to the bar alone at 28px. Both are FIXED — the point of the cell is
 * that the green-to-red boundary lands in the same place in every row, and a
 * cell that sizes to its own contents cannot do that in either state.
 */
export const FLOW_CELL =
  'inline-flex h-3.5 w-7 shrink-0 items-center justify-end gap-1 @min-[16rem]/pane:w-[84px]'

/** The bar itself, at the width it keeps in both states. */
const FLOW_TRACK = 'flex h-1.5 w-6 shrink-0 overflow-hidden rounded-full'

/**
 * Each count's own column, so the bar starts at the same x in every row.
 *
 * Four characters at 10px mono, which is what `formatFlowCount` is capped to.
 */
const FLOW_COUNT =
  'hidden w-[26px] text-[10px] leading-none @min-[16rem]/pane:block'

/**
 * The curve cell's exact width, so a skeleton can claim it.
 *
 * 32px of bar, 6px of gap, 36px of right-aligned percentage. Written down
 * because a ghost that guesses it narrower makes the column jump the moment
 * the first real percentage lands, which is the one thing a skeleton exists to
 * prevent.
 */
export const CURVE_CELL_WIDTH = 74

/**
 * Buys against sells: a bar between two counts.
 *
 * A count pair is what a memecoin trader reads first and it is nearly
 * unreadable as two numbers side by side, because the interesting cases are
 * the lopsided ones. So the bar carries the ratio and the counts carry the
 * magnitude, since 8 buys to 1 sell and 800 to 100 are the same ratio and not
 * the same event.
 *
 * Two things about it are deliberate and were both got wrong once.
 *
 * The bar is `--up` against `--down` at FULL strength, which is what every
 * other proportional bar in the terminal is drawn in: the movers spark, the
 * sector tape, the order book's imbalance. It shipped as a pair of 20% tints
 * because the counts used to sit on top of the fill and needed the contrast,
 * and the result was a green and a red that belonged to no other pane. Moving
 * the counts off the bar is what buys the real colours back.
 *
 * And every part of the cell is a fixed width: the counts get a column each and
 * the bar gets its own, so the boundary between green and red lands in the same
 * place for the same ratio in every row. A cell that sizes to its contents
 * gives a column of thirty rows thirty different bar positions, and the eye has
 * nothing to run down.
 */
export function FlowBar({ flow }: { flow: LaunchpadFlow | undefined }) {
  const total = flow ? flow.buys + flow.sells : 0
  if (!flow || total === 0) {
    return (
      <span
        className={cn(FLOW_CELL, 'justify-center text-muted-foreground')}
        aria-hidden
      >
        ·
      </span>
    )
  }
  const buyShare = (flow.buys / total) * 100
  return (
    <span className={FLOW_CELL} title={`${flow.buys} / ${flow.sells}`}>
      <span className={cn(FLOW_COUNT, 'text-right text-up')}>
        {formatFlowCount(flow.buys)}
      </span>
      <span className={cn(FLOW_TRACK, 'bg-down')}>
        <span className="shrink-0 bg-up" style={{ width: `${buyShare}%` }} />
      </span>
      <span className={cn(FLOW_COUNT, 'text-left text-down')}>
        {formatFlowCount(flow.sells)}
      </span>
    </span>
  )
}

/**
 * The token's mark.
 *
 * A thin wrapper over `IdentityMark`, kept so the board has one place that
 * decides what a memecoin is SEEDED on. That is the mint rather than the
 * ticker, and it matters here more than anywhere else in the terminal: six
 * tokens on one board can be called TIMBOTHY, and six identical chips would
 * undo the thing the chip is for.
 */
export function TokenMark({
  iconUrl,
  symbol,
  address,
}: {
  iconUrl: string | null
  symbol: string
  address?: string
}) {
  return <IdentityMark name={symbol} seed={address} imageUrl={iconUrl} />
}
