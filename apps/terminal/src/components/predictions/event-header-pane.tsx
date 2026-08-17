// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The question, above the chart.
 *
 * A prediction contract's identity is a sentence, not a ticker, and the pair
 * route carries neither: it carries `KXBTCD-26AUG15-T53`. This pane is where
 * the sentence goes, along with the two facts that change what its price
 * MEANS — when it resolves, and what the venue says decides it.
 *
 * Two variants, chosen by the shape of the event rather than by the venue:
 *
 *   binary  one probability, big, with the day's move and the split between
 *           the two sides. 68¢ IS 68% — both readings are shown because a
 *           trader wants the price and a forecaster wants the probability.
 *   race    the field does not have "a" probability, so the headline number
 *           is the SUM of every Yes price. Over 100% is the vig; under 100%
 *           is a field the book has not finished quoting. Either way it is
 *           the number that decides whether sweeping the field is free money,
 *           and it is stated with the basis it was summed from.
 *
 * The live probability comes from the ticker stream already mounted for the
 * pair, in a leaf component, so the header's prose does not re-render on every
 * tick. Everything else comes from the events index.
 */
import { useTranslation } from 'react-i18next'
import { CircleHelp, FileText } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'

import type { EventOverround } from '@/lib/predictions/race'
import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { usePanePair } from '@/lib/layout/pane-context'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { useOptionalTickerData } from '@/lib/chart-terminal-context'
import { eventOverround } from '@/lib/predictions/race'
import { eventVolume } from '@/lib/predictions/board'
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'

export function EventHeaderPane() {
  const { t } = useTranslation()
  const pane = usePanePair()
  const context = usePredictionEventContext(
    pane?.pairKey ?? '',
    pane?.market ?? '',
  )

  if (!pane) {
    return (
      <PaneEmpty
        body={t('eventHeader.noPairBody')}
        icon={CircleHelp}
        title={t('eventHeader.noPairTitle')}
      />
    )
  }

  if (context.state === 'desktop-only') {
    return (
      <PaneDesktopOnly
        descriptionKey="events.desktopOnlyDescription"
        titleKey="events.desktopOnlyTitle"
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 border-r px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight tracking-tight">
            {context.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {context.event?.category && (
              <Badge
                className="h-[18px] px-2 text-[10.5px]"
                variant="secondary"
              >
                {context.event.category}
              </Badge>
            )}
            {context.entry?.outcome && (
              <Badge
                className="h-[18px] px-2 text-[10.5px]"
                variant="secondary"
              >
                {context.entry.outcome}
              </Badge>
            )}
            <RulesChip context={context} />
          </div>
        </div>

        <MetaRow context={context} />

        {context.state === 'error' && context.error && (
          <PaneErrorBanner message={context.error} venue={context.venueLabel} />
        )}
      </div>

      <div className="flex w-[248px] shrink-0 flex-col justify-center gap-2 px-4 py-2.5">
        {context.isRace ? (
          <RaceReading context={context} />
        ) : (
          <BinaryReading context={context} />
        )}
      </div>
    </div>
  )
}

// ── Left column ───────────────────────────────────────────────────────

function MetaRow({ context }: { context: PredictionEventContext }) {
  const { t } = useTranslation()
  const volume = context.event ? eventVolume(context.event) : null
  const endMs =
    context.market?.endMs ?? context.event?.endMs ?? context.entry?.endMs
  const status = context.market?.status

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap text-[11px] text-muted-foreground">
      {context.isRace && (
        <span>
          <span className="font-mono text-foreground">
            {context.runners.length}
          </span>{' '}
          {t('eventHeader.tradeableOutcomes')}
        </span>
      )}
      {volume !== null && (
        <span>
          {t('events.volumeLabel')}{' '}
          <span className="font-mono text-foreground">
            {formatCompactUsd(volume)}
          </span>
        </span>
      )}
      {endMs !== undefined && (
        <span>
          {t('eventHeader.resolves')}{' '}
          <span className="font-mono text-foreground">
            {formatResolution(endMs)}
          </span>
        </span>
      )}
      <span>
        {t('eventHeader.venue')}{' '}
        <span className="text-foreground">{context.venueLabel}</span>
      </span>
      {status && status !== 'open' && (
        <span className="text-[var(--chart-4)]">
          {status === 'resolved'
            ? t('eventHeader.statusResolved')
            : t('eventHeader.statusClosed')}
        </span>
      )}
    </div>
  )
}

/**
 * The resolution instant, in the reader's own locale and time zone.
 *
 * Not a countdown: a countdown answers "how long do I have" and the meta row
 * already carries that reading everywhere else. A header answers "when is this
 * decided", and the answer to that is a date a user can put in a calendar.
 */
function formatResolution(endMs: number): string {
  const date = new Date(endMs)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * The venue's own resolution criteria, behind a chip.
 *
 * Rendered only when the payload carries the text. Neither venue publishes a
 * rules URL, so there is nothing to link to, and a chip that opens an empty
 * popover is worse than no chip: it implies the terminal knows something it
 * does not.
 */
function RulesChip({ context }: { context: PredictionEventContext }) {
  const { t } = useTranslation()
  const rules = context.market?.rules?.trim()
  if (!rules) return null

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex h-[18px] items-center gap-1 rounded-md border px-2 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
        type="button"
      >
        <FileText className="size-3 opacity-70" />
        {t('eventHeader.rules')}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium">{t('eventHeader.rulesTitle')}</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            {t('eventHeader.rulesSource', { venue: context.venueLabel })}
          </p>
        </div>
        <ScrollArea className="max-h-64">
          <p className="whitespace-pre-line px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {rules}
          </p>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

// ── Right column ──────────────────────────────────────────────────────

/**
 * The active outcome's probability, live.
 *
 * Isolated because it is the only thing in this pane that moves on a tick.
 * `useOptionalTickerData` reads the provider the pair route already mounted —
 * a second subscription for a header would double the socket traffic for a
 * number the chart beside it is already streaming.
 */
function BinaryReading({ context }: { context: PredictionEventContext }) {
  const { t } = useTranslation()
  const ticker = useOptionalTickerData()
  const indexPrice = context.outcome?.price ?? context.outcome?.ask
  const live = ticker?.lastTradePrice ?? ticker?.midPrice ?? null
  const price = live ?? indexPrice ?? null
  const change = context.outcome?.change24h
  const label = context.entry?.outcome || context.outcome?.label || ''

  if (price === null) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {context.state === 'loading'
          ? t('eventHeader.loadingPrice')
          : t('eventHeader.noPrice')}
      </p>
    )
  }

  const percent = Math.round(price * 100)

  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-[32px] font-semibold leading-none tracking-tight text-up tabular-nums">
          {formatPredictionPrice(price)}
        </span>
        <div className="min-w-0">
          {label && <p className="truncate text-xs font-medium">{label}</p>}
          {change !== undefined && (
            <p
              className={cn(
                'font-mono text-[11px] tabular-nums',
                change > 0
                  ? 'text-up'
                  : change < 0
                    ? 'text-down'
                    : 'text-muted-foreground',
              )}
            >
              {t('eventHeader.changeToday', {
                value: `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}`,
              })}
            </p>
          )}
        </div>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full">
        <span className="bg-up" style={{ width: `${percent}%` }} />
        <span className="flex-1 bg-down/80" />
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{t('eventHeader.sideYes', { percent })}</span>
        <span>
          {t('eventHeader.sideNo', {
            percent: 100 - percent,
            price: formatPredictionPrice(1 - price),
          })}
        </span>
      </div>
    </>
  )
}

function RaceReading({ context }: { context: PredictionEventContext }) {
  const { t } = useTranslation()
  const overround = eventOverround(context.runners)

  if (!overround) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {context.state === 'loading'
          ? t('eventHeader.loadingPrice')
          : t('eventHeader.noOverround')}
      </p>
    )
  }

  const percent = overround.total * 100
  const edgePercent = Math.abs(overround.edge * 100)
  const over = overround.edge > 0
  // The bar shows a fair field as full, and the vig as the overspill past it.
  const fairWidth = Math.min(100, (1 / Math.max(overround.total, 1)) * 100)

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t('eventHeader.overroundLabel')}
        </span>
        <span
          className={cn(
            'font-mono text-[15px] font-semibold tabular-nums',
            over ? 'text-[var(--chart-4)]' : 'text-up',
          )}
        >
          {percent.toFixed(1)}%
        </span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 bg-up/55"
          style={{ width: `${fairWidth}%` }}
        />
        {over && (
          <span
            className="absolute inset-y-0 right-0 bg-[var(--chart-4)]"
            style={{ left: `${fairWidth}%` }}
          />
        )}
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        {over
          ? t('eventHeader.overroundOver', { percent: edgePercent.toFixed(1) })
          : t('eventHeader.overroundUnder', {
              percent: edgePercent.toFixed(1),
            })}
      </p>
      <BasisNote overround={overround} />
    </>
  )
}

/**
 * Which prices the sum was taken from, and how many runners it could not read.
 *
 * Both halves are load-bearing. A sum of last prices is what the market
 * believes; a sum of asks is what sweeping the field would cost, and only the
 * second one is an arbitrage claim. And a field summing under 100% because
 * four runners are unquoted is not free money — saying how many were missed is
 * the difference between a number and a trap.
 */
function BasisNote({ overround }: { overround: EventOverround }) {
  const { t } = useTranslation()
  return (
    <p className="font-mono text-[9.5px] uppercase tracking-[.1em] text-muted-foreground/80">
      {overround.basis === 'ask'
        ? t('eventHeader.basisAsk', { count: overround.counted })
        : t('eventHeader.basisLast', { count: overround.counted })}
      {overround.missing > 0 &&
        ` · ${t('eventHeader.basisMissing', { count: overround.missing })}`}
    </p>
  )
}
