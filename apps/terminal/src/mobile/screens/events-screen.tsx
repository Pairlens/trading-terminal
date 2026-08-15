// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discover → "All events": every open event contract, as a screen.
 *
 * The desktop `EventsPane`'s data, not its layout — the same
 * `usePredictionEvents` fan-out, the same 60s stale window, so arriving here
 * from the Discover strip is a cache read for as long as the query is empty.
 * Typing changes the key and asks the venues themselves, because a board is
 * thirty events deep and the question the user is looking for is usually not
 * one of them.
 *
 * Gated exactly like the strip: no active plugin serving `market-data:events`,
 * no screen — it renders nothing at all, so the panel underneath simply comes
 * back. The overlay cannot normally be reached in that state (the strip that
 * pushes it is gone too), but an entry already on the overlay stack must not
 * outlive the connectors being disabled underneath it, and a board with a
 * search field and no venue behind it is worse than no board.
 *
 * The venue chips are a VIEW over one result set, never a narrower fetch — see
 * `usePredictionEvents`, which keys on the whole venue set for that reason.
 * There is no category row: it is a second wrapping chip line on a 402px
 * display, and search already answers "show me the Fed ones".
 *
 * Not virtualized, deliberately. A venue returns 30 events per browse and the
 * cards are variable-height (one to twenty markets each), which is the shape a
 * virtualizer is worst at; the desktop pane renders the same rows unwindowed.
 */
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Search, Vote, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import { PRESS } from '../primitives/press'
import { PredictionEventCard } from '../panels/prediction-event-card'
import { useOpenPredictionOutcome } from '../lib/use-open-prediction-outcome'
import {
  desktopOnlyLabels,
  mergePredictionEvents,
  shouldNameVenues,
} from '../lib/prediction-preview'
import { useMobileActions } from '../mobile-focus-context'
import type { MobileOverlay } from '../mobile-focus-context'
import type { PredictionEventRow } from '../lib/prediction-preview'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'

export default memo(function EventsScreen({
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'events' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const venues = usePredictionVenues()
  const openOutcome = useOpenPredictionOutcome()
  const { pushOverlay } = useMobileActions()
  const openEvent = useCallback(
    (row: PredictionEventRow) =>
      pushOverlay({
        kind: 'predictionEvent',
        event: row.event,
        venue: row.market,
        venueLabel: row.label,
      }),
    [pushOverlay],
  )

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const [venueFilter, setVenueFilter] = useState<string | null>(null)

  const { data, isLoading, error } = usePredictionEvents({
    venues,
    query: deferredQuery,
    category: null,
  })

  const visible = useMemo(
    () =>
      venueFilter ? (data ?? []).filter((v) => v.market === venueFilter) : data,
    [data, venueFilter],
  )

  const rows = useMemo(() => mergePredictionEvents(visible), [visible])
  const unreachable = desktopOnlyLabels(visible)

  // Hooks first, gate second — see the header note.
  if (venues.length === 0) return null

  return (
    <FullScreenOverlay display onBack={onClose} title={t('panes.events')}>
      <div className="px-4 pb-2.5">
        <div className="pl-field flex h-[38px] items-center gap-2 rounded-[11px] px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            aria-label={t('events.searchPlaceholder')}
            autoComplete="off"
            autoCorrect="off"
            // 16px so iOS Safari does not auto-zoom the page on focus.
            className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('events.searchPlaceholder')}
            spellCheck={false}
            value={query}
          />
          {query ? (
            <button
              aria-label={t('common.clear')}
              className="pl-hit-44 pl-press-soft flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--pl-wash-heavy)] text-muted-foreground"
              onClick={() => setQuery('')}
              type="button"
              {...PRESS}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        {venues.length > 1 ? (
          <div className="mt-2.5 flex gap-1.5">
            <VenueChip
              active={venueFilter === null}
              label={t('markets.assetClass.all')}
              onSelect={() => setVenueFilter(null)}
            />
            {venues.map((venue) => (
              <VenueChip
                active={venueFilter === venue.market}
                key={venue.market}
                label={venue.label}
                onSelect={() => setVenueFilter(venue.market)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <EventsSkeleton />
      ) : error ? (
        <EventsNotice body={t('events.tryLater')} title={t('events.failed')} />
      ) : rows.length > 0 ? (
        <>
          {rows.map((row) => (
            <PredictionEventCard
              key={`${row.market}:${row.event.id}`}
              onOpenEvent={openEvent}
              onOutcome={openOutcome}
              row={row}
              showVenue={shouldNameVenues(rows)}
            />
          ))}
          {unreachable.length > 0 ? (
            <p className="border-t border-t-[color:var(--pl-hairline)] px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
              {t('events.venueDesktopOnly', { venue: unreachable.join(', ') })}
            </p>
          ) : null}
        </>
      ) : unreachable.length > 0 ? (
        // Every venue in view already said something about itself. Stacking
        // "No open events" under that reads as a second, contradictory verdict.
        <EventsNotice
          body={t('events.venueDesktopOnly', {
            venue: unreachable.join(', '),
          })}
          title={t('events.desktopOnlyTitle')}
        />
      ) : (
        <EventsNotice
          body={
            deferredQuery ? t('events.noMatchesBody') : t('events.emptyBody')
          }
          title={
            deferredQuery ? t('events.noMatchesTitle') : t('events.emptyTitle')
          }
        />
      )}
    </FullScreenOverlay>
  )
})

function VenueChip({
  active,
  label,
  onSelect,
}: {
  active: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <button
      className={cn(
        'pl-press flex h-7 items-center rounded-full px-3 text-[12.5px] font-medium',
        active
          ? 'bg-foreground text-background'
          : 'pl-field text-muted-foreground',
      )}
      onClick={onSelect}
      type="button"
      {...PRESS}
    >
      {label}
    </button>
  )
}

function EventsNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-8 pt-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[color:var(--pl-wash)]">
        <Vote className="size-6 text-muted-foreground" />
      </span>
      <p className="mt-3.5 text-[15px] font-semibold text-foreground">
        {title}
      </p>
      <p className="mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  )
}

function EventsSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          className="h-[92px] border-t border-t-[color:var(--pl-hairline)]"
          key={row}
        />
      ))}
    </div>
  )
}
