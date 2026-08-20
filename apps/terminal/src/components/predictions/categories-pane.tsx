// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The discovery board's category rail.
 *
 * Counts come off the UNFILTERED events result — the same react-query entry
 * the board, the movers and the clock read — so picking a category narrows the
 * board without shrinking the rail that did the narrowing. The chip is a view,
 * never a narrower fetch; see `usePredictionEvents`.
 *
 * The counts are of the LOADED sample, not of the venue's universe, and that
 * is the honest reading: the board holds a hundred events per venue and this
 * rail counts exactly what it holds. A number scraped from somewhere else
 * would promise rows the board cannot show.
 *
 * The top row is "Trending" rather than "All" because that is what it selects:
 * no category filter, and the board's own default order, which on both venues
 * is the venue's front page.
 *
 * The venue block under it is not decoration. Half of what a prediction board
 * can show depends on which venue answered, and "Kalshi needs the desktop app"
 * is the difference between an empty board and a browser limitation.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Vote } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { CategoryRailSkeleton } from './prediction-skeletons'
import type { LucideIcon } from 'lucide-react'

import { PaneColumnHeader, PaneEmpty } from '@/components/panes/pane-primitives'
import { Shimmer, SkeletonStatus } from '@/components/panes/pane-skeletons'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import { track } from '@/lib/analytics-events'
import {
  TRENDING_ICON,
  predictionCategoryIcon,
  predictionCategoryLabel,
} from '@/lib/predictions/category-display'
import { useDiscoveryFilterStore } from '@/lib/predictions/discovery-filter-store'

export function CategoriesPane() {
  const { t } = useTranslation()
  const venues = usePredictionVenues()
  const category = useDiscoveryFilterStore((s) => s.category)
  const setCategory = useDiscoveryFilterStore((s) => s.setCategory)

  // Unfiltered, always: this is the entry every pane on the board shares.
  const { data, isLoading } = usePredictionEvents({
    venues,
    query: '',
    category: null,
  })

  const { counts, total } = useMemo(() => {
    const map = new Map<string, number>()
    let all = 0
    for (const venue of data ?? []) {
      for (const event of venue.events) {
        all++
        if (!event.category) continue
        map.set(event.category, (map.get(event.category) ?? 0) + 1)
      }
    }
    return {
      counts: [...map.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      ),
      total: all,
    }
  }, [data])

  if (venues.length === 0) {
    return (
      <PaneEmpty
        body={t('events.noVenuesBody')}
        icon={Vote}
        title={t('events.noVenuesTitle')}
      />
    )
  }

  // Counts are of the loaded sample, so before it lands there is no count to
  // print. The Trending row stays real — it is the selected filter and it is
  // clickable now — and only its number shimmers; "Trending 0" is not a
  // placeholder, it is a wrong number.
  const pending = isLoading && counts.length === 0

  return (
    <div
      aria-busy={pending}
      className="flex h-full flex-col overflow-y-auto py-0.5"
    >
      <div className="flex flex-col gap-0.5">
        {pending && <SkeletonStatus label={t('events.loading')} />}
        <CategoryRow
          active={category === null}
          count={pending ? null : total}
          icon={TRENDING_ICON}
          label={t('predictionCategories.trending')}
          onSelect={() => {
            track('prediction_category_selected', { category: null })
            setCategory(null)
          }}
        />
        {counts.map(([name, count]) => (
          <CategoryRow
            active={category === name}
            count={count}
            icon={predictionCategoryIcon(name)}
            key={name}
            label={predictionCategoryLabel(t, name)}
            onSelect={() => {
              const next = category === name ? null : name
              track('prediction_category_selected', { category: next })
              setCategory(next)
            }}
          />
        ))}
        {pending && <CategoryRailSkeleton />}
        {counts.length === 0 && !isLoading && (
          <p className="py-3 text-[11px] leading-relaxed text-muted-foreground">
            {t('predictionCategories.noneBody')}
          </p>
        )}
      </div>

      <div className="mt-4">
        <PaneColumnHeader>
          {t('predictionCategories.venueHeading')}
        </PaneColumnHeader>
        {venues.map((venue) => {
          const result = (data ?? []).find((r) => r.market === venue.market)
          const blocked = Boolean(result?.desktopOnly || result?.error)
          return (
            <div
              className="flex items-center gap-2 py-1 text-[11.5px]"
              key={venue.market}
              title={result?.error ?? undefined}
            >
              <span
                className={cn(
                  'size-[7px] shrink-0 rounded-full',
                  blocked ? 'bg-muted-foreground/50' : 'bg-up',
                )}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  blocked && 'text-muted-foreground',
                )}
              >
                {venue.label}
              </span>
              {/* The same badge the venue picker draws for a desktop-only
                  venue, down to the glyph: this row and that menu are two
                  places saying the identical thing about the identical venue,
                  and one of them saying it in bare grey type read as a
                  disabled label rather than as a platform fact. The error mark
                  beside it takes the badge shape too, because two different
                  shapes in one slot in one row is the mismatch that made the
                  first one look accidental. */}
              {result?.desktopOnly && (
                <Badge
                  className="h-4 shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground"
                  variant="outline"
                >
                  <Monitor />
                  {t('predictionCategories.desktopOnly')}
                </Badge>
              )}
              {!result?.desktopOnly && result?.error && (
                <Badge
                  className="h-4 shrink-0 px-1.5 text-[10px] text-amber-600 dark:text-amber-400"
                  variant="outline"
                >
                  {t('predictionCategories.venueError')}
                </Badge>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CategoryRow({
  active,
  count,
  icon: Icon,
  label,
  onSelect,
}: {
  active: boolean
  /** `null` while the sample is still arriving: the row draws, the tally does not. */
  count: number | null
  icon: LucideIcon
  label: string
  onSelect: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11.5px] transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-accent',
      )}
      onClick={onSelect}
      type="button"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate capitalize">{label}</span>
      {count === null ? (
        // Dimmed on the selected row: a `--muted` block sitting on the primary
        // chip is darker than the chip and reads as a hole punched in it.
        <Shimmer className={cn('h-2.5 w-4 shrink-0', active && 'opacity-45')} />
      ) : (
        <span
          className={cn(
            'shrink-0 font-mono text-[10px] tabular-nums',
            active ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
