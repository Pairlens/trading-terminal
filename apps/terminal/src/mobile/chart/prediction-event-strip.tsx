// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the chart is about, when the chart is an event contract.
 *
 * A prediction pair key is a venue ticker. `KXBTCD-26AUG15-T53` charts fine and
 * says nothing, and after navigation the phone's only other context was the
 * directory pin, which carries the question but not the siblings and not the
 * date the collateral comes back. So the bare chart gains one strip: the
 * question, when it resolves, and what the outcome is being paid — read from
 * `usePredictionEventContext`, which re-reads the whole event from
 * `market-data:events` on the venue that owns it.
 *
 * Three rules it lives by.
 *
 * **Nothing here ticks.** The price is the venue's board price on a 60s stale
 * window, the same number the Discover card and the event screen show, and
 * `context-bar.tsx` states the rule this obeys: chrome that is always on screen
 * may not subscribe to a stream. The live number is the hero readout 60px
 * above it, which is the one component allowed to.
 *
 * **It renders from whatever it has.** Six states come back and only one of
 * them is nothing: a pin with no event still prints the question and the date
 * (as a heading, because there is no event to open), a cold link with neither
 * prints nothing at all rather than restating the routing key. The preference
 * order lives in `lib/prediction-identity.ts`, shared with the Trade ticket so
 * the two cannot say different things about one contract.
 *
 * **It is bare-chart chrome.** Under a docked panel it is gone: the Trade
 * ticket carries the same question over its own fields, and the readout has
 * compacted into the band the strip would otherwise sit in.
 */
import { memo, useCallback } from 'react'
import { ChevronRight, ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { PRESS } from '../primitives/press'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { predictionIdentity } from '../lib/prediction-identity'
import { leadingRunner } from '../lib/outcome-ladder'
import type { PredictionIdentity } from '../lib/prediction-identity'
import type { PredictionOutcomeSummary } from '@pairlens/shared/instrument-types'
import { track } from '@/lib/analytics-events'
import { EventThumbnail } from '@/components/predictions/event-pieces'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { formatPredictionPrice } from '@/lib/format-price'
import { formatResolutionDate } from '@/lib/format-time'
import { binarySideOf } from '@/lib/predictions/event-labels'
import { runnerPrice } from '@/lib/predictions/race'

/**
 * Where the strip sits inside the chart band, in px from the chart top.
 *
 * It clears the hero price readout in its TALLEST form (8px inset + a 34px
 * price + 6px + a 20px change line = 68), so the offset is a constant rather
 * than a measurement. Measuring would be worse than the 20px of air a missing
 * change line costs: the readout's box changes on the first candle snapshot,
 * and a strip that jumps down a frame after the chart arrives reads as a bug.
 *
 * It also cannot displace the readout, which is why the strip goes UNDER it
 * rather than above: the readout cross-fades between two sizes on the sheet's
 * live position, and a box that moved it would jump mid-drag.
 */
const STRIP_TOP_PX = 76

/** Fixed, so a one-line question and a two-line one occupy the same box. */
const STRIP_HEIGHT_PX = 58

export default memo(function PredictionEventStrip() {
  const { focusedInstrument, focusedVenue } = useMobileFocus()
  const context = usePredictionEventContext(focusedInstrument, focusedVenue)
  const identity = predictionIdentity(context)
  if (!identity) return null
  return <Strip identity={identity} outcome={context.outcome} />
})

/** Kept so the race-only reading below still has a name for its own case. */

function Strip({
  identity,
  outcome,
}: {
  identity: PredictionIdentity
  outcome: PredictionOutcomeSummary | null
}) {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()
  const { event, venue, venueLabel, question, resolvesAt, runners, isRace } =
    identity

  const openEvent = useCallback(() => {
    if (!event) return
    track('mobile_prediction_surface_opened', {
      surface: 'event',
      source: 'chart_strip',
    })
    pushOverlay({ kind: 'predictionEvent', event, venue, venueLabel })
  }, [event, pushOverlay, venue, venueLabel])

  const openLadder = useCallback(() => {
    if (!event) return
    track('mobile_prediction_surface_opened', {
      surface: 'ladder',
      source: 'chart_strip',
    })
    pushOverlay({ kind: 'predictionLadder', event, venue, venueLabel })
  }, [event, pushOverlay, venue, venueLabel])

  // The date alone. The venue was on this line once and it truncated to
  // "Poly…" at 402px, for a name the venue chip 60px above it already spells
  // in full — the strip's one spare line is worth more as the resolution date.
  const meta =
    resolvesAt !== undefined
      ? t('mobile.predictions.resolvesShort', {
          date: formatResolutionDate(resolvesAt),
        })
      : ''

  const body = (
    <>
      <EventThumbnail className="size-8" imageUrl={event?.imageUrl} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="line-clamp-2 text-[12px] font-semibold leading-[1.25] text-foreground">
          {question}
        </span>
        {meta ? (
          <span className="truncate text-[10.5px] leading-none text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </span>
      <ProbabilityReading isRace={isRace} outcome={outcome} runners={runners} />
    </>
  )

  return (
    <div
      className="absolute inset-x-3 z-[25] flex gap-1.5"
      style={{ top: STRIP_TOP_PX, height: STRIP_HEIGHT_PX }}
    >
      {/* A heading when there is nowhere to go. The loading, not-found and
          desktop-only states all land here: the question is worth printing,
          and a control that opens an event the venue did not return would be
          a promise the strip cannot keep. */}
      {event ? (
        <button
          className="pl-glass pl-press flex min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left"
          onClick={openEvent}
          type="button"
          {...PRESS}
        >
          {body}
          <ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        </button>
      ) : (
        <div className="pl-glass flex min-w-0 flex-1 items-center gap-2.5 px-2.5">
          {body}
        </div>
      )}

      {/* The field, ranked. On EVERY prediction, not only a race: the pair is
          the question now, so "show me the other answers" is the same request
          whether there are two of them or a hundred, and on a binary the two
          rows are exactly the Yes and No a trader wants to price against each
          other. */}
      {event && runners.length > 0 ? (
        <button
          aria-label={t('mobile.predictions.rankOutcomes', {
            count: runners.length,
          })}
          className="pl-glass pl-press flex w-11 shrink-0 items-center justify-center text-foreground"
          onClick={openLadder}
          type="button"
          {...PRESS}
        >
          <ListOrdered aria-hidden className="size-[18px]" />
        </button>
      ) : null}
    </div>
  )
}

/**
 * The number the strip exists for.
 *
 * A binary outcome is its own probability and the side it takes. A race has no
 * single probability, so the honest reading is the leader — which is also what
 * makes the ladder button beside it obvious.
 */
function ProbabilityReading({
  outcome,
  runners,
  isRace,
}: {
  outcome: PredictionOutcomeSummary | null
  runners: PredictionIdentity['runners']
  isRace: boolean
}) {
  const { t } = useTranslation()

  // The SELECTED answer wins on every shape of market, race included. The
  // strip sits over a chart of that answer and beside a ticket that will size
  // it, so printing the leader's price there instead would name a third thing
  // neither of them is about. The leader is the fallback for the moment before
  // the field has resolved a selection.
  if (isRace && !outcome) {
    const leader = leadingRunner(runners)
    const price = leader ? runnerPrice(leader) : null
    return (
      <span className="flex shrink-0 flex-col items-end gap-[3px]">
        <span className="font-mono text-[15px] font-semibold leading-none tabular-nums text-foreground">
          {price === null ? '—' : formatPredictionPrice(price)}
        </span>
        {/* The leader's own name, not the word "leader": the question line
            above already framed the race, and a label spent on the word costs
            the 92px the name needs. The size of the field is on the ladder
            button's accessible name, where it belongs to the control it
            describes. */}
        <span className="max-w-[92px] truncate text-[10px] leading-none text-muted-foreground">
          {leader
            ? leader.label
            : t('mobile.predictions.runnerCount', { count: runners.length })}
        </span>
      </span>
    )
  }

  const price = outcome?.price ?? outcome?.ask ?? null
  const side = outcome ? binarySideOf(outcome.label) : null
  return (
    <span className="flex shrink-0 flex-col items-end gap-[3px]">
      <span
        className={cn(
          'font-mono text-[15px] font-semibold leading-none tabular-nums',
          side === 'yes' && 'text-up',
          side === 'no' && 'text-down',
          side === null && 'text-foreground',
        )}
      >
        {price === null ? '—' : formatPredictionPrice(price)}
      </span>
      {outcome ? (
        <span className="max-w-[92px] truncate text-[10px] leading-none text-muted-foreground">
          {outcome.label}
        </span>
      ) : null}
    </span>
  )
}
