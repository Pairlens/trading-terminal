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
        className="text-muted-foreground"
        title={t('memecoins.curveUnknown')}
      >
        ·
      </span>
    )
  }
  const percent = Math.round(progress * 100)
  return (
    <span className="flex items-center justify-end gap-1.5">
      <span className="relative h-1 w-8 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            progress >= 0.9 ? 'bg-asset-memecoin' : 'bg-muted-foreground/60',
          )}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </span>
      <span className={progress >= 0.9 ? 'text-asset-memecoin' : undefined}>
        {estimated ? '~' : ''}
        {percent}%
      </span>
    </span>
  )
}

/**
 * Buys against sells, as one bar.
 *
 * A count pair is what a memecoin trader reads first and it is nearly
 * unreadable as two numbers side by side, because the interesting cases are
 * the lopsided ones. The bar carries the ratio and the numbers stay for the
 * magnitude, since 8 buys to 1 sell and 800 to 100 are the same ratio and not
 * the same event.
 */
export function FlowBar({ flow }: { flow: LaunchpadFlow | undefined }) {
  if (!flow) return <span className="text-muted-foreground">·</span>
  const total = flow.buys + flow.sells
  if (total === 0) return <span className="text-muted-foreground">·</span>
  const buyShare = (flow.buys / total) * 100
  return (
    <span className="flex items-center justify-end gap-1.5">
      <span className="flex h-1 w-8 overflow-hidden rounded-full bg-down/40">
        <span className="bg-up" style={{ width: `${buyShare}%` }} />
      </span>
      <span className="text-up">{formatCount(flow.buys)}</span>
      <span className="text-muted-foreground/60">/</span>
      <span className="text-down">{formatCount(flow.sells)}</span>
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
