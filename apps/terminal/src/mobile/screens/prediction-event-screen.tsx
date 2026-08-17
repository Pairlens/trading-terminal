// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One event in full — the phone's answer to "what else is in this?".
 *
 * The desktop opens a dialog; a phone opens a screen, because a dialog on a
 * 402px display IS a screen with less of it usable and no back gesture. Both
 * read the event the surface behind them already fetched, so opening this
 * costs no request and cannot disagree with the card it came from.
 *
 * Every market, every outcome, uncapped: this is the surface the caps exist to
 * defer to, so capping it again would leave nowhere that answers the question.
 */
import { memo, useCallback, useMemo } from 'react'
import { ChevronRight, ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import { PRESS } from '../primitives/press'
import { useOpenPredictionOutcome } from '../lib/use-open-prediction-outcome'
import { eventEndMs } from '../lib/prediction-preview'
import { PredictionRules } from '../panels/prediction-rules'
import { useMobileActions } from '../mobile-focus-context'
import type { MobileOverlay } from '../mobile-focus-context'
import { EventThumbnail } from '@/components/predictions/event-pieces'
import { track } from '@/lib/analytics-events'
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'
import { formatTimeUntil } from '@/lib/format-time'
import { binarySideOf } from '@/lib/predictions/event-labels'
import { isRaceEvent, runnersOf } from '@/lib/predictions/race'

export default memo(function PredictionEventScreen({
  overlay,
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'predictionEvent' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const openOutcome = useOpenPredictionOutcome()
  const { pushOverlay } = useMobileActions()
  const { event, venue, venueLabel } = overlay
  const endMs = eventEndMs(event)
  // A field, not a pair of legs. `isRaceEvent` is structural (more than two
  // tradeable answers), so a scalar strike ladder and a field of candidates
  // both qualify — which is the point: both are unreadable market by market.
  const runners = useMemo(() => runnersOf(event), [event])
  const isRace = isRaceEvent(event)
  const openLadder = useCallback(() => {
    track('mobile_prediction_surface_opened', {
      surface: 'ladder',
      source: 'event_screen',
    })
    pushOverlay({ kind: 'predictionLadder', event, venue, venueLabel })
  }, [event, pushOverlay, venue, venueLabel])

  const stats: Array<{ label: string; value: string }> = []
  if (endMs !== undefined) {
    stats.push({ label: t('events.closes'), value: formatTimeUntil(endMs) })
  }
  if (event.volume !== undefined && event.volume > 0) {
    stats.push({
      label: t('events.volumeLabel'),
      value: formatCompactUsd(event.volume),
    })
  }
  stats.push({
    label: t('events.marketsLabel'),
    value: String(event.markets.length),
  })

  return (
    <FullScreenOverlay display onBack={onClose} title={venueLabel}>
      <header className="flex items-start gap-3 px-4 pb-3">
        <EventThumbnail className="size-12" imageUrl={event.imageUrl} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug text-foreground">
            {event.title}
          </h2>
          {event.category ? (
            <p className="mt-0.5 text-[11.5px] capitalize text-muted-foreground">
              {event.category}
            </p>
          ) : null}
        </div>
      </header>

      <dl className="flex gap-6 border-t border-t-[color:var(--pl-hairline)] px-4 py-3">
        {stats.map((stat) => (
          <div className="flex flex-col gap-0.5" key={stat.label}>
            <dt className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">
              {stat.label}
            </dt>
            <dd className="font-mono text-[12.5px] tabular-nums text-foreground">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* The other reading of the same event. Only on a race: a binary market
          has two answers and they are both on screen already. */}
      {isRace ? (
        <button
          className="pl-press-row flex w-full items-center gap-2.5 border-t border-t-[color:var(--pl-hairline)] px-4 py-3 text-left"
          onClick={openLadder}
          type="button"
          {...PRESS}
        >
          <ListOrdered
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">
            {t('mobile.predictions.rankOutcomes', { count: runners.length })}
          </span>
          <ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        </button>
      ) : null}

      {event.markets.map((market) => (
        <section
          className="border-t border-t-[color:var(--pl-hairline)] px-4 py-3"
          key={market.id}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-[13px] leading-snug text-foreground">
              {market.title}
            </h3>
            {market.volume !== undefined && market.volume > 0 ? (
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground/70">
                {formatCompactUsd(market.volume)}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {market.outcomes.map((outcome) => {
              const side = binarySideOf(outcome.label)
              return (
                <button
                  className={cn(
                    'pl-press pl-field flex min-w-[104px] flex-1 items-center justify-between gap-2',
                    'h-9 rounded-[11px] px-2.5 text-[12.5px] font-medium',
                    side === 'yes' && 'text-up',
                    side === 'no' && 'text-down',
                    side === null && 'text-foreground',
                  )}
                  key={outcome.pairKey}
                  onClick={() => openOutcome(venue, event, market, outcome)}
                  type="button"
                  {...PRESS}
                >
                  <span className="min-w-0 truncate">{outcome.label}</span>
                  <span
                    className={cn(
                      'shrink-0 font-mono tabular-nums',
                      side === null && 'text-muted-foreground',
                    )}
                  >
                    {outcome.price !== undefined
                      ? formatPredictionPrice(outcome.price)
                      : '·'}
                  </span>
                </button>
              )
            })}
          </div>
          {/* The criteria that settle this market, in the venue's own words.
              Per market rather than per event, because a race's markets each
              resolve on their own terms and one shared block would be a claim
              about markets it does not describe. */}
          <PredictionRules
            className="mt-1.5"
            rules={market.rules}
            venueLabel={venueLabel}
          />
        </section>
      ))}
    </FullScreenOverlay>
  )
})
