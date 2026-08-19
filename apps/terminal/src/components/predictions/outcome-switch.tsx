// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every answer the question has, and which one you are trading.
 *
 * A prediction pair is an event, so there is never one instrument on screen:
 * there is a question, and between two and a hundred and twenty-eight ways to
 * take a side on it. This is the control that says which one the book, the
 * tape and the ticket are pointed at, and it is deliberately present in more
 * than one place — the header, where you are reading the market, and the
 * ticket, where you are sizing a stake — because the answer you want is
 * usually not the one that was leading when the board opened.
 *
 * Switching is a SELECTION, not a navigation. `usePredictionSelect` keeps that
 * distinction: inside the event already on screen nothing unmounts and no
 * history entry is pushed, and from anywhere else the same call opens the
 * event on that leg.
 *
 * Two layouts, one behaviour:
 *
 *   row    a wrapping strip of chips, for the header. Reads as "here is the
 *          field", which is what a header should say before a price does.
 *   stack  one runner per line with its price on the right, for the narrow
 *          column the order ticket lives in.
 *
 * Either way the tail is one click away, never hidden: a field of 128 shows
 * its favourites inline and the rest behind "All N", in the same order.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'

import type { PredictionMarketSummary } from '@pairlens/shared/instrument-types'
import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import { formatPredictionPrice } from '@/lib/format-price'
import { normalizePairKey } from '@/lib/pairs'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { runnerColorIndex, runnerToken } from '@/lib/predictions/palette'
import {
  byProbability,
  runnerPrice,
  yesOutcomeOf,
} from '@/lib/predictions/race'

/** Answers shown inline before the rest move behind the popover. */
const INLINE_ROW = 6
const INLINE_STACK = 3

/** One tradeable answer, flattened for the control. */
type SwitchLeg = {
  pairKey: string
  label: string
  price: number | null
  market: PredictionMarketSummary
  /**
   * Every key this chip stands for.
   *
   * On a field the chip is a RUNNER, and a runner has two sides: taking No on
   * Fishback is still being on Fishback, so the chip has to read as selected.
   * Without this the ladder highlighted the row and the header highlighted
   * nothing, which reads as the two panes disagreeing about what you are
   * trading.
   */
  keys: Array<string>
}

export function OutcomeSwitch({
  market,
  pairKey,
  layout = 'stack',
  className,
}: {
  market: string
  /** The pane's pair: the event, or the leg it is already pointed at. */
  pairKey: string
  layout?: 'row' | 'stack'
  className?: string
}) {
  const { t } = useTranslation()
  const context = usePredictionEventContext(pairKey, market)
  const select = usePredictionSelect()

  const event = context.event
  // No event means no field to switch between: a venue the browser cannot
  // reach, or a lookup still in flight. The surfaces that own a fallback
  // (the ticket's Yes/No toggle) render it instead of a second empty control.
  if (!event) return null

  const legs = switchLegs(context)
  if (legs.length < 2) return null

  const active = normalizePairKey(
    context.selected?.pairKey ?? context.outcome?.pairKey ?? pairKey,
  )
  const isActive = (leg: SwitchLeg) =>
    leg.keys.some((key) => normalizePairKey(key) === active)
  const inline = layout === 'row' ? INLINE_ROW : INLINE_STACK

  const open = (leg: SwitchLeg) => {
    select.select({
      venue: context.venue,
      event,
      market: leg.market,
      pairKey: leg.pairKey,
      label: leg.label,
      // The row layout is the header's; the stack layout is the ticket's.
      surface: layout === 'row' ? 'header' : 'ticket',
    })
  }

  const rows = (subset: Array<SwitchLeg>) =>
    subset.map((leg) => (
      <LegButton
        active={isActive(leg)}
        colorIndex={runnerColorIndex(context.runners, leg.pairKey)}
        key={leg.pairKey}
        layout={layout}
        leg={leg}
        onSelect={open}
      />
    ))

  const overflow = legs.slice(inline)

  const all = overflow.length > 0 && (
    <Popover>
      <PopoverTrigger
        className={cn(
          'shrink-0 text-[10.5px] text-primary hover:underline',
          layout === 'row' && 'px-1',
        )}
        type="button"
      >
        {t('terminal.trade.allOutcomes', { total: legs.length })}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="px-3 pb-1 pt-2 text-[11px] font-medium">
          {t('terminal.trade.switchOutcome')}
        </div>
        <ScrollArea className="max-h-64">
          <div className="flex flex-col px-1.5 py-1">{rows(legs)}</div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )

  if (layout === 'row') {
    // One line that scrolls, never a wrapping block. The header is a fixed
    // slice of the board, and a field that wrapped to three rows pushed the
    // resolution date and the volume off the bottom of the pane.
    return (
      <div
        className={cn(
          'flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          className,
        )}
      >
        {rows(legs.slice(0, inline))}
        {all}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-lg bg-muted/40 px-2 py-1.5',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] text-muted-foreground">
          {t('terminal.trade.switchOutcome')}
        </span>
        {all}
      </div>
      {rows(legs.slice(0, inline))}
    </div>
  )
}

function LegButton({
  leg,
  active,
  colorIndex,
  layout,
  onSelect,
}: {
  leg: SwitchLeg
  active: boolean
  colorIndex: number
  layout: 'row' | 'stack'
  onSelect: (leg: SwitchLeg) => void
}) {
  const price = leg.price === null ? '—' : formatPredictionPrice(leg.price)

  if (layout === 'row') {
    return (
      <button
        aria-pressed={active}
        className={cn(
          'inline-flex h-5 max-w-[190px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
          // The fill is the state. A ring around every leg turned the header
          // into a row of boxes on a board that draws one card per column.
          active
            ? 'bg-primary/12 text-foreground'
            : 'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        onClick={() => onSelect(leg)}
        title={leg.market.title}
        type="button"
      >
        <span
          className="size-[7px] shrink-0 rounded-sm"
          style={{ background: runnerToken(colorIndex) }}
        />
        <span className="min-w-0 truncate">{leg.label}</span>
        <span className="shrink-0 font-mono tabular-nums">{price}</span>
      </button>
    )
  }

  return (
    <button
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-1 py-[3px] text-left text-[11.5px] transition-colors',
        active
          ? 'bg-accent/60 text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      onClick={() => onSelect(leg)}
      title={leg.market.title}
      type="button"
    >
      <span
        className="size-[7px] shrink-0 rounded-sm"
        style={{ background: runnerToken(colorIndex) }}
      />
      <span className="min-w-0 flex-1 truncate">{leg.label}</span>
      <span className="shrink-0 font-mono tabular-nums">{price}</span>
    </button>
  )
}

/**
 * The answers, in the order they should be read.
 *
 * A field is read from the top, so it is ranked by probability. A binary
 * question is not: Yes and No are one market seen from two sides, and
 * reordering them because the market crossed 50% would move the button under
 * the user's cursor. There the venue's own order wins, Yes first.
 */
function switchLegs(context: PredictionEventContext): Array<SwitchLeg> {
  const event = context.event
  if (!event) return []

  const only = event.markets.length === 1 ? event.markets[0] : null
  if (only && only.outcomes.length <= 2) {
    const yes = yesOutcomeOf(only)
    const ordered = yes
      ? [yes, ...only.outcomes.filter((o) => o.pairKey !== yes.pairKey)]
      : only.outcomes
    // A binary chip IS one side, so it stands for exactly its own key.
    return ordered.map((outcome) => ({
      pairKey: outcome.pairKey,
      label: outcome.label,
      price: outcome.price ?? outcome.ask ?? null,
      market: only,
      keys: [outcome.pairKey],
    }))
  }

  return byProbability(context.runners).map((runner) => ({
    pairKey: runner.yes.pairKey,
    label: runner.label,
    price: runnerPrice(runner),
    market: runner.market,
    keys: runner.no
      ? [runner.yes.pairKey, runner.no.pairKey]
      : [runner.yes.pairKey],
  }))
}
