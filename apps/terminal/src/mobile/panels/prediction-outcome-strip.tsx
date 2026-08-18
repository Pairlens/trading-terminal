// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which answer this ticket is sizing, and every other one, in a single row.
 *
 * A prediction pair is a question, and a question has between two and a
 * hundred and twenty-eight answers. The ticket can only ever size one of them,
 * so the strip's whole job is to say WHICH, and to make swapping it a tap
 * rather than a trip back to the chart.
 *
 * One line that scrolls, never a wrapping block: the ticket is a stack of
 * fixed-height rows and a field that grew to three lines would push the price
 * field under the keyboard. The favourites lead, and the tail lives behind the
 * ladder screen, which is the same surface the chart's own strip opens.
 *
 * Renders nothing until the venue has returned the field. There is no useful
 * half-state: with no runners there is nothing to switch between, and the
 * question card above already names the leg the ticket is on.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ListOrdered } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { PRESS } from '../primitives/press'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useOpenPredictionOutcome } from '../lib/use-open-prediction-outcome'
import { rankRunners } from '../lib/outcome-ladder'
import type { PredictionRunner } from '@/lib/predictions/race'
import { track } from '@/lib/analytics-events'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { formatPredictionPrice } from '@/lib/format-price'
import { normalizePairKey } from '@/lib/pairs'
import { runnerColorIndex, runnerToken } from '@/lib/predictions/palette'
import { runnerPrice } from '@/lib/predictions/race'

/** Answers inline before the ladder takes over. Enough to fill 402px twice. */
const INLINE = 8

export function PredictionOutcomeStrip() {
  const { t } = useTranslation()
  const { focusedInstrument, focusedPair, focusedVenue } = useMobileFocus()
  const { pushOverlay } = useMobileActions()
  const openOutcome = useOpenPredictionOutcome()
  const context = usePredictionEventContext(focusedInstrument, focusedVenue)

  const event = context.event
  const openLadder = useCallback(() => {
    if (!event) return
    track('mobile_prediction_surface_opened', {
      surface: 'ladder',
      source: 'trade_ticket',
    })
    pushOverlay({
      kind: 'predictionLadder',
      event,
      venue: context.venue,
      venueLabel: context.venueLabel,
    })
  }, [context.venue, context.venueLabel, event, pushOverlay])

  if (!event || context.runners.length < 2) return null

  const ranked = rankRunners(context.runners)
  const active = normalizePairKey(focusedPair)

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ranked.slice(0, INLINE).map((runner) => (
          <OutcomeChip
            active={legKeys(runner).some(
              (key) => normalizePairKey(key) === active,
            )}
            colorIndex={runnerColorIndex(context.runners, runner.yes.pairKey)}
            key={runner.yes.pairKey}
            onSelect={() =>
              openOutcome(context.venue, event, runner.market, runner.yes)
            }
            runner={runner}
          />
        ))}
      </div>
      <button
        aria-label={t('mobile.predictions.rankOutcomes', {
          count: context.runners.length,
        })}
        className="pl-press flex size-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--pl-wash-strong)] text-foreground"
        onClick={openLadder}
        type="button"
        {...PRESS}
      >
        <ListOrdered aria-hidden className="size-4" />
      </button>
    </div>
  )
}

function OutcomeChip({
  runner,
  active,
  colorIndex,
  onSelect,
}: {
  runner: PredictionRunner
  active: boolean
  colorIndex: number
  onSelect: () => void
}) {
  const price = runnerPrice(runner)
  return (
    <button
      aria-current={active || undefined}
      className={cn(
        'pl-press flex h-9 max-w-[168px] shrink-0 items-center gap-1.5 rounded-xl px-2.5',
        active
          ? 'bg-[color:var(--pl-wash-strong)] text-foreground ring-1 ring-primary/50'
          : 'bg-[color:var(--pl-wash)] text-muted-foreground',
      )}
      onClick={onSelect}
      type="button"
      {...PRESS}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: runnerToken(colorIndex) }}
      />
      <span className="min-w-0 truncate text-[12px] font-medium">
        {runner.label}
      </span>
      <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums">
        {price === null ? '—' : formatPredictionPrice(price)}
      </span>
    </button>
  )
}

/**
 * Both sides of a runner, so a chip reads as selected whichever one the ticket
 * is on. Taking No on a candidate is still being on that candidate.
 */
function legKeys(runner: PredictionRunner): Array<string> {
  return runner.no
    ? [runner.yes.pairKey, runner.no.pairKey]
    : [runner.yes.pairKey]
}
