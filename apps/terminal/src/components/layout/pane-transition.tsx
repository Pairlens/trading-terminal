// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { ReactNode, Ref } from 'react'

/**
 * Connector-switch transition wrapper (Bloomberg/TradingView-style).
 *
 * When the active connector changes, market panes keep showing the previous
 * (cached) data while the new connector backfills. Rather than snapping, we
 * dim the stale data and show a small "Switching to X…" badge, then crossfade
 * back to full opacity once fresh data has arrived (`phase === 'live'`).
 *
 * Important: this animates opacity on the layout container itself and does NOT
 * remount its children — keying a remount here would tear down and rebuild the
 * chart's WebGL context on every connector switch. Pass the SAME layout classes
 * the wrapped region would normally use via `className` so it's a drop-in.
 */
export function PaneTransition({
  /** 'switching' = awaiting fresh data (dim); 'live' = fresh (full opacity). */
  phase,
  /**
   * Human-readable connector label for the badge. Omit when the venue didn't
   * change (a pair switch on the same venue) — the badge then says only that
   * the pane is switching, rather than naming the venue it is already on.
   */
  marketLabel,
  /** Layout classes for the container (drop-in for the wrapped region). */
  className,
  /** Optional ref to the animated container (e.g. for ResizeObserver). */
  ref,
  children,
}: {
  phase: 'switching' | 'live'
  marketLabel?: string
  className?: string
  ref?: Ref<HTMLDivElement>
  children: ReactNode
}) {
  const { t } = useTranslation()
  const switching = phase === 'switching'

  return (
    <motion.div
      ref={ref}
      className={className ?? 'relative h-full w-full'}
      animate={{ opacity: switching ? 0.45 : 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {children}

      {switching && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2">
          <span className="rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
            {marketLabel
              ? t('layout.paneTransition.switchingTo', { venue: marketLabel })
              : t('layout.paneTransition.switching')}
          </span>
        </div>
      )}
    </motion.div>
  )
}
