// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One event, as the phone draws it: the question, when it resolves, and a
 * price button per outcome.
 *
 * Shared by the Discover strip and the events screen so the two never drift.
 * The only difference between them is how much of a big event they show, which
 * is what `compact` decides: Discover previews the leading market, the screen
 * carries every market the event has, the way the desktop board does.
 *
 * The outcome IS the tap target, not the card. A prediction instrument is one
 * outcome of one market, so "open the event" has no meaning downstream — the
 * chart, the book and the ticket all quote a single side. Prices are venue
 * probabilities in 0..1 and are shown in cents through the same
 * `formatPredictionPrice` the chart axis and the ticket use, so 62¢ reads the
 * same everywhere.
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
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'
import { formatTimeUntil } from '@/lib/format-time'
import { marketSubtitle } from '@/lib/predictions/event-labels'

/** Markets drawn on a Discover card before the rest is left to the screen. */
const COMPACT_MARKETS = 1
/** Outcomes per market on a Discover card. Binary events fit exactly. */
const COMPACT_OUTCOMES = 2

export const PredictionEventCard = memo(function PredictionEventCard({
  row,
  compact = false,
  showVenue = false,
  onOutcome,
}: {
  row: PredictionEventRow
  /** Discover's preview shape: one market, two outcomes, no volume line. */
  compact?: boolean
  /** Name the venue on the card — only worth the line when two are listing. */
  showVenue?: boolean
  onOutcome: OpenPredictionOutcome
}) {
  const { t } = useTranslation()
  const { event } = row
  const endMs = eventEndMs(event)
  const markets = compact
    ? event.markets.slice(0, COMPACT_MARKETS)
    : event.markets

  return (
    <article className="border-t border-t-[color:var(--pl-hairline)] px-4 py-3">
      <header className="flex items-start justify-between gap-3">
        <h4 className="min-w-0 flex-1 text-[13.5px] font-semibold leading-[1.35] text-foreground">
          {event.title}
        </h4>
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
        {markets.map((market) => {
          // A single-market event repeats its own title as the question, and a
          // venue with no per-market question falls back to its condition id.
          const subtitle = marketSubtitle(
            market.title,
            event.title,
            event.markets.length,
          )
          const outcomes = compact
            ? market.outcomes.slice(0, COMPACT_OUTCOMES)
            : market.outcomes
          return (
            <div className="flex flex-col gap-1" key={market.id}>
              {subtitle ? (
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {outcomes.map((outcome) => (
                  <button
                    className={cn(
                      'pl-press pl-field flex min-w-[104px] flex-1 items-center justify-between gap-2',
                      'h-9 rounded-[11px] px-2.5 text-[12.5px] font-medium text-foreground',
                    )}
                    key={outcome.pairKey}
                    onClick={() =>
                      onOutcome(row.market, event, market, outcome)
                    }
                    type="button"
                    {...PRESS}
                  >
                    <span className="min-w-0 truncate">{outcome.label}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {outcome.price !== undefined
                        ? formatPredictionPrice(outcome.price)
                        : '·'}
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
