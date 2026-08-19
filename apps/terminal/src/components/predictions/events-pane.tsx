// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event browser — how a prediction outcome is FOUND.
 *
 * Predictions never reach the instrument catalog or the server snapshot (they
 * are born and resolved daily), so the markets pane cannot list them and the
 * pair picker only finds them once you have typed a question. This pane is the
 * browse surface: the venue's own board, grouped event → market → outcome, with
 * every outcome a button that pins its identity and opens its chart.
 *
 * Pin BEFORE navigate, same rule as every other selection surface: the route
 * carries one uppercase string and nothing downstream can re-derive which venue
 * and which outcome it named.
 */
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Search, Vote } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import { EventDialog } from './event-dialog'
import { EventThumbnail, MarketRow } from './event-pieces'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'
import type { PredictionVenueResult } from '@/hooks/use-prediction-events'
import type { EventListSort } from '@/lib/predictions/board'
import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import {
  PaneColumnHeader,
  PaneErrorBanner,
} from '@/components/panes/pane-primitives'
import {
  categoriesOf,
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import { EVENT_LIST_SORTS, sortEventSummaries } from '@/lib/predictions/board'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { formatCompactUsd } from '@/lib/format-price'
import { formatTimeUntil } from '@/lib/format-time'

/**
 * Markets a card shows before it defers to the dialog.
 *
 * "Democratic Presidential Nominee 2028" carries thirty candidates, each its
 * own market with a Yes and a No. Rendered in full, one event was four
 * screens of buttons and the board below it may as well not have existed —
 * which is the whole point of a board. Four is enough to see what an event is
 * about and to trade the front-runner without opening anything.
 */
const MAX_MARKETS_PER_CARD = 4

/** Outcomes a card shows per market. Binary markets are unaffected. */
const MAX_OUTCOMES_PER_MARKET = 4

/**
 * Literal keys, not a template: the i18n audit can only verify a `t()` call
 * whose key is a literal.
 *
 * 'trending' is labelled "venue order" here rather than "trending", because
 * that is what it is — this pane lists one block per venue in the order the
 * venue returned, and calling that a ranking of our own would claim a judgement
 * nobody made.
 */
const SORT_LABEL_KEYS: Record<EventListSort, string> = {
  trending: 'events.sort.venueOrder',
  new: 'events.sort.new',
  endingSoon: 'events.sort.endingSoon',
  volume: 'events.sort.volume',
}

export function EventsPane() {
  const { t } = useTranslation()
  const select = usePredictionSelect()
  const venues = usePredictionVenues()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [venueFilter, setVenueFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<EventListSort>('trending')
  // The open event, captured with the venue it came from. Held by value
  // rather than by id: the payload behind it refetches on a 60s stale timer,
  // and an id would leave the dialog resolving against a list that had moved.
  const [openEvent, setOpenEvent] = useState<{
    venue: PredictionVenueResult
    event: PredictionEventSummary
  } | null>(null)
  // Every venue, every time: the chip is a VIEW, not a narrower fetch. See
  // `usePredictionEvents` — scoping the query by the chip gave each one its
  // own cache entry and refetched what the "all" entry already held.
  const { data, isLoading, error } = usePredictionEvents({
    venues,
    query: query.trim(),
    category,
  })

  // Categories come off the unfiltered result so the chip row does not shrink
  // as the user narrows by venue.
  const categories = useMemo(() => categoriesOf(data), [data])

  const handleOutcome = useCallback(
    (
      venue: PredictionVenueResult,
      event: PredictionEventSummary,
      market: PredictionMarketSummary,
      pairKey: string,
      label: string,
    ) => {
      setOpenEvent(null)
      // One selection path for the whole terminal: the event is the pair, so
      // this opens the question and arrives on the leg the user picked. The
      // venue travels in the address, which is what stops the route re-homing
      // the pair onto "the first venue that serves predictions".
      select.select({ venue: venue.market, event, market, pairKey, label })
    },
    [select],
  )

  const handleOpenEvent = useCallback(
    (venue: PredictionVenueResult, event: PredictionEventSummary) =>
      setOpenEvent({ venue, event }),
    [],
  )

  if (venues.length === 0) {
    return (
      <EmptyPane
        title={t('events.noVenuesTitle')}
        body={t('events.noVenuesBody')}
      />
    )
  }

  const all = data ?? []
  const visible = venueFilter
    ? all.filter((r) => r.market === venueFilter)
    : all
  // Sorted per venue block, not across them: the blocks are the pane's own
  // grouping and merging them to rank globally would lose which venue lists
  // what. 'trending' returns the venue's array untouched, so the memoized cards
  // keep their identity on every keystroke.
  const results =
    sort === 'trending'
      ? visible
      : visible.map((venue) => ({
          ...venue,
          events: sortEventSummaries(venue.events, sort),
        }))
  const hasRows = results.some((r) => r.events.length > 0)
  const allDesktopOnly =
    results.length > 0 && results.every((r) => r.desktopOnly)
  // Every venue already said something about itself — a refusal, or "needs the
  // desktop app". Stacking "No open events" under that reads as a third,
  // contradictory verdict.
  const allSpokenFor =
    results.length > 0 && results.every((r) => r.error || r.desktopOnly)

  return (
    <div className="flex h-full flex-col">
      {/* Controls only: the shell header already names the pane. */}
      <div className="flex shrink-0 flex-col gap-1.5 pb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-6 rounded-md pl-6 text-[11px]"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('events.searchPlaceholder')}
              value={query}
            />
          </div>
          <Select
            onValueChange={(value) => setSort(value as EventListSort)}
            value={sort}
          >
            <SelectTrigger
              className="h-6 w-[126px] shrink-0 rounded-md text-[11px]"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_LIST_SORTS.map((option) => (
                <SelectItem
                  className="text-[11.5px]"
                  key={option}
                  value={option}
                >
                  {t(SORT_LABEL_KEYS[option])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {venues.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <Chip
              active={venueFilter === null}
              label={t('markets.assetClass.all')}
              onClick={() => setVenueFilter(null)}
            />
            {venues.map((venue) => (
              <Chip
                active={venueFilter === venue.market}
                key={venue.market}
                label={venue.label}
                onClick={() => setVenueFilter(venue.market)}
              />
            ))}
          </div>
        )}

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Chip
              active={category === null}
              label={t('events.allCategories')}
              onClick={() => setCategory(null)}
            />
            {categories.map((id) => (
              <Chip
                active={category === id}
                key={id}
                label={id}
                onClick={() => setCategory(id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <Loader2 className="mb-3 size-6 animate-spin text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {t('events.loading')}
            </p>
          </div>
        ) : allDesktopOnly ? (
          <PaneDesktopOnly
            descriptionKey="events.desktopOnlyDescription"
            titleKey="events.desktopOnlyTitle"
          />
        ) : error ? (
          <EmptyPane title={t('events.failed')} body={t('events.tryLater')} />
        ) : (
          <div className="flex flex-col gap-3 py-1">
            {results.map((venue) => (
              <VenueBlock
                key={venue.market}
                onOpenEvent={handleOpenEvent}
                onOutcome={handleOutcome}
                showHeading={results.length > 1}
                venue={venue}
              />
            ))}
            {!hasRows && !allSpokenFor && (
              <EmptyPane
                body={query ? t('events.noMatchesBody') : t('events.emptyBody')}
                title={
                  query ? t('events.noMatchesTitle') : t('events.emptyTitle')
                }
              />
            )}
          </div>
        )}
      </div>

      <EventDialog
        event={openEvent?.event ?? null}
        onOpenChange={(next) => {
          if (!next) setOpenEvent(null)
        }}
        onSelect={(event, market, pairKey, label) => {
          if (openEvent) {
            handleOutcome(openEvent.venue, event, market, pairKey, label)
          }
        }}
        venueLabel={openEvent?.venue.label ?? ''}
      />
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      className="h-5 rounded-full px-2 text-[10.5px] capitalize"
      onClick={onClick}
      size="xs"
      variant={active ? 'default' : 'ghost'}
    >
      {label}
    </Button>
  )
}

function EmptyPane({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <Vote className="mb-3 size-8 text-muted-foreground/40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  )
}

type OutcomeHandler = (
  venue: PredictionVenueResult,
  event: PredictionEventSummary,
  market: PredictionMarketSummary,
  pairKey: string,
  label: string,
) => void

function VenueBlock({
  venue,
  showHeading,
  onOutcome,
  onOpenEvent,
}: {
  venue: PredictionVenueResult
  showHeading: boolean
  onOutcome: OutcomeHandler
  onOpenEvent: (
    venue: PredictionVenueResult,
    event: PredictionEventSummary,
  ) => void
}) {
  const { t } = useTranslation()

  if (venue.desktopOnly) {
    return (
      <p className="py-1 text-xs text-muted-foreground">
        {t('events.venueDesktopOnly', { venue: venue.label })}
      </p>
    )
  }

  if (venue.error) {
    return <PaneErrorBanner message={venue.error} venue={venue.label} />
  }

  if (venue.events.length === 0) return null

  return (
    <div className="flex flex-col">
      {showHeading && <PaneColumnHeader>{venue.label}</PaneColumnHeader>}
      {venue.events.map((event) => (
        <EventCard
          event={event}
          key={`${venue.market}:${event.id}`}
          onOpenEvent={onOpenEvent}
          onOutcome={onOutcome}
          venue={venue}
        />
      ))}
    </div>
  )
}

const EventCard = memo(function EventCard({
  venue,
  event,
  onOutcome,
  onOpenEvent,
}: {
  venue: PredictionVenueResult
  event: PredictionEventSummary
  onOutcome: OutcomeHandler
  onOpenEvent: (
    venue: PredictionVenueResult,
    event: PredictionEventSummary,
  ) => void
}) {
  const { t } = useTranslation()
  const endMs = event.endMs ?? event.markets[0]?.endMs
  const shownMarkets = event.markets.slice(0, MAX_MARKETS_PER_CARD)
  const hiddenMarkets = event.markets.length - shownMarkets.length
  const openEvent = () => onOpenEvent(venue, event)

  return (
    // A row in the venue's list, not a card: the column it sits in is already
    // one. What separates two events is the hairline and the artwork, so the
    // heaviest thing on the row is the question itself.
    <article className="border-b border-border/40 py-2.5 last:border-b-0 last:pb-0">
      <header className="flex items-start gap-2.5">
        {/* The heading opens the event rather than a chart. An event is not
            tradeable — its markets are — so the one thing a click on the title
            can mean is "show me this whole thing". The artwork is inside the
            button: it is the largest thing on the row and pointing at it and
            getting nothing is the worse surprise. */}
        <button
          className="group/evt flex min-w-0 flex-1 items-start gap-2.5 text-left"
          onClick={openEvent}
          type="button"
        >
          <EventThumbnail className="size-9" imageUrl={event.imageUrl} />
          <h3 className="min-w-0 text-sm font-medium leading-snug group-hover/evt:underline">
            {event.title}
          </h3>
        </button>
        <div className="shrink-0 text-right">
          {endMs !== undefined && (
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatTimeUntil(endMs)}
            </p>
          )}
          {event.volume !== undefined && event.volume > 0 && (
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {t('events.volume', { value: formatCompactUsd(event.volume) })}
            </p>
          )}
        </div>
      </header>

      <div className="mt-2 flex flex-col gap-1.5">
        {shownMarkets.map((market) => (
          <MarketRow
            eventTitle={event.title}
            key={market.id}
            market={market}
            marketCount={event.markets.length}
            maxOutcomes={MAX_OUTCOMES_PER_MARKET}
            onOverflow={openEvent}
            onSelect={(picked, label) => {
              const outcome = picked.outcomes.find((o) => o.label === label)
              if (outcome) {
                onOutcome(venue, event, picked, outcome.pairKey, label)
              }
            }}
          />
        ))}
      </div>

      {/* Never silent: a board that quietly showed four of sixty questions
          reads as an event with four questions. */}
      {hiddenMarkets > 0 && (
        <button
          className="mt-1.5 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          onClick={openEvent}
          type="button"
        >
          {t('events.moreMarkets', { count: hiddenMarkets })}
        </button>
      )}
    </article>
  )
})
