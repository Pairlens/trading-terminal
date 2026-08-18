// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Building the desk: one event id in, a whole board's worth of state out.
 *
 * Called once, by the prediction arm of the chart route, above every pane. The
 * pin paints first and the fetch corrects it, which is what keeps a shared
 * link from showing a routing key where the question goes for the half second
 * the venue takes to answer.
 */
import { useCallback, useEffect, useMemo } from 'react'

import type { PredictionDesk } from '@/lib/predictions/desk-context'

import {
  usePredictionEventById,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import {
  registerPredictionEvent,
  registerPredictionOutcome,
  usePredictionEventEntry,
  usePredictionOutcome,
} from '@/stores/prediction-directory-store'
import {
  predictionEntryFor,
  predictionEventEntryFor,
} from '@/lib/predictions/pin'
import { isRaceEvent, runnersOf } from '@/lib/predictions/race'
import { resolveSelection } from '@/lib/predictions/selection'

export function usePredictionDeskState({
  venue: venueId,
  eventKey,
  selectedKey,
  onSelect,
}: {
  venue: string
  eventKey: string
  /** The outcome key the URL is carrying, or '' for "pick the favourite". */
  selectedKey: string
  onSelect: (outcomeKey: string) => void
}): PredictionDesk {
  const venues = usePredictionVenues()
  const venue = venues.find((v) => v.market === venueId) ?? null
  const entry = usePredictionEventEntry(eventKey)
  // A key that names one LEG rather than the question: an older shared link, a
  // watchlist row starred from the phone, an alert's own address. Its pin
  // names the event it belongs to, so the desk resolves that event and treats
  // the key it arrived on as the leg to open. The route then rewrites the
  // address to the event's own, so the link heals rather than staying odd.
  const outcomePin = usePredictionOutcome(eventKey)

  const lookup = usePredictionEventById({
    venue,
    eventId: entry?.eventId ?? outcomePin?.eventId ?? eventKey,
    // A venue that is not installed is not a failed request; the pin still
    // names the event, and the route says what to do about the venue.
    enabled: venue !== null,
  })

  const event = lookup.event
  /** The leg the address itself named, when it named one. */
  const legKey = outcomePin ? eventKey : ''

  // Re-pin on every fresh answer: the title, the close time and above all the
  // favourite move, and a marquee chip reading last week's favourite is the
  // kind of wrong that looks like live data.
  useEffect(() => {
    if (!event) return
    // Keyed by the event's own id, never by the address this desk arrived on:
    // a leg-keyed link must not leave a pin claiming that leg IS the event.
    registerPredictionEvent(event.id, predictionEventEntryFor(venueId, event))
  }, [event, venueId])

  const runners = useMemo(() => (event ? runnersOf(event) : []), [event])

  const selected = useMemo(
    () => resolveSelection(runners, event, selectedKey || legKey),
    [runners, event, selectedKey, legKey],
  )

  // The leg travels alone into fills, positions and the risk guard, so it gets
  // its own pin the moment it becomes the one being traded.
  useEffect(() => {
    if (!event || !selected) return
    registerPredictionOutcome(
      selected.pairKey,
      predictionEntryFor(venueId, event, selected.market, selected.label),
    )
  }, [event, selected, venueId])

  const selectOutcome = useCallback(
    (outcomeKey: string) => onSelect(outcomeKey),
    [onSelect],
  )

  return useMemo(() => {
    const venueLabel = venue?.label ?? venueId.toUpperCase()
    const title = event?.title || entry?.title || eventKey
    const state = venue === null ? 'no-venue' : lookup.state

    return {
      state,
      venue: venueId,
      venueLabel,
      eventKey,
      entry,
      event,
      runners,
      isRace: event ? isRaceEvent(event) : (entry?.outcomeCount ?? 0) > 2,
      title,
      selected,
      selectOutcome,
      error: lookup.error,
    }
  }, [
    venue,
    venueId,
    event,
    entry,
    eventKey,
    lookup.state,
    lookup.error,
    runners,
    selected,
    selectOutcome,
  ])
}
