// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two things both LP panes draw: whether a position is earning, and where
 * the price sits in its band.
 *
 * The band is the pane's whole point, so it is a bar rather than three numbers.
 * A marker inside the bar answers "how much room is left" at a glance; the
 * numbers underneath answer "at what price". When the pool state could not be
 * read there is no marker at all — a marker parked at an end would read as a
 * position about to go out of range.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'

import { rangePosition } from '@/lib/dex/lp-display'
import { formatChartPrice } from '@/lib/format-price'

/**
 * In range / out of range, or nothing at all.
 *
 * `null` means the pool did not answer, and that renders as a neutral "pool
 * unread" chip: green would claim the position is earning and amber would claim
 * it is not, and neither is known.
 */
export function RangeBadge({
  inRange,
  compact = false,
}: {
  inRange: boolean | null
  compact?: boolean
}) {
  const { t } = useTranslation()
  const label =
    inRange === null
      ? t('lpPosition.rangeUnknown')
      : inRange
        ? t('lpPosition.inRange')
        : t('lpPosition.outOfRange')
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium',
        compact ? 'text-[10px]' : 'text-[10.5px]',
        inRange === null && 'bg-muted text-muted-foreground',
        inRange === true && 'bg-up/15 text-up',
        inRange === false && 'bg-[var(--chart-4)]/15 text-[var(--chart-4)]',
      )}
    >
      <span
        className={cn(
          'size-[5px] rounded-full',
          inRange === null && 'bg-muted-foreground',
          inRange === true && 'bg-up',
          inRange === false && 'bg-[var(--chart-4)]',
        )}
      />
      {label}
    </span>
  )
}

/**
 * The band, with the current price marked inside it.
 *
 * The marker's position is interpolated in log space (see `rangePosition`),
 * which is where the tick midpoint actually is. Bounds are printed in the
 * chart's own price format so a range read here and a line drawn on the chart
 * agree digit for digit.
 */
export function RangeBar({
  lower,
  upper,
  current,
  quoteSymbol,
}: {
  lower: number | null
  upper: number | null
  current: number | null
  quoteSymbol: string
}) {
  const at = rangePosition(current, lower, upper)
  const inside = at !== null && at > 0 && at < 1
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2.5 rounded-full bg-[var(--chart-3)]/40">
        {at === null ? null : (
          <span
            className="absolute -top-[3px] w-[3px] rounded-sm bg-foreground shadow-[0_0_0_1px_var(--background)]"
            style={{ left: `${at * 100}%`, height: 16 }}
          />
        )}
      </div>
      <div className="flex items-baseline justify-between font-mono text-[10.5px] text-muted-foreground [font-variant-numeric:tabular-nums]">
        <span>{lower === null ? '' : formatChartPrice(lower)}</span>
        <span className={cn(inside && 'text-foreground')}>
          {current === null ? '' : formatChartPrice(current)}
        </span>
        <span>
          {upper === null ? '' : `${formatChartPrice(upper)} ${quoteSymbol}`}
        </span>
      </div>
    </div>
  )
}

/**
 * A label and its value on one line, the shape both panes use for the
 * position's flat facts.
 */
export function LpStatLine({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  tone?: 'default' | 'muted' | 'up'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 truncate font-mono text-[11.5px] [font-variant-numeric:tabular-nums]',
          tone === 'muted' && 'text-muted-foreground',
          tone === 'up' && 'text-up',
        )}
      >
        {value}
      </span>
    </div>
  )
}
