// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Switching runners without leaving the ticket.
 *
 * A binary question has one other side, and the ticket's Yes/No toggle covers
 * it. A race has a hundred and twenty-eight, and until now the only way to
 * stake a different one was to leave the pane, find the ladder, and come back
 * — which is a lot of steps for the most common thing a trader does on a field
 * market: price one runner, decide it is expensive, and buy the next one.
 *
 * Three rows, then the rest behind "All N". The three are the favourites,
 * because a field is read from the top and the tail is a hundred runners under
 * 4¢. The popover is where the tail lives, scrollable, in the same order.
 *
 * Selecting is `usePredictionSelect`, never a bare navigate: the destination
 * resolves its question out of the directory pin, so pinning has to happen
 * first or the new route paints its routing key where the question goes.
 *
 * Renders nothing at all unless the active event really is a race. A
 * two-outcome market gets the ticket's own toggle and would read this as a
 * second, contradictory control.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'

import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import type { PredictionRunner } from '@/lib/predictions/race'
import { formatPredictionPrice } from '@/lib/format-price'
import { normalizePairKey } from '@/lib/pairs'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { runnerColorIndex, runnerToken } from '@/lib/predictions/palette'
import { byProbability, runnerPrice } from '@/lib/predictions/race'

/** Runners shown inline. The rest are one click away, never hidden. */
const INLINE_ROWS = 3

export function RaceOutcomeSwitch({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const context = usePredictionEventContext(pairKey, market)
  const select = usePredictionSelect()

  // `event` is what a selection pins; without it a row could navigate to a
  // key nothing downstream can name.
  if (!context.isRace || context.event === null) return null

  const ranked = byProbability(context.runners)
  if (ranked.length === 0) return null

  const active = normalizePairKey(pairKey)
  const open = (runner: PredictionRunner) => {
    select.open({
      venue: context.venue,
      event: context.event!,
      market: runner.market,
      pairKey: runner.yes.pairKey,
      label: runner.yes.label,
    })
  }

  return (
    <div className="flex flex-col gap-0.5 rounded-xl border px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] text-muted-foreground">
          {t('terminal.trade.switchOutcome')}
        </span>
        <Popover>
          <PopoverTrigger
            className="shrink-0 text-[10.5px] text-primary hover:underline"
            type="button"
          >
            {t('terminal.trade.allOutcomes', { total: ranked.length })}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <div className="border-b px-3 py-2 text-[11px] font-medium">
              {t('terminal.trade.switchOutcome')}
            </div>
            <ScrollArea className="max-h-64">
              <div className="px-1.5 py-1">
                {ranked.map((runner) => (
                  <RunnerRow
                    active={normalizePairKey(runner.yes.pairKey) === active}
                    context={context}
                    key={runner.yes.pairKey}
                    onSelect={open}
                    runner={runner}
                  />
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {ranked.slice(0, INLINE_ROWS).map((runner) => (
        <RunnerRow
          active={normalizePairKey(runner.yes.pairKey) === active}
          context={context}
          key={runner.yes.pairKey}
          onSelect={open}
          runner={runner}
        />
      ))}
    </div>
  )
}

function RunnerRow({
  runner,
  context,
  active,
  onSelect,
}: {
  runner: PredictionRunner
  context: PredictionEventContext
  active: boolean
  onSelect: (runner: PredictionRunner) => void
}) {
  const price = runnerPrice(runner)
  const colorIndex = runnerColorIndex(context.runners, runner.yes.pairKey)

  return (
    <button
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-1 py-[3px] text-left text-[11.5px] transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      onClick={() => onSelect(runner)}
      title={runner.market.title}
      type="button"
    >
      <span
        className="size-[7px] shrink-0 rounded-sm"
        style={{ background: runnerToken(colorIndex) }}
      />
      <span className="min-w-0 flex-1 truncate">{runner.label}</span>
      <span className="shrink-0 font-mono tabular-nums">
        {price === null ? '—' : formatPredictionPrice(price)}
      </span>
    </button>
  )
}
