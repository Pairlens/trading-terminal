// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The discovery board: every live question as a card that prices both sides.
 *
 * The card is where the two shapes of prediction market stop being the same
 * thing. A binary question has one number worth reading — the probability —
 * and the card gives it the largest type on the board. A race has 128 numbers
 * and none of them is the headline, so its card widens, ranks the field and
 * says how much of the probability mass the leaders hold, with a way into the
 * ladder for the rest.
 *
 * The probability is shown as a percentage and the tradeable prices in cents.
 * They are the same number twice on purpose: the percentage is the reading
 * ("the market thinks 78"), the cents are the price ("you pay 78 to win 100").
 * What never appears is a dollar figure beside either.
 *
 * The search box narrows the venue's own board when it can, and asks the venue
 * when it cannot: the fetch holds thirty events per venue, so anything past
 * that only exists behind a venue-side query.
 */
import { memo, useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Vote } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'

import { EventThumbnail } from './event-pieces'
import type { BoardEvent, BoardSort } from '@/lib/predictions/board'
import type { PredictionRunner } from '@/lib/predictions/race'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import {
  BOARD_SORTS,
  createdOf,
  endOf,
  eventVolume,
  flattenBoardEvents,
  sortBoardEvents,
} from '@/lib/predictions/board'
import { useDiscoveryFilterStore } from '@/lib/predictions/discovery-filter-store'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import {
  byProbability,
  isRaceEvent,
  runnerPrice,
  runnersOf,
  topRunnerShare,
} from '@/lib/predictions/race'
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'
import { formatRelativeTime, formatTimeUntil } from '@/lib/format-time'

/** The pane's own `t`, so a helper below can take it as an argument. */
type Translate = ReturnType<typeof useTranslation>['t']

/** Runners a race card ranks before it defers to the ladder. */
const RACE_PREVIEW = 4

/** Chart tokens the stacked share bar walks, leaders first. */
const SHARE_TOKENS = [
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--chart-5)',
]

/**
 * Literal keys, not a template. The i18n audit can only verify a `t()` call
 * whose key is a literal, and a sort control nobody can audit is exactly where
 * a missing translation hides.
 */
const SORT_LABEL_KEYS: Record<BoardSort, string> = {
  trending: 'eventBoard.sort.trending',
  new: 'eventBoard.sort.new',
  endingSoon: 'eventBoard.sort.endingSoon',
  volume: 'eventBoard.sort.volume',
  biggestMove: 'eventBoard.sort.biggestMove',
}

export function EventBoardPane() {
  const { t } = useTranslation()
  const venues = usePredictionVenues()
  const category = useDiscoveryFilterStore((s) => s.category)
  const query = useDiscoveryFilterStore((s) => s.query)
  const setQuery = useDiscoveryFilterStore((s) => s.setQuery)
  const [sort, setSort] = useState<BoardSort>('trending')

  // The venue-side search runs on the deferred value; the local filter runs on
  // every keystroke. So typing narrows what is already loaded instantly, and
  // the venue is only asked once the user stops.
  const deferredQuery = useDeferredValue(query)

  const { data, isLoading } = usePredictionEvents({
    venues,
    query: deferredQuery.trim(),
    category: null,
  })

  const rows = useMemo(() => {
    const flat = flattenBoardEvents(data, { category, query })
    return sortBoardEvents(flat, sort)
  }, [data, category, query, sort])

  const liveCount = useMemo(
    () =>
      (data ?? []).reduce(
        (n, venue) =>
          n + (venue.error || venue.desktopOnly ? 0 : venue.events.length),
        0,
      ),
    [data],
  )

  const blocked = (data ?? []).filter((v) => v.desktopOnly || v.error)

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
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3.5 py-2.5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-[30px] rounded-lg pl-8 text-xs"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('eventBoard.searchPlaceholder', {
              count: liveCount,
            })}
            value={query}
          />
        </div>
        <div className="flex gap-1">
          {BOARD_SORTS.map((option) => (
            <button
              aria-pressed={sort === option}
              className={cn(
                'rounded-lg px-2.5 py-[5px] text-[11.5px] transition-colors',
                sort === option
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'border text-foreground hover:bg-accent',
              )}
              key={option}
              onClick={() => setSort(option)}
              type="button"
            >
              {t(SORT_LABEL_KEYS[option])}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {blocked.length > 0 && (
          <div className="mb-2.5 flex flex-col gap-1.5">
            {blocked.map((venue) => (
              <p
                className="rounded-lg border border-dashed px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
                key={venue.market}
              >
                {venue.desktopOnly
                  ? t('events.venueDesktopOnly', { venue: venue.label })
                  : `${venue.label}: ${venue.error}`}
              </p>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <PaneEmpty
            body={
              isLoading
                ? t('eventBoard.loadingBody')
                : query
                  ? t('events.noMatchesBody')
                  : t('events.emptyBody')
            }
            icon={Vote}
            title={
              isLoading
                ? t('eventBoard.loadingTitle')
                : query
                  ? t('events.noMatchesTitle')
                  : t('events.emptyTitle')
            }
          />
        ) : (
          // A container query, not a viewport one: this grid is a pane inside
          // a resizable column, and a race card that split at the viewport
          // width would go two-column inside a 280px cell.
          <div className="@container grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] content-start gap-2.5">
            {rows.map((row) => (
              <EventCard key={row.key} row={row} sort={sort} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Cards ─────────────────────────────────────────────────────────────

const EventCard = memo(function EventCard({
  row,
  sort,
}: {
  row: BoardEvent
  sort: BoardSort
}) {
  const runners = useMemo(() => runnersOf(row.event), [row.event])
  return isRaceEvent(row.event) ? (
    <RaceCard row={row} runners={runners} sort={sort} />
  ) : (
    <BinaryCard row={row} runners={runners} sort={sort} />
  )
})

function CardHeader({ row, meta }: { row: BoardEvent; meta: string }) {
  return (
    <header className="flex items-start gap-2.5">
      <EventThumbnail className="size-9" imageUrl={row.event.imageUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold leading-snug">
          {row.event.title}
        </h3>
        <p className="mt-[3px] truncate text-[10.5px] text-muted-foreground">
          {meta}
        </p>
      </div>
    </header>
  )
}

/**
 * The card's second line.
 *
 * The listing time appears only under the New sort, and that is deliberate: it
 * is the fact the ordering is built on, so without it the board looks shuffled,
 * and on any other sort it would be a fourth clause competing with the close
 * for a line that truncates.
 */
function metaLine(
  row: BoardEvent,
  { extra, sort, t }: { extra?: string; sort: BoardSort; t: Translate },
): string {
  const end = endOf(row.event)
  const created = sort === 'new' ? createdOf(row.event) : null
  return [
    row.event.category,
    extra,
    row.venueLabel,
    created === null
      ? null
      : t('eventBoard.listed', { when: formatRelativeTime(created) }),
    end === null ? null : formatTimeUntil(end),
  ]
    .filter(Boolean)
    .join(' · ')
}

function BinaryCard({
  row,
  runners,
  sort,
}: {
  row: BoardEvent
  runners: Array<PredictionRunner>
  sort: BoardSort
}) {
  const { t } = useTranslation()
  const select = usePredictionSelect()
  const lead = runners[0]
  const price = lead ? runnerPrice(lead) : null
  const change = lead?.yes.change24h
  const volume = eventVolume(row.event)
  const liquidity = row.event.liquidity ?? lead?.market.liquidity

  const open = (runner: PredictionRunner) =>
    select.open({
      venue: row.market,
      event: row.event,
      market: runner.market,
      pairKey: runner.yes.pairKey,
      label: runner.yes.label,
    })

  return (
    <article className="flex flex-col gap-2.5 rounded-xl border p-3 transition-colors hover:border-primary/40">
      <button
        className="text-left"
        onClick={() => lead && open(lead)}
        type="button"
      >
        <CardHeader meta={metaLine(row, { sort, t })} row={row} />
      </button>

      <div className="flex items-end gap-3">
        <div className="shrink-0">
          {/* The reading, not the price: "the market thinks 78". The chips
              below carry the same number as what it costs. */}
          <p
            className={cn(
              'font-mono text-[30px] font-semibold leading-none tabular-nums',
              change === undefined || change === 0
                ? 'text-foreground'
                : change > 0
                  ? 'text-up'
                  : 'text-down',
            )}
          >
            {price === null ? '—' : Math.round(price * 100)}
            <span className="text-[18px]">%</span>
          </p>
          <ChangeLine change={change} />
        </div>
        {lead && (
          <MiniPriceChart
            className="h-10 min-w-0 flex-1"
            market={row.market}
            pair={lead.yes.pairKey}
          />
        )}
      </div>

      <div className="flex gap-1.5">
        {runners.slice(0, 2).map((runner, index) => {
          const chipPrice = runnerPrice(runner)
          return (
            <button
              className={cn(
                'flex-1 rounded-lg px-2 py-[7px] text-center font-mono text-xs font-medium tabular-nums transition-colors',
                index === 0
                  ? 'bg-up/15 text-up hover:bg-up/25'
                  : 'bg-down/12 text-down hover:bg-down/20',
              )}
              key={runner.yes.pairKey}
              onClick={() => open(runner)}
              type="button"
            >
              <span className="font-sans">{runner.label} </span>
              {chipPrice === null ? '—' : formatPredictionPrice(chipPrice)}
            </button>
          )
        })}
      </div>

      <div className="flex justify-between text-[10.5px] text-muted-foreground">
        <span>
          {volume === null
            ? t('eventBoard.volumeUnknown')
            : t('events.volume', { value: formatCompactUsd(volume) })}
        </span>
        {liquidity !== undefined && (
          <span>
            {t('eventBoard.liquidity', { value: formatCompactUsd(liquidity) })}
          </span>
        )}
      </div>
    </article>
  )
}

function RaceCard({
  row,
  runners,
  sort,
}: {
  row: BoardEvent
  runners: Array<PredictionRunner>
  sort: BoardSort
}) {
  const { t } = useTranslation()
  const select = usePredictionSelect()
  const ranked = useMemo(() => byProbability(runners), [runners])
  const preview = ranked.slice(0, RACE_PREVIEW)
  const share = topRunnerShare(runners, RACE_PREVIEW)
  const volume = eventVolume(row.event)
  const hidden = runners.length - preview.length

  const open = (runner: PredictionRunner) =>
    select.open({
      venue: row.market,
      event: row.event,
      market: runner.market,
      pairKey: runner.yes.pairKey,
      label: runner.yes.label,
    })

  return (
    <article className="col-span-full flex flex-col gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40 @[640px]:flex-row @[640px]:gap-4">
      <div className="flex flex-col gap-2.5 @[640px]:w-[34%] @[640px]:shrink-0">
        <button
          className="text-left"
          onClick={() => preview[0] && open(preview[0])}
          type="button"
        >
          <CardHeader
            meta={metaLine(row, {
              extra: t('eventBoard.outcomeCount', { count: runners.length }),
              sort,
              t,
            })}
            row={row}
          />
        </button>
        {volume !== null && (
          <p className="text-[10.5px] text-muted-foreground">
            {t('events.volume', { value: formatCompactUsd(volume) })}
          </p>
        )}
        <ShareBar runners={ranked} />
        {share !== null && (
          <p className="text-[10.5px] leading-snug text-muted-foreground">
            {t('eventBoard.topShare', {
              count: preview.length,
              percent: Math.round(share * 100),
            })}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {preview.map((runner, index) => {
          const price = runnerPrice(runner)
          const change = runner.yes.change24h
          return (
            <button
              className="flex items-center gap-2.5 rounded-md py-0.5 text-left transition-colors hover:bg-accent/40"
              key={runner.yes.pairKey}
              onClick={() => open(runner)}
              type="button"
            >
              <span className="w-[38%] max-w-[152px] shrink-0 truncate text-[12.5px]">
                {runner.label}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round((price ?? 0) * 100)}%`,
                    background: SHARE_TOKENS[index % SHARE_TOKENS.length],
                  }}
                />
              </span>
              <span className="w-11 shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums">
                {price === null ? '—' : `${(price * 100).toFixed(1)}%`}
              </span>
              <span
                className={cn(
                  'w-10 shrink-0 text-right font-mono text-[11px] tabular-nums',
                  change === undefined || change === 0
                    ? 'text-muted-foreground'
                    : change > 0
                      ? 'text-up'
                      : 'text-down',
                )}
              >
                {change === undefined
                  ? ''
                  : `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}`}
              </span>
            </button>
          )
        })}
        {hidden > 0 && (
          <button
            className="mt-0.5 self-start text-[11px] text-primary hover:underline"
            onClick={() => preview[0] && open(preview[0])}
            type="button"
          >
            {t('eventBoard.openFullField', { count: hidden })}
          </button>
        )}
      </div>
    </article>
  )
}

function ShareBar({ runners }: { runners: Array<PredictionRunner> }) {
  const segments = runners.slice(0, RACE_PREVIEW)
  const total = runners.reduce((sum, r) => sum + (runnerPrice(r) ?? 0), 0)
  if (total <= 0) return null
  return (
    <div className="flex h-[9px] overflow-hidden rounded-full">
      {segments.map((runner, index) => (
        <span
          key={runner.yes.pairKey}
          style={{
            width: `${((runnerPrice(runner) ?? 0) / total) * 100}%`,
            background: SHARE_TOKENS[index % SHARE_TOKENS.length],
          }}
        />
      ))}
      <span className="flex-1 bg-muted" />
    </div>
  )
}

function ChangeLine({ change }: { change: number | undefined }) {
  const { t } = useTranslation()
  // Nothing at all when the venue publishes no move: an absent reading is not
  // "unchanged", and printing it as one invents a fact about the day.
  if (change === undefined) return null
  const points = Math.abs(change * 100)
  if (change === 0 || points < 0.05) {
    return (
      <p className="mt-[3px] text-[11px] text-muted-foreground">
        {t('eventBoard.unchanged')}
      </p>
    )
  }
  return (
    <p
      className={cn(
        'mt-[3px] text-[11px]',
        change > 0 ? 'text-up' : 'text-down',
      )}
    >
      {t('eventBoard.movedPoints', {
        arrow: change > 0 ? '▲' : '▼',
        points: points.toFixed(points < 1 ? 1 : 0),
      })}
    </p>
  )
}
