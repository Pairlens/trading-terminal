// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pieces the on-chain panes draw the same way: a stat cell, a share bar,
 * an impact bar, and the surface a pane shows when the thing it describes has
 * no source yet.
 *
 * That last one is the reason this file exists rather than each pane rolling
 * its own. Six of the thirteen DEX panes are waiting on a data source (LP
 * positions, bridging), and "waiting" has to look like a deliberate state
 * rather than a broken pane: the same icon, the same two sentences, and a line
 * naming exactly what it WOULD read once the source lands.
 */
import { cn } from '@pairlens/ui/lib/utils'
import type { LucideIcon } from 'lucide-react'

import { swatchIndexFor } from '@/lib/dex/pool-math'

/**
 * A pool's colour badge.
 *
 * Not a token logo, because nothing on the pool-stats path publishes one: the
 * listing carries an address and a ticker, and an `<img>` pointed at a guessed
 * URL renders as a broken-image glyph on most chains. A deterministic swatch
 * always loads, is the same colour for the same pool on every machine, and
 * still gives the pane the fixed anchor a logo would.
 */
export function PoolSwatch({
  seed,
  className,
}: {
  seed: string
  className?: string
}) {
  const tone = swatchIndexFor(seed)
  return (
    <span
      aria-hidden="true"
      className={cn('size-7 shrink-0 rounded-full', className)}
      style={{ background: `var(--chart-${tone})`, opacity: 0.9 }}
    />
  )
}

/** A number and its label. `sub` carries the qualifier under the value. */
export function StatCell({
  label,
  value,
  sub,
  subTone = 'muted',
  className,
}: {
  label: string
  value: string
  sub?: string | null
  subTone?: 'muted' | 'up' | 'down' | 'caution'
  className?: string
}) {
  return (
    <div className={cn('min-w-0 px-3 py-2', className)}>
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[15px] font-semibold [font-variant-numeric:tabular-nums]">
        {value}
      </p>
      {sub ? (
        <p
          className={cn(
            'truncate text-[10px] [font-variant-numeric:tabular-nums]',
            subTone === 'up' && 'text-up',
            subTone === 'down' && 'text-down',
            subTone === 'caution' && 'text-[var(--chart-4)]',
            subTone === 'muted' && 'text-muted-foreground',
          )}
        >
          {sub}
        </p>
      ) : null}
    </div>
  )
}

/** A route leg's share of the input, drawn as a proportional bar. */
export function ShareBar({
  fraction,
  tone = 'accent',
}: {
  fraction: number
  tone?: 'accent' | 'up' | 'down' | 'caution' | 'muted'
}) {
  const width = `${Math.min(100, Math.max(0, fraction * 100))}%`
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width,
          background:
            tone === 'up'
              ? 'var(--chart-2)'
              : tone === 'down'
                ? 'var(--destructive)'
                : tone === 'caution'
                  ? 'var(--chart-4)'
                  : tone === 'muted'
                    ? 'var(--muted-foreground)'
                    : 'var(--primary)',
        }}
      />
    </div>
  )
}

/**
 * A pane whose subject exists but whose data source does not.
 *
 * Distinct from `PaneEmpty` on purpose: empty means "nothing matched", this
 * means "nothing can answer yet". `reads` is the sentence that keeps it from
 * reading as a bug — the wallet, pool or chain the pane would use the moment a
 * source is connected.
 */
export function PaneAwaitingSource({
  icon: Icon,
  title,
  body,
  reads,
}: {
  icon: LucideIcon
  title: string
  body: string
  reads?: string | null
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Icon className="mb-3 size-7 text-muted-foreground/40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
      {reads ? (
        <p className="mt-3 max-w-xs rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {reads}
        </p>
      ) : null}
    </div>
  )
}

/** Pane header: a title, an optional qualifier, and room for a control. */
export function DexPaneHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string | null
  children?: React.ReactNode
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-semibold">{title}</h2>
        {subtitle ? (
          <p className="truncate text-[10px] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </header>
  )
}
