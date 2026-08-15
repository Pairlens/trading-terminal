// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The whole event, in one place.
 *
 * The browser card is a shortlist by design — a Polymarket event can carry
 * sixty markets and the board has to stay scannable — so something has to own
 * the complete picture. Before this the only way into an event was to pick one
 * outcome and open its chart, which answered "how is Newsom priced" and never
 * "what is this event, and what else is in it".
 *
 * It is a reader, not a second browser: everything here is already in the
 * `market-data:events` payload the pane fetched, so opening it costs no
 * request and cannot disagree with the card behind it. Picking an outcome does
 * exactly what picking one on the card does — pin, then navigate — and closes.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { EventThumbnail, MarketRow } from './event-pieces'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

import { formatCompactUsd } from '@/lib/format-price'
import { formatTimeUntil } from '@/lib/format-time'

export type EventDialogProps = {
  event: PredictionEventSummary | null
  /** Venue display name, for the header badge. */
  venueLabel: string
  onOpenChange: (open: boolean) => void
  onSelect: (
    event: PredictionEventSummary,
    market: PredictionMarketSummary,
    pairKey: string,
    label: string,
  ) => void
}

export function EventDialog({
  event,
  venueLabel,
  onOpenChange,
  onSelect,
}: EventDialogProps) {
  const { t } = useTranslation()
  if (!event) return null

  const endMs = event.endMs ?? event.markets[0]?.endMs
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
  if (event.liquidity !== undefined && event.liquidity > 0) {
    stats.push({
      label: t('events.liquidityLabel'),
      value: formatCompactUsd(event.liquidity),
    })
  }
  stats.push({
    label: t('events.marketsLabel'),
    value: String(event.markets.length),
  })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* Capped height with the market list as the only scroller: an event
          with sixty questions must not push the header off the screen. */}
      <DialogContent className="flex max-h-[min(42rem,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-2 border-b p-4 text-left">
          <div className="flex items-start gap-3">
            <EventThumbnail className="size-12" imageUrl={event.imageUrl} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base leading-snug">
                {event.title}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
                  {venueLabel}
                </span>
                {event.category && (
                  <span className="capitalize">{event.category}</span>
                )}
              </DialogDescription>
            </div>
          </div>

          <dl className="flex flex-wrap gap-x-5 gap-y-1">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="font-mono text-xs tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {event.markets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('events.noMarketsBody')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {event.markets.map((market, index) => (
                <div
                  className={cn(
                    'flex flex-col gap-1.5',
                    index > 0 && 'border-t pt-3',
                  )}
                  key={market.id}
                >
                  {/* The dialog is the surface with room for the question in
                      full, so it always shows it — the short label alone is
                      what the bounded card falls back to. */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm leading-snug">
                      {market.title}
                    </p>
                    {market.volume !== undefined && market.volume > 0 && (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {formatCompactUsd(market.volume)}
                      </span>
                    )}
                  </div>
                  <MarketRow
                    eventTitle={event.title}
                    label={null}
                    market={market}
                    marketCount={event.markets.length}
                    onSelect={(picked, label) => {
                      const outcome = picked.outcomes.find(
                        (o) => o.label === label,
                      )
                      if (outcome) {
                        onSelect(event, picked, outcome.pairKey, label)
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
