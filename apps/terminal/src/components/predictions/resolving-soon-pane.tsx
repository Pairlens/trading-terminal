// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What settles next.
 *
 * The one thing a volume-ranked board cannot tell you: 60¢ a month out and 60¢
 * an hour out are different bets, and the second one is nearly decided. Rows
 * are sorted by the clock alone, and anything already settled is dropped
 * rather than shown at "closed" — this pane is about what is still tradeable.
 *
 * Reads the same unfiltered events entry as the rest of the board and narrows
 * by the rail's category at render.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Timer } from 'lucide-react'

import { cn } from '@pairlens/ui'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import { collectResolvingSoon } from '@/lib/predictions/board'
import { useDiscoveryCategory } from '@/lib/predictions/discovery-filter-store'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { formatPredictionPrice } from '@/lib/format-price'
import { formatTimeUntil } from '@/lib/format-time'

/** Rows the rail has room for before it becomes a second board. */
const MAX_ROWS = 25

/** Inside this window the countdown is the headline, so it is painted as one. */
const URGENT_MS = 24 * 3_600_000

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

  if (rows.length === 0) {
    return (
      <PaneEmpty
        body={
          isLoading
            ? t('resolvingSoon.loadingBody')
            : t('resolvingSoon.emptyBody')
        }
        icon={CalendarClock}
        title={
          isLoading
            ? t('resolvingSoon.loadingTitle')
            : t('resolvingSoon.emptyTitle')
        }
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {rows.map((row) => {
        const urgent = row.endMs - Date.now() < URGENT_MS
        return (
          <button
            className="flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-2 text-left transition-colors last:border-0 hover:bg-accent/40"
            key={row.key}
            onClick={() => {
              if (!row.outcome) return
              select.open({
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
              <span className="block truncate text-[11.5px] leading-snug">
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
              {row.price === null ? '—' : formatPredictionPrice(row.price)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
