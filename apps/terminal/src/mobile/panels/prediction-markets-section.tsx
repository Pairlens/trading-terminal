// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discover's prediction strip: a handful of live event contracts between the
 * featured pairs and the news feed.
 *
 * **The section gates itself, header included.** It renders exactly nothing
 * unless an ACTIVE plugin declares `market-data:events` for a venue of the
 * prediction class. That is a compliance boundary, not a nicety: a deployment
 * that drops the `predictions` family, or a user who disables both connectors
 * in the Plugin Store, must not be shown an event board or a heading promising
 * one. `usePredictionVenues` reads the plugin manager through
 * `pluginStateVersion`, so toggling a connector removes this strip live rather
 * than at the next reload.
 *
 * **A venue a browser cannot reach is not an error here.** Kalshi's API
 * refuses foreign origins, so on a phone it answers with a typed refusal and
 * no events. The desktop pane draws a banner per venue; a phone strip cannot
 * afford one, so the working venues are listed and the unreachable ones are
 * named once, in a single line, and only when they are the reason the strip is
 * otherwise empty.
 *
 * Same react-query entry as the events screen (`usePredictionEvents` keys on
 * the venue set, the query and the category), so opening "All events" from
 * here is a cache read, not a second fan-out.
 */
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useMobileActions } from '../mobile-focus-context'
import { useOpenPredictionOutcome } from '../lib/use-open-prediction-outcome'
import {
  desktopOnlyLabels,
  mergePredictionEvents,
  shouldNameVenues,
} from '../lib/prediction-preview'
import { PredictionEventCard } from './prediction-event-card'
import { SectionHeader } from './section-header'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'

/** Cards on the strip. Five is what the design gives the featured list too. */
const PREVIEW_COUNT = 5

/**
 * Events asked of each venue. Smaller than the screen's default: the strip
 * shows five and merging needs only a little headroom to interleave from, and
 * the two requests would otherwise be separate cache entries.
 */
const PREVIEW_FETCH = 12

export const PredictionMarketsSection = memo(
  function PredictionMarketsSection() {
    const { t } = useTranslation()
    const { pushOverlay } = useMobileActions()
    const venues = usePredictionVenues()
    const openOutcome = useOpenPredictionOutcome()

    const { data, isLoading } = usePredictionEvents({
      venues,
      query: '',
      category: null,
      limit: PREVIEW_FETCH,
    })

    const openEvents = useCallback(
      () => pushOverlay({ kind: 'events' }),
      [pushOverlay],
    )

    // Hooks first, gate second: the venue list is the compliance check and it
    // cannot short-circuit the query hook above it.
    if (venues.length === 0) return null

    const rows = mergePredictionEvents(data, PREVIEW_COUNT)
    const unreachable = desktopOnlyLabels(data)

    // Nothing to say and nothing to explain: no heading either. An empty
    // section reads as a broken one.
    if (rows.length === 0 && !isLoading && unreachable.length === 0) return null

    return (
      <>
        <SectionHeader
          action={rows.length > 0 ? t('mobile.discover.allEvents') : undefined}
          onAction={rows.length > 0 ? openEvents : undefined}
          title={t('mobile.discover.predictions')}
        />

        {rows.length > 0 ? (
          rows.map((row) => (
            <PredictionEventCard
              compact
              key={`${row.market}:${row.event.id}`}
              onOutcome={openOutcome}
              row={row}
              showVenue={shouldNameVenues(rows)}
            />
          ))
        ) : isLoading ? (
          [0, 1].map((row) => (
            <div
              className="h-[76px] border-t border-t-[color:var(--pl-hairline)]"
              key={row}
            />
          ))
        ) : (
          <p className="border-t border-t-[color:var(--pl-hairline)] px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            {t('events.venueDesktopOnly', { venue: unreachable.join(', ') })}
          </p>
        )}
      </>
    )
  },
)
