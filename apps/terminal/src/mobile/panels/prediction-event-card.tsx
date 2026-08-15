// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One event, as the phone draws it: artwork, the question, when it resolves,
 * and a price button per outcome.
 *
 * Shared by the Discover strip and the events screen so the two never drift.
 * The only difference between them is how much of a big event they show, which
 * is what `compact` decides: Discover previews the leading market, the screen
 * carries a handful, and the full event lives one tap away in its own screen.
 *
 * Both are BOUNDED. An event like "Democratic Presidential Nominee 2028"
 * carries thirty candidate markets with two sides each; drawn in full it is
 * sixty buttons on a 402px display and the rest of the board is unreachable
 * below it. The overflow is always counted rather than dropped silently.
 *
 * The outcome IS the tap target, not the card. A prediction instrument is one
 * outcome of one market, so "open the event" cannot mean a chart — it means the
 * event screen, which is what the heading does. Prices are venue probabilities
 * in 0..1 shown in cents through the same `formatPredictionPrice` the chart
 * axis and the ticket use, so 62¢ reads the same everywhere. Yes and No carry
 * the terminal's up/down colours, because taking Yes is the long side.
 *
 * Nothing here subscribes to a streaming context. The board is a browse
 * surface fetched on a 60s stale window; a per-row ticker subscription would
 * put thirty sockets' worth of ticks through the Discover sheet for numbers
 * the user is scanning, not trading.
 */
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { PRESS } from '../primitives/press'
import { eventEndMs } from '../lib/prediction-preview'
import type { PredictionEventRow } from '../lib/prediction-preview'
import type { OpenPredictionOutcome } from '../lib/use-open-prediction-outcome'
import type { PredictionMarketSummary } from '@pairlens/shared/instrument-types'
import { EventThumbnail } from '@/components/predictions/event-pieces'
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'
import { formatTimeUntil } from '@/lib/format-time'
import { binarySideOf, shortLabelOf } from '@/lib/predictions/event-labels'

/** Markets drawn on a Discover card before the rest is left to the screen. */
const COMPACT_MARKETS = 1
/** Outcomes per market on a Discover card. Binary events fit exactly. */
const COMPACT_OUTCOMES = 2
/** Markets a full card draws before deferring to the event screen. */
const FULL_MARKETS = 4
/** Outcomes per market on a full card. */
const FULL_OUTCOMES = 4

export const PredictionEventCard = memo(function PredictionEventCard({
  row,
  compact = false,
  showVenue = false,
  onOutcome,
  onOpenEvent,
}: {
  row: PredictionEventRow
  /** Discover's preview shape: one market, two outcomes, no volume line. */
  compact?: boolean
  /** Name the venue on the card — only worth the line when two are listing. */
  showVenue?: boolean
  onOutcome: OpenPredictionOutcome
  /** Opens the whole event. Omit on a surface that IS the whole event. */
  onOpenEvent?: (row: PredictionEventRow) => void
}) {
  const { t } = useTranslation()
  const { event } = row
  const endMs = eventEndMs(event)
  const maxMarkets = compact ? COMPACT_MARKETS : FULL_MARKETS
  const maxOutcomes = compact ? COMPACT_OUTCOMES : FULL_OUTCOMES
  const markets = event.markets.slice(0, maxMarkets)
  const hiddenMarkets = event.markets.length - markets.length
  const openEvent = onOpenEvent ? () => onOpenEvent(row) : undefined

  return (
    <article className="border-t border-t-[color:var(--pl-hairline)] px-4 py-3">
      <header className="flex items-start gap-2.5">
        {/* The heading is a button only where there is somewhere to go. On the
            event screen itself it is a heading, because tapping it would push
            a copy of the screen the user is already on. */}
        {openEvent ? (
          <button
            className="pl-press flex min-w-0 flex-1 items-start gap-2.5 text-left"
            onClick={openEvent}
            type="button"
            {...PRESS}
          >
            <EventThumbnail className="size-9" imageUrl={event.imageUrl} />
            <h4 className="min-w-0 text-[13.5px] font-semibold leading-[1.35] text-foreground">
              {event.title}
            </h4>
          </button>
        ) : (
          <>
            <EventThumbnail className="size-9" imageUrl={event.imageUrl} />
            <h4 className="min-w-0 flex-1 text-[13.5px] font-semibold leading-[1.35] text-foreground">
              {event.title}
            </h4>
          </>
        )}
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {endMs !== undefined ? (
            <span className="font-mono text-[10.5px] leading-none tabular-nums text-muted-foreground">
              {formatTimeUntil(endMs)}
            </span>
          ) : null}
          {!compact && event.volume !== undefined && event.volume > 0 ? (
            <span className="font-mono text-[10.5px] leading-none tabular-nums text-muted-foreground/70">
              {t('events.volume', { value: formatCompactUsd(event.volume) })}
            </span>
          ) : null}
          {showVenue ? (
            <span className="font-mono text-[10px] uppercase leading-none tracking-[.12em] text-muted-foreground/70">
              {row.label}
            </span>
          ) : null}
        </span>
      </header>

      <div className="mt-2 flex flex-col gap-1.5">
        {markets.map((market) => (
          <MarketBlock
            event={event}
            key={market.id}
            market={market}
            maxOutcomes={maxOutcomes}
            onOutcome={onOutcome}
            onOverflow={openEvent}
            venue={row.market}
          />
        ))}
      </div>

      {hiddenMarkets > 0 ? (
        <button
          className="pl-field pl-press mt-2 flex h-8 w-full items-center justify-center rounded-[11px] text-[12px] font-medium text-muted-foreground"
          onClick={openEvent}
          type="button"
          {...PRESS}
        >
          {t('events.moreMarkets', { count: hiddenMarkets })}
        </button>
      ) : null}
    </article>
  )
})

function MarketBlock({
  event,
  market,
  maxOutcomes,
  venue,
  onOutcome,
  onOverflow,
}: {
  event: PredictionEventRow['event']
  market: PredictionMarketSummary
  maxOutcomes: number
  venue: string
  onOutcome: OpenPredictionOutcome
  onOverflow?: () => void
}) {
  const { t } = useTranslation()
  // The venue's own short label first ("Gavin Newsom"); the question is a
  // sentence and this row is one line on a phone.
  const label = shortLabelOf(market, event.title, event.markets.length)
  const outcomes = market.outcomes.slice(0, maxOutcomes)
  const hidden = market.outcomes.length - outcomes.length

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <p className="truncate text-[11.5px] leading-snug text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {outcomes.map((outcome) => {
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
              onClick={() => onOutcome(venue, event, market, outcome)}
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
        {hidden > 0 ? (
          <button
            className="pl-press flex h-9 items-center rounded-[11px] border border-dashed border-[color:var(--pl-hairline)] px-2.5 text-[12px] text-muted-foreground"
            onClick={onOverflow}
            type="button"
            {...PRESS}
          >
            {t('events.moreOutcomes', { count: hidden })}
          </button>
        ) : null}
      </div>
    </div>
  )
}
