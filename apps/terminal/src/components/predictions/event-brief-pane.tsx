// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What this contract actually pays on, in the venue's own words.
 *
 * The single biggest gap in the prediction desk: a trader could open a market,
 * read a probability, size a stake and submit an order without ever seeing the
 * sentence that decides whether they win. The rules lived behind a chip in the
 * event header, one hover deep, capped at a popover — which is exactly where
 * you put something optional, and resolution criteria are not optional. "BTC
 * above $120,000 on August 15" is four different bets depending on whose print
 * at whose cutoff settles it, and the difference is worth more than any edge
 * on the chart.
 *
 * So the criteria get a pane. Open by default, scrollable, attributed to the
 * venue that published them, with the facts that change what the prose MEANS
 * above it: when it settles, whether it is still open, and what has traded
 * through it.
 *
 * On a race the criteria are per market, not per event — a strike ladder
 * publishes one rule per strike and a candidate field one per candidate — so
 * the pane carries a picker rather than silently showing the route's market
 * and calling it the event's. The picker defaults to the market you are on.
 *
 * Everything here is prose the venue wrote. It is rendered verbatim, never
 * summarised: a paraphrase of a settlement rule is a new rule.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollText } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import type { PredictionMarketSummary } from '@pairlens/shared/instrument-types'
import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import { EventThumbnail } from '@/components/predictions/event-pieces'
import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { usePanePair } from '@/lib/layout/pane-context'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import {
  eventLiquidity,
  eventOpenInterest,
  eventVolume,
} from '@/lib/predictions/board'
import { formatCompactUsd } from '@/lib/format-price'
import { formatResolutionDate, formatTimeUntil } from '@/lib/format-time'

export function EventBriefPane() {
  const { t } = useTranslation()
  const pane = usePanePair()
  const context = usePredictionEventContext(
    pane?.pairKey ?? '',
    pane?.market ?? '',
  )

  if (!pane) {
    return (
      <PaneEmpty
        body={t('eventBrief.noPairBody')}
        icon={ScrollText}
        title={t('eventBrief.noPairTitle')}
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

  return <Brief context={context} />
}

function Brief({ context }: { context: PredictionEventContext }) {
  const { t } = useTranslation()

  /**
   * Markets worth offering in the picker: the ones that actually published
   * prose. A ladder where only three strikes carry rules should offer three
   * entries, not thirty that mostly open an empty panel.
   */
  const documented = useMemo(
    () => (context.event?.markets ?? []).filter((m) => m.rules?.trim()),
    [context.event],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Follow the route: switching outcomes has to move the criteria with it, or
  // the pane quietly describes the contract you were looking at a minute ago.
  useEffect(() => {
    setSelectedId(context.market?.id ?? null)
  }, [context.market?.id])

  const selected =
    documented.find((m) => m.id === selectedId) ??
    (context.market?.rules?.trim() ? context.market : documented[0]) ??
    null

  const rules = selected?.rules?.trim()
  const endMs =
    selected?.endMs ??
    context.market?.endMs ??
    context.event?.endMs ??
    context.entry?.endMs

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2.5 border-b px-3 py-2.5">
        <EventThumbnail
          className="size-9"
          imageUrl={context.event?.imageUrl ?? selected?.imageUrl}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold leading-snug">
            {context.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {context.event?.category && (
              <Badge
                className="h-[17px] px-1.5 text-[10px]"
                variant="secondary"
              >
                {context.event.category}
              </Badge>
            )}
            <span className="text-[10.5px] text-muted-foreground">
              {t('eventBrief.publishedBy', { venue: context.venueLabel })}
            </span>
          </div>
        </div>
      </div>

      <Facts context={context} endMs={endMs} />

      {context.state === 'error' && context.error && (
        <div className="px-3 pt-2">
          <PaneErrorBanner message={context.error} venue={context.venueLabel} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[.1em] text-muted-foreground">
          {t('eventBrief.criteria')}
        </p>
        {documented.length > 1 && (
          <Select
            onValueChange={setSelectedId}
            value={selected?.id ?? undefined}
          >
            <SelectTrigger className="h-6 max-w-[190px] text-[11px]" size="sm">
              {/* The value is a venue condition id — sixty-six hex characters
                  on Polymarket — so the trigger has to render the market's
                  label rather than what it is keyed on. */}
              <SelectValue>
                {(value) =>
                  marketLabel(
                    documented.find((m) => m.id === value) ?? selected,
                  )
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {documented.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {marketLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 pb-3">
          {rules ? (
            <>
              {/* The market's own question, when the event heading is not it.
                  On a ladder the event says "Where does CPI land" and the
                  contract says "above 3.2%", and the criteria below settle the
                  second one. */}
              {selected && selected.title !== context.title && (
                <p className="mb-1.5 text-[11.5px] font-medium leading-snug">
                  {selected.title}
                </p>
              )}
              <p className="whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">
                {rules}
              </p>
            </>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {context.state === 'loading'
                ? t('eventBrief.loading')
                : t('eventBrief.noCriteria', { venue: context.venueLabel })}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * What to call a market inside its event: the venue's short label first.
 *
 * `shortTitle` is the one field that separates two runners without repeating
 * the question ('Marine Le Pen', 'Above 3.2%'), so it is what a picker of
 * sixty runners has to be keyed on visually. The question is the fallback, and
 * the id is never shown — on Polymarket it is a 66-character hash.
 */
function marketLabel(market: PredictionMarketSummary | null): string {
  if (!market) return ''
  return market.shortTitle?.trim() || market.title
}

/**
 * The facts that change what the criteria mean.
 *
 * Resolution date and countdown together, because a trader weighs both and
 * they answer different questions: the date is what you put in a calendar, the
 * countdown is how long the stake is tied up. Status only when it is not open —
 * a "closed" badge over a live book would be worse than none.
 */
function Facts({
  context,
  endMs,
}: {
  context: PredictionEventContext
  endMs: number | undefined
}) {
  const { t } = useTranslation()
  const volume = context.event ? eventVolume(context.event) : null
  const liquidity = context.event ? eventLiquidity(context.event) : null
  const openInterest = context.event ? eventOpenInterest(context.event) : null
  const status = context.market?.status

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-[11px] @sm/pane:grid-cols-3">
      {endMs !== undefined && (
        <Fact
          label={t('eventBrief.resolves')}
          sub={formatTimeUntil(endMs)}
          value={formatResolutionDate(endMs)}
        />
      )}
      {volume !== null && (
        <Fact
          label={t('events.volumeLabel')}
          value={formatCompactUsd(volume)}
        />
      )}
      {liquidity !== null && (
        <Fact
          label={t('eventBrief.liquidity')}
          value={formatCompactUsd(liquidity)}
        />
      )}
      {openInterest !== null && (
        <Fact
          label={t('eventBrief.openInterest')}
          value={formatCompactUsd(openInterest)}
        />
      )}
      {status && status !== 'open' && (
        <Fact
          label={t('eventBrief.status')}
          value={
            status === 'resolved'
              ? t('eventHeader.statusResolved')
              : t('eventHeader.statusClosed')
          }
          valueClass="text-[var(--chart-4)]"
        />
      )}
    </div>
  )
}

function Fact({
  label,
  sub,
  value,
  valueClass,
}: {
  label: string
  sub?: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9.5px] uppercase tracking-[.08em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('truncate font-mono tabular-nums', valueClass)}>
        {value}
        {sub && (
          <span className="ml-1 font-sans text-[10px] text-muted-foreground">
            {sub}
          </span>
        )}
      </p>
    </div>
  )
}
