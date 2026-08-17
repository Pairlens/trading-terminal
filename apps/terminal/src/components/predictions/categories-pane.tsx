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
 * The venue block under it is not decoration. Half of what a prediction board
 * can show depends on which venue answered, and "Kalshi needs the desktop app"
 * is the difference between an empty board and a browser limitation.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bitcoin,
  ChartLine,
  Globe,
  Landmark,
  Layers,
  Sparkles,
  Tag,
  Target,
  Trophy,
  Vote,
} from 'lucide-react'
import { cn } from '@pairlens/ui'
import type { LucideIcon } from 'lucide-react'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import { useDiscoveryFilterStore } from '@/lib/predictions/discovery-filter-store'

/** Category name fragment → the icon that reads as it. */
const CATEGORY_ICONS: Array<[RegExp, LucideIcon]> = [
  [/politic|election|congress|senate|president/i, Landmark],
  [/econom|inflation|fed|rate|jobs|cpi|gdp/i, ChartLine],
  [/crypto|bitcoin|ethereum|token/i, Bitcoin],
  [/sport|nba|nfl|soccer|football|tennis|f1/i, Trophy],
  [/geopolit|world|war|ukraine|middle east/i, Globe],
  [/culture|entertain|award|music|film|pop/i, Sparkles],
  [/science|space|tech|ai/i, Target],
]

function categoryIcon(name: string): LucideIcon {
  for (const [pattern, icon] of CATEGORY_ICONS) {
    if (pattern.test(name)) return icon
  }
  return Tag
}

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

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2">
      <div className="flex flex-col gap-0.5">
        <CategoryRow
          active={category === null}
          count={total}
          icon={Layers}
          label={t('predictionCategories.all')}
          onSelect={() => setCategory(null)}
        />
        {counts.map(([name, count]) => (
          <CategoryRow
            active={category === name}
            count={count}
            icon={categoryIcon(name)}
            key={name}
            label={name}
            onSelect={() => setCategory(category === name ? null : name)}
          />
        ))}
        {counts.length === 0 && !isLoading && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-muted-foreground">
            {t('predictionCategories.noneBody')}
          </p>
        )}
      </div>

      <div className="mt-3 border-t pt-2.5">
        <p className="mb-1 px-2 font-mono text-[9.5px] uppercase tracking-[.14em] text-muted-foreground">
          {t('predictionCategories.venueHeading')}
        </p>
        {venues.map((venue) => {
          const result = (data ?? []).find((r) => r.market === venue.market)
          const blocked = Boolean(result?.desktopOnly || result?.error)
          return (
            <div
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
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
              {result?.desktopOnly && (
                <span className="shrink-0 text-[9.5px] text-muted-foreground">
                  {t('predictionCategories.desktopOnly')}
                </span>
              )}
              {!result?.desktopOnly && result?.error && (
                <span className="shrink-0 text-[9.5px] text-amber-600 dark:text-amber-400">
                  {t('predictionCategories.venueError')}
                </span>
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
  count: number
  icon: LucideIcon
  label: string
  onSelect: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-xs transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-accent',
      )}
      onClick={onSelect}
      type="button"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate capitalize">{label}</span>
      <span
        className={cn(
          'shrink-0 font-mono text-[10px] tabular-nums',
          active ? 'text-primary-foreground/80' : 'text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  )
}
