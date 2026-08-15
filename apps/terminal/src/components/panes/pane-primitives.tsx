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

/** A column header: mono, uppercase, tracked out, right-aligned for numbers. */
export function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={cn(
        'pb-1.5 pr-3 font-mono text-[10px] font-medium uppercase tracking-[.14em] last:pr-0',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
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
