// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What settles next.
 *
 * The one thing a volume-ranked board cannot tell you: 60% a month out and 60%
 * an hour out are different bets, and the second one is nearly decided. Rows
 * are sorted by the clock alone, and anything already settled is dropped
 * rather than shown at "closed" — this pane is about what is still tradeable.
 *
 * The right-hand number is the probability, not the price. This is a reading
 * rail: it answers "where does the market have this, with hours to go", and
 * the cents belong on the board's own tradeable chips.
 *
 * Reads the same unfiltered events entry as the rest of the board and narrows
 * by the rail's category at render.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Timer } from 'lucide-react'

import { cn } from '@pairlens/ui'

import { ResolvingSoonSkeleton } from './prediction-skeletons'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import { collectResolvingSoon } from '@/lib/predictions/board'
import { useDiscoveryCategory } from '@/lib/predictions/discovery-filter-store'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { formatTimeUntil } from '@/lib/format-time'

/** Rows the rail has room for before it becomes a second board. */
const MAX_ROWS = 25

/** Inside this window the countdown is the headline, so it is painted as one. */
const URGENT_MS = 24 * 3_600_000

/**
 * The probability, with a tenth only where the whole number would be zero.
 *
 * A long-shot resolving tomorrow sits at 0.4%, and rounding a live contract to
 * "0%" says it is already decided. Everything above a point keeps the round
 * number, because a column of "47.0%" is harder to scan than "47%".
 */
function formatProbability(price: number): string {
  const percent = price * 100
  return percent < 1 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`
}

export function ResolvingSoonPane() {
  const { t } = useTranslation()
  const venues = usePredictionVenues()
  const category = useDiscoveryCategory()
  const select = usePredictionSelect()

  const { data, isLoading } = usePredictionEvents({
    venues,
    query: '',
    category: null,
  })

  const rows = useMemo(
    () => collectResolvingSoon(data, { category, limit: MAX_ROWS }),
    [data, category],
  )

  if (venues.length === 0) {
    return (
      <PaneEmpty
        body={t('events.noVenuesBody')}
        icon={CalendarClock}
        title={t('events.noVenuesTitle')}
      />
    )
  }

  // Same rows, same countdown line, same right-hand probability — only the
  // readings are missing, so only they shimmer.
  if (isLoading && rows.length === 0) {
    return (
      <div aria-busy className="h-full overflow-hidden">
        <SkeletonStatus label={t('resolvingSoon.loadingTitle')} />
        <ResolvingSoonSkeleton />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <PaneEmpty
        body={t('resolvingSoon.emptyBody')}
        icon={CalendarClock}
        title={t('resolvingSoon.emptyTitle')}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {rows.map((row) => {
        const urgent = row.endMs - Date.now() < URGENT_MS
        return (
          <button
            className="flex w-full items-center gap-2.5 rounded-sm border-b border-border/40 px-1.5 py-1.5 text-left transition-colors last:border-0 hover:bg-accent/40"
            key={row.key}
            onClick={() => {
              if (!row.outcome) return
              select.select({
                venue: row.market,
                event: row.event,
                market: row.marketSummary,
                pairKey: row.outcome.pairKey,
                label: row.outcome.label,
              })
            }}
            type="button"
          >
            <Timer
              className={cn(
                'size-3.5 shrink-0',
                urgent ? 'text-[var(--chart-4)]' : 'text-muted-foreground',
              )}
            />
            <span className="min-w-0 flex-1">
              {/* Two lines, then an ellipsis. A single truncated line cut
                  "CPI above 3.0% in August" down to the word "CPI", which is
                  the one part of the question a reader could have guessed. */}
              <span className="line-clamp-2 text-[11.5px] leading-snug">
                {row.title}
              </span>
              <span
                className={cn(
                  'mt-0.5 block font-mono text-[10px] tabular-nums',
                  urgent ? 'text-[var(--chart-4)]' : 'text-muted-foreground',
                )}
              >
                {t('resolvingSoon.resolves', {
                  when: formatTimeUntil(row.endMs),
                })}
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">
              {row.price === null ? '—' : formatProbability(row.price)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
