// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three pieces every positions-style pane draws the same way.
 *
 * The prediction and futures panes were byte-identical here — same column
 * header, same empty state, same per-venue error banner — and the pair that
 * comes after them would have made it three copies of a table style. What
 * differs between the panes is the DATA, not the frame, so the frame lives
 * here and the icon is a prop.
 */
import { cn } from '@pairlens/ui'
import type { LucideIcon } from 'lucide-react'

/**
 * A column header: mono, uppercase, tracked out, right-aligned for numbers.
 *
 * No rule under it. The board draws exactly one line, between two stacked
 * panes, and a second one under every table's first row was what made a
 * column of panes read as a spreadsheet. Separation here is the 6px of air
 * `pb-1.5` leaves, which is enough at this type size.
 */
export const PANE_COLUMN_HEADER =
  'font-mono text-[9.5px] font-semibold uppercase tracking-[.16em] text-muted-foreground'

/** The quiet line a pane ends on: a total, a caveat, a source. */
export const PANE_FOOTNOTE = 'font-mono text-[10px] text-muted-foreground'

/** Table body: the board's data voice. */
export const PANE_TABLE_BODY = 'font-mono text-[11px] tabular-nums'

export function Th({
  children,
  align = 'left',
  className,
  title,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  /** For the one thing a header sometimes needs: `whitespace-nowrap`. */
  className?: string
  title?: string
}) {
  return (
    <th
      title={title}
      className={cn(
        'pb-1.5 pr-3 last:pr-0',
        PANE_COLUMN_HEADER,
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

/**
 * The same column-header voice for a pane whose rows are a grid, not a table.
 *
 * Takes the row's own grid classes so a pane keeps one definition of its
 * column geometry instead of two that drift.
 */
export function PaneColumnHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('shrink-0 pb-1', PANE_COLUMN_HEADER, className)}>
      {children}
    </div>
  )
}

/** A pane's closing line, separated by air rather than by a rule. */
export function PaneFootnote({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 pt-1.5',
        PANE_FOOTNOTE,
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Nothing to show, with an optional way out of that state. */
export function PaneEmpty({
  title,
  body,
  action,
  icon: Icon,
}: {
  title: string
  body: string
  action?: React.ReactNode
  icon: LucideIcon
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Icon className="mb-3 size-7 text-muted-foreground/40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action}
    </div>
  )
}

/**
 * What one venue said went wrong, verbatim, above the rows that did arrive.
 *
 * Amber rather than destructive: the other accounts are fine, and a red banner
 * over a working pane reads as "your positions are gone".
 */
export function PaneErrorBanner({
  venue,
  message,
}: {
  venue: string
  message: string
}) {
  return (
    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
      <span className="font-medium">{venue}</span> {message}
    </p>
  )
}
