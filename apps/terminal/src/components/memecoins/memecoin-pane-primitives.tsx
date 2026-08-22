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
        className="inline-flex w-[74px] justify-end text-muted-foreground"
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
 * Two widths, strictly: the counts need 68px to sit inside the bar, and a
 * quarter-width column on a laptop cannot spare them, so below 16rem of pane
 * the cell falls back to the bar alone at 32px. Both are FIXED — the point of
 * the cell is that the green-to-red boundary lands in the same place in every
 * row, and a cell that sizes to its own contents cannot do that in either
 * state.
 */
const FLOW_CELL =
  'inline-flex h-3.5 w-8 shrink-0 items-center @min-[16rem]/pane:w-[68px]'

/**
 * Buys against sells, as one bar with the counts inside it.
 *
 * A count pair is what a memecoin trader reads first and it is nearly
 * unreadable as two numbers side by side, because the interesting cases are
 * the lopsided ones. So the bar carries the ratio and the counts carry the
 * magnitude, since 8 buys to 1 sell and 800 to 100 are the same ratio and not
 * the same event.
 *
 * The counts sit ON the bar rather than after it, and that is a layout
 * decision before it is a visual one. Laid out in a row, the cell was as wide
 * as its two numbers happened to be, so a column of thirty rows had thirty
 * different bar positions and the eye had nothing to run down. One fixed pill
 * per row costs the same pixels and gives the column a spine: the boundary
 * between the green and the red is at the same place for the same ratio in
 * every row, which is the comparison the cell exists to make.
 *
 * The fills are tinted rather than solid so the counts stay legible over them;
 * the counts keep the full-strength colour, since they are the foreground.
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
    <span
      className={cn(FLOW_CELL, 'relative overflow-hidden rounded-[3px]')}
      // The bar is a ratio, and a screen reader cannot read a ratio off a
      // width. The counts below are the accessible text.
      title={`${flow.buys} / ${flow.sells}`}
    >
      <span className="absolute inset-0 bg-down/20" />
      <span
        className="absolute inset-y-0 left-0 bg-up/25"
        style={{ width: `${buyShare}%` }}
      />
      <span className="relative hidden w-full items-center justify-between px-1 text-[10px] leading-none @min-[16rem]/pane:flex">
        <span className="text-up">{formatFlowCount(flow.buys)}</span>
        <span className="text-down">{formatFlowCount(flow.sells)}</span>
      </span>
    </span>
  )
}

/**
 * The token's mark, or its first letter.
 *
 * `referrerPolicy` and the error fallback both matter: launchpad icons are
 * user-supplied IPFS URLs, so a fair share of them 404, and a broken-image
 * glyph on every third row is what makes a board look abandoned.
 */
export function TokenMark({
  iconUrl,
  symbol,
}: {
  iconUrl: string | null
  symbol: string
}) {
  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[8px] font-semibold uppercase text-muted-foreground">
      {symbol.slice(0, 1)}
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
    </span>
  )
}
