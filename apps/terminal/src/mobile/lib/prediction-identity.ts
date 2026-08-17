// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the phone knows about the event contract on screen, resolved once.
 *
 * Three surfaces answer the same question and used to answer it differently:
 * the chart's event strip, the Trade ticket's question card, and (before this)
 * nothing at all on a cold link. The inputs are two — a directory pin written
 * when the user picked the outcome, and the event re-read from the venue by
 * `usePredictionEventContext` — and neither is reliably present, so the
 * preference order is the whole content of this module.
 *
 * **The venue's live question wins, unless it is an id.** Both venues can
 * return a market whose `title` is the routing id itself (Polymarket's
 * condition hash), which is why `isOpaqueTitle` gates it rather than a plain
 * `??`. The pin's readable question is next, because it was built through
 * `predictionOutcomeName` and has already survived that test. The event
 * heading is last: on a race it is shared by every runner, so it names the
 * question without telling two of them apart.
 *
 * **Null means print nothing.** With neither a pin nor an event there is no
 * question, and a card restating `KXBTCD-26AUG15-T53` is a heading with no
 * content — the state the Trade ticket has always refused, now shared.
 */
import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'
import type { PredictionRunner } from '@/lib/predictions/race'

import {
  isOpaqueTitle,
  stripOutcomeSuffix,
} from '@/lib/predictions/event-labels'

export type PredictionIdentity = {
  /** The question this contract settles on. Never empty. */
  question: string
  /** When the collateral comes back, in ms. */
  resolvesAt: number | undefined
  /** The side taken: 'Yes', 'No', a candidate name. '' when unknown. */
  outcomeLabel: string
  /** The venue's resolution criteria, verbatim. Only the event carries it. */
  rules: string | undefined
  /**
   * The event, when the venue returned it — and therefore whether a surface
   * may offer to open it. Absent while loading, on a venue this build cannot
   * reach, and when the board no longer lists the event.
   */
  event: PredictionEventSummary | null
  venue: string
  venueLabel: string
  runners: Array<PredictionRunner>
  isRace: boolean
}

export function predictionIdentity(
  context: PredictionEventContext,
): PredictionIdentity | null {
  const { entry, event, market, outcome } = context
  if (!entry && !event) return null

  const question = resolveQuestion(context)
  const resolvesAt = market?.endMs ?? entry?.endMs ?? event?.endMs
  if (question === '' && resolvesAt === undefined) return null

  return {
    question,
    resolvesAt,
    outcomeLabel: entry?.outcome || outcome?.label || '',
    rules: market?.rules,
    event,
    venue: context.venue,
    venueLabel: context.venueLabel,
    runners: context.runners,
    isRace: context.isRace,
  }
}

function resolveQuestion(context: PredictionEventContext): string {
  const live = context.market?.title?.trim() ?? ''
  if (live && !isOpaqueTitle(live)) return live

  const entry = context.entry
  if (entry) {
    // The same reading `predictionQuestionOf` gives, inlined so this module
    // depends on the label rules rather than on a pair-picker helper.
    const pinned = stripOutcomeSuffix(entry.name, entry.outcome ?? '').trim()
    if (pinned && !isOpaqueTitle(pinned)) return pinned
  }

  return context.event?.title?.trim() ?? ''
}
