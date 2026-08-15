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
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2, Search, Vote } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

import type { PredictionVenueResult } from '@/hooks/use-prediction-events'
import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import {
  categoriesOf,
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'
import {
  marketSubtitle,
  predictionOutcomeName,
} from '@/lib/predictions/event-labels'
import { formatTimeUntil } from '@/lib/format-time'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { registerPredictionOutcome } from '@/stores/prediction-directory-store'
import { chartLinkProps } from '@/lib/market-ref/link'

export function EventsPane() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const venues = usePredictionVenues()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [venueFilter, setVenueFilter] = useState<string | null>(null)
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

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
      registerPredictionOutcome(pairKey, {
        market: venue.market,
        predictionMarketId: market.id,
        outcome: label,
        // The same `<question> - <outcome>` join the connectors build `name`
        // from, so the picker's question/outcome split still works — but with
        // the venue's opaque market id resolved to something readable first.
        name: predictionOutcomeName(
          market.title,
          event.title,
          label,
          event.markets.length,
        ),
        eventTitle: event.title,
        eventId: event.id,
        ...(market.endMs !== undefined ? { endMs: market.endMs } : {}),
      })
      setAssetClassMap((prev) => ({ ...prev, [pairKey]: 'prediction' }))
      // The venue is in the address, so the card's own venue travels with the
      // link. This used to need a venue switch as a side effect because
      // the route could only re-home the pair onto "the first venue that
      // serves predictions", which is a coin flip with both venues installed.
      void navigate(
        chartLinkProps({
          cls: 'prediction',
          market: venue.market,
          id: pairKey,
        }),
      )
    },
    [navigate, setAssetClassMap],
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
  const results = venueFilter
    ? all.filter((r) => r.market === venueFilter)
    : all
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
      <header className="flex flex-col gap-2 border-b px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 rounded-lg pl-7 text-xs"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('events.searchPlaceholder')}
            value={query}
          />
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
      </header>

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
          <div className="flex flex-col gap-2 p-3">
            {results.map((venue) => (
              <VenueBlock
                key={venue.market}
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
      className="h-6 rounded-full px-2.5 text-[11px] capitalize"
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
}: {
  venue: PredictionVenueResult
  showHeading: boolean
  onOutcome: OutcomeHandler
}) {
  const { t } = useTranslation()

  if (venue.desktopOnly) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        {t('events.venueDesktopOnly', { venue: venue.label })}
      </div>
    )
  }

  if (venue.error) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {venue.label}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/90">
          {venue.error}
        </p>
      </div>
    )
  }

  if (venue.events.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {showHeading && (
        <p className="px-0.5 font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
          {venue.label}
        </p>
      )}
      {venue.events.map((event) => (
        <EventCard
          event={event}
          key={`${venue.market}:${event.id}`}
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
}: {
  venue: PredictionVenueResult
  event: PredictionEventSummary
  onOutcome: OutcomeHandler
}) {
  const { t } = useTranslation()
  const endMs = event.endMs ?? event.markets[0]?.endMs

  return (
    <article className="rounded-lg border p-3 transition-colors hover:border-primary/40">
      <header className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-sm font-medium leading-snug">
          {event.title}
        </h3>
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
        {event.markets.map((market) => {
          // A single-market event repeats its own title as the question;
          // showing it twice adds a line and no information. And a venue that
          // publishes no per-market question falls back to its condition id —
          // see `marketSubtitle` for what happens to that.
          const subtitle = marketSubtitle(
            market.title,
            event.title,
            event.markets.length,
          )
          return (
            <div key={market.id} className="flex flex-col gap-1">
              {subtitle && (
                <p className="text-xs leading-snug text-muted-foreground">
                  {subtitle}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {market.outcomes.map((outcome) => (
                  <button
                    className={cn(
                      'flex min-w-24 flex-1 items-center justify-between gap-2 rounded-md border px-2 py-1',
                      'text-xs transition-colors hover:border-primary/50 hover:bg-accent/40',
                    )}
                    key={outcome.pairKey}
                    onClick={() =>
                      onOutcome(
                        venue,
                        event,
                        market,
                        outcome.pairKey,
                        outcome.label,
                      )
                    }
                    type="button"
                  >
                    <span className="truncate">{outcome.label}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {outcome.price !== undefined
                        ? formatPredictionPrice(outcome.price)
                        : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
})
