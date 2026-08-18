// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The discovery board: every live question as a card that prices both sides.
 *
 * The card is where the two shapes of prediction market stop being the same
 * thing. A binary question has one number worth reading — the probability —
 * and the card gives it the largest type on the board. A race has 128 numbers
 * and none of them is the headline, so its card widens to the full board,
 * ranks the field and says how much of the probability mass the leaders hold,
 * with a way into the rest.
 *
 * Two readings of one number, and the split is deliberate. The percentage is
 * what the market THINKS ("78") and it carries the headline, the runner rows
 * and the delta. The cents are what a contract COSTS ("78¢") and they appear
 * only on the two chips that trade. What never appears is a dollar figure
 * beside either.
 *
 * The search box narrows the venue's own board when it can, and asks the venue
 * when it cannot: the fetch holds a hundred events per venue, so anything past
 * that only exists behind a venue-side query.
 */
import { memo, useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Search, Vote } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'

import { EventDialog } from './event-dialog'
import { EventThumbnail } from './event-pieces'
import type { BoardEvent, BoardSort } from '@/lib/predictions/board'
import type { PredictionRunner } from '@/lib/predictions/race'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { MONTH_WINDOW } from '@/hooks/use-sparkline'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import {
  BOARD_SORTS,
  createdOf,
  endOf,
  eventLiquidity,
  eventOpenInterest,
  eventVolume,
  flattenBoardEvents,
  liveMarketCount,
  sortBoardEvents,
} from '@/lib/predictions/board'
import { track } from '@/lib/analytics-events'
import { useDiscoveryFilterStore } from '@/lib/predictions/discovery-filter-store'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { binarySideOf } from '@/lib/predictions/event-labels'
import { runnerColorIndex, runnerToken } from '@/lib/predictions/palette'
import {
  byProbability,
  headlineRunner,
  isRaceEvent,
  massBarSegments,
  raceFieldKind,
  runnerPrice,
  runnersOf,
  topRunnerShare,
} from '@/lib/predictions/race'
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'
import { formatRelativeTime, formatTimeUntil } from '@/lib/format-time'

/** The pane's own `t`, so a helper below can take it as an argument. */
type Translate = ReturnType<typeof useTranslation>['t']

/** Runners a race card ranks before it defers to the full field. */
const RACE_PREVIEW = 4

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
  const select = usePredictionSelect()
  const category = useDiscoveryFilterStore((s) => s.category)
  const query = useDiscoveryFilterStore((s) => s.query)
  const setQuery = useDiscoveryFilterStore((s) => s.setQuery)
  const [sort, setSort] = useState<BoardSort>('trending')
  // The event whose full field is open, or null. Held here rather than per
  // card so only one reader can ever be mounted.
  const [fullField, setFullField] = useState<BoardEvent | null>(null)

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

  // Markets, not events: a market is what the search can find, and a board of
  // a hundred events is several thousand questions.
  const liveCount = useMemo(() => liveMarketCount(data), [data])

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
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b px-3.5 py-2.5">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {blocked.length > 0 && (
          <div className="mb-2.5 flex flex-col gap-1">
            {/* One muted line, not a boxed notice: the venue rail beside this
                board already carries the venue's state, and a dashed panel
                across the top of a full board reads as an error. */}
            {blocked.map((venue) => (
              <p
                className="text-[10.5px] leading-relaxed text-muted-foreground"
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
          // a resizable column, and a board that went two-up at the viewport
          // width would split a 280px cell down the middle. Two fixed columns
          // above 34rem is the design's own grid; below it the cards stack,
          // because a binary card at 220px cannot hold a 32px headline and a
          // sparkline side by side.
          <div className="@container">
            <div className="grid grid-cols-1 content-start gap-2.5 @[34rem]:grid-cols-2">
              {rows.map((row) => (
                <EventCard
                  key={row.key}
                  onOpenField={setFullField}
                  row={row}
                  sort={sort}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The full field, read from the payload the board already holds — see
          `EventDialog`. Picking a runner there does what picking one on a card
          does: pin, then navigate. */}
      <EventDialog
        event={fullField?.event ?? null}
        onOpenChange={(open) => !open && setFullField(null)}
        onSelect={(event, market, pairKey, label) => {
          if (!fullField) return
          select.open({
            venue: fullField.market,
            event,
            market,
            pairKey,
            label,
          })
          setFullField(null)
        }}
        venueLabel={fullField?.venueLabel ?? ''}
      />
    </div>
  )
}

// ── Cards ─────────────────────────────────────────────────────────────

const EventCard = memo(function EventCard({
  onOpenField,
  row,
  sort,
}: {
  onOpenField: (row: BoardEvent) => void
  row: BoardEvent
  sort: BoardSort
}) {
  const runners = useMemo(() => runnersOf(row.event), [row.event])
  return isRaceEvent(row.event) ? (
    <RaceCard
      onOpenField={onOpenField}
      row={row}
      runners={runners}
      sort={sort}
    />
  ) : (
    <BinaryCard row={row} runners={runners} sort={sort} />
  )
})

function CardHeader({ row, meta }: { row: BoardEvent; meta: string }) {
  return (
    <header className="flex items-start gap-2.5">
      {/* The venue's own artwork, with the class glyph as the fallback: forty
          pictures scan in a way forty text blocks never do. */}
      <EventThumbnail className="size-[38px]" imageUrl={row.event.imageUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold leading-snug text-pretty">
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
    end === null
      ? null
      : t('eventBoard.endsIn', { when: formatTimeUntil(end) }),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The footer stats, in the order the design reads them.
 *
 * Absent stats are omitted rather than zero-filled. Polymarket publishes no
 * per-market open interest and Kalshi publishes no event liquidity, so a card
 * with two stats is the normal case and a card with three is a bonus.
 */
function statLine(
  row: BoardEvent,
  { t, withLiquidity }: { t: Translate; withLiquidity: boolean },
): Array<string> {
  const stats: Array<string> = []
  const volume = eventVolume(row.event)
  if (volume !== null) {
    stats.push(t('events.volume', { value: formatCompactUsd(volume) }))
  }
  const liquidity = withLiquidity ? eventLiquidity(row.event) : null
  if (liquidity !== null) {
    stats.push(
      t('eventBoard.liquidity', { value: formatCompactUsd(liquidity) }),
    )
  }
  const openInterest = eventOpenInterest(row.event)
  if (openInterest !== null) {
    // Contracts, not dollars: Kalshi's open interest is a position count, and
    // formatting it as money would invent a currency figure.
    stats.push(
      t('eventBoard.openInterest', {
        value: Math.round(openInterest).toLocaleString(),
      }),
    )
  }
  return stats
}

function StatRow({ stats, t }: { stats: Array<string>; t: Translate }) {
  return (
    <div className="flex justify-between gap-2 text-[10.5px] text-muted-foreground">
      {stats.length === 0 ? (
        <span>{t('eventBoard.volumeUnknown')}</span>
      ) : (
        stats.map((stat) => <span key={stat}>{stat}</span>)
      )}
    </div>
  )
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
  // The Yes leg, never `runners[0]`: Polymarket orders a market's legs however
  // it likes, and reading the first one printed a 92% headline over a question
  // the market gives an 8% chance.
  const lead = headlineRunner(runners)
  const price = lead ? runnerPrice(lead) : null
  const change = lead?.yes.change24h
  const moved = change !== undefined && Math.abs(change) >= 0.0005
  const stats = statLine(row, { t, withLiquidity: true })

  // Yes first, by label rather than by position — same reason as the headline.
  const chips = useMemo(
    () => runners.slice(0, 2).sort((a, b) => sideRank(a) - sideRank(b)),
    [runners],
  )

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
              'font-mono text-[32px] font-semibold leading-none tabular-nums',
              !moved ? 'text-foreground' : change > 0 ? 'text-up' : 'text-down',
            )}
          >
            {price === null ? '—' : Math.round(price * 100)}
            <span className="text-[19px]">%</span>
          </p>
          <ChangeLine change={change} />
        </div>
        {lead && (
          <MiniPriceChart
            className="h-11 min-w-0 flex-1"
            // A month of daily closes, the same window the ladder draws and
            // for the same reason: the 24h move is already stated in words
            // beside this line, and a day of hourly closes on a contract that
            // trades a few times an hour is a flat line with no history.
            historyWindow={MONTH_WINDOW}
            market={row.market}
            pair={lead.yes.pairKey}
            // A card that says "unchanged" must not draw a green line beside
            // the word: over a month of closes almost every contract is up or
            // down on the window, and the colour would argue with the delta.
            tone={moved ? 'auto' : 'muted'}
          />
        )}
      </div>

      <div className="flex gap-1.5">
        {chips.map((runner) => {
          const chipPrice = runnerPrice(runner)
          const side = binarySideOf(runner.label)
          return (
            <button
              className={cn(
                'flex-1 rounded-lg px-2 py-[7px] text-center font-mono text-[12.5px] font-medium tabular-nums transition-colors',
                side === 'no'
                  ? 'bg-down/12 text-down hover:bg-down/20'
                  : side === 'yes'
                    ? 'bg-up/15 text-up hover:bg-up/25'
                    : 'bg-muted text-foreground hover:bg-accent',
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

      <StatRow stats={stats} t={t} />
    </article>
  )
}

/** Yes before No before anything the venue names for itself. */
function sideRank(runner: PredictionRunner): number {
  const side = binarySideOf(runner.label)
  if (side === 'yes') return 0
  if (side === 'no') return 1
  return 2
}

function RaceCard({
  onOpenField,
  row,
  runners,
  sort,
}: {
  onOpenField: (row: BoardEvent) => void
  row: BoardEvent
  runners: Array<PredictionRunner>
  sort: BoardSort
}) {
  const { t } = useTranslation()
  const select = usePredictionSelect()
  const ranked = useMemo(() => byProbability(runners), [runners])
  const preview = ranked.slice(0, RACE_PREVIEW)
  const share = topRunnerShare(runners, RACE_PREVIEW)
  const hidden = runners.length - preview.length
  const kind = raceFieldKind(row.event)
  // Liquidity is left off a race: it is stated per market on both venues, and
  // a sum across 128 books is a number nobody can act on.
  const stats = statLine(row, { t, withLiquidity: false })

  const open = (runner: PredictionRunner) =>
    select.open({
      venue: row.market,
      event: row.event,
      market: runner.market,
      pairKey: runner.yes.pairKey,
      label: runner.yes.label,
    })

  return (
    <article className="col-span-full flex flex-col gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40 @[44rem]:flex-row @[44rem]:gap-4">
      <div className="flex flex-col gap-2.5 @[44rem]:w-[34%] @[44rem]:shrink-0">
        <button
          className="text-left"
          onClick={() => preview[0] && open(preview[0])}
          type="button"
        >
          <CardHeader
            meta={metaLine(row, {
              extra:
                kind === 'candidates'
                  ? t('eventBoard.candidateCount', { count: runners.length })
                  : t('eventBoard.outcomeCount', { count: runners.length }),
              sort,
              t,
            })}
            row={row}
          />
        </button>
        <StatRow stats={stats} t={t} />
        <MassBar runners={runners} />
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
        {preview.map((runner) => (
          <RunnerRow
            key={runner.yes.pairKey}
            market={row.market}
            onOpen={() => open(runner)}
            runner={runner}
            token={runnerToken(runnerColorIndex(runners, runner.yes.pairKey))}
          />
        ))}
        {hidden > 0 && (
          <button
            className="mt-0.5 flex items-center gap-1 self-start text-[11px] text-primary hover:underline"
            onClick={() => {
              track('prediction_full_field_opened', { runners_hidden: hidden })
              onOpenField(row)
            }}
            type="button"
          >
            {t('eventBoard.openFullField', { count: hidden })}
            <ArrowRight className="size-3" />
          </button>
        )}
      </div>
    </article>
  )
}

/**
 * One runner: name, its share of the bar, its probability, its move, its arc.
 *
 * The sparkline is the same month of daily closes the ladder draws, keyed on
 * the same venue and pair — so a runner's line does not change shape when the
 * user opens the race board. It is visibility-gated and queued four at a time
 * by `useSparkline`, which is what keeps a board of race cards from opening a
 * request per runner on arrival.
 */
function RunnerRow({
  market,
  onOpen,
  runner,
  token,
}: {
  market: string
  onOpen: () => void
  runner: PredictionRunner
  token: string
}) {
  const price = runnerPrice(runner)
  const change = runner.yes.change24h
  const moved = change !== undefined && Math.abs(change) >= 0.0005
  return (
    <button
      className="flex items-center gap-2.5 rounded-md py-0.5 text-left transition-colors hover:bg-accent/40"
      onClick={onOpen}
      type="button"
    >
      <span className="w-[38%] shrink-0 truncate text-[12.5px] @[44rem]:w-[152px]">
        {runner.label}
      </span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.round((price ?? 0) * 100)}%`,
            background: token,
          }}
        />
      </span>
      <span className="w-11 shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums">
        {price === null ? '—' : `${(price * 100).toFixed(1)}%`}
      </span>
      <span
        className={cn(
          'w-11 shrink-0 text-right font-mono text-[11px] tabular-nums',
          !moved
            ? 'text-muted-foreground'
            : change > 0
              ? 'text-up'
              : 'text-down',
        )}
      >
        {change === undefined
          ? '—'
          : `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}`}
      </span>
      <MiniPriceChart
        className="h-4 w-[50px]"
        historyWindow={MONTH_WINDOW}
        market={market}
        pair={runner.yes.pairKey}
        tone={moved ? 'auto' : 'muted'}
      />
    </button>
  )
}

/**
 * The leaders' share of the field, in absolute probability.
 *
 * The grey tail is half the reading: it is everyone else. Segments are the
 * runners' own probabilities rather than their share of each other, so four
 * runners at 5% each fill a fifth of the bar — which is exactly what a race
 * with no favourite looks like.
 */
function MassBar({ runners }: { runners: Array<PredictionRunner> }) {
  const segments = useMemo(
    () => massBarSegments(runners, RACE_PREVIEW),
    [runners],
  )
  if (segments.length === 0) return null
  return (
    <div className="flex h-[9px] overflow-hidden rounded-full">
      {segments.map((segment) => (
        <span
          className="shrink-0"
          key={segment.pairKey}
          style={{
            width: `${segment.percent}%`,
            background: runnerToken(runnerColorIndex(runners, segment.pairKey)),
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
        <span aria-hidden>— </span>
        {t('eventBoard.unchanged')}
      </p>
    )
  }
  const shown = points.toFixed(points < 1 ? 1 : 0)
  return (
    <p
      className={cn(
        'mt-[3px] text-[11px]',
        change > 0 ? 'text-up' : 'text-down',
      )}
    >
      {/* The count is the number as PRINTED, not the raw move: a 1.2 point
          move rounds to "1", and "1 pts today" is the kind of thing a reader
          notices before they notice anything else on the card. */}
      {t('eventBoard.movedPoints', {
        arrow: change > 0 ? '▲' : '▼',
        count: Number(shown),
        points: shown,
      })}
    </p>
  )
}
