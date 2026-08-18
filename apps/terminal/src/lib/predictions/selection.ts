// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which answer of an event the book, the tape and the ticket are pointed at.
 *
 * Pure, and separate from the desk that calls it, because this is the one rule
 * of the new model that is easy to get quietly wrong: an event has many
 * tradeable legs and exactly one of them can be streamed, so the default has
 * to be defensible on every shape of market and the URL has to be checked
 * rather than believed.
 */
import type {
  PredictionEventSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'
import type { SelectedOutcome } from '@/lib/predictions/desk-context'
import type { PredictionRunner } from '@/lib/predictions/race'

import { byProbability, yesOutcomeOf } from '@/lib/predictions/race'
import { normalizePairKey } from '@/lib/pairs'

/** Every tradeable leg of a runner: its answer, and its complement when there is one. */
export function legsOf(
  runner: PredictionRunner,
): Array<PredictionOutcomeSummary> {
  return runner.no ? [runner.yes, runner.no] : [runner.yes]
}

/**
 * Which answer the ticket is pointed at.
 *
 * The URL wins when it names a leg this event actually publishes — a shared
 * link is allowed to be specific. It is checked against the field rather than
 * trusted, because an `?o=` carried over from another event would otherwise
 * aim the order ticket at an instrument that is not on screen.
 *
 * The default is the favourite, with one correction: on a plain binary market
 * the ticket reads from the Yes side whichever way the market is leaning, so
 * that "No" is something the user chooses rather than something the market's
 * current lean chose for them.
 */
export function resolveSelection(
  runners: Array<PredictionRunner>,
  event: PredictionEventSummary | null,
  selectedKey: string,
): SelectedOutcome | null {
  if (runners.length === 0) return null

  const wanted = normalizePairKey(selectedKey)
  if (wanted) {
    for (const runner of runners) {
      for (const leg of legsOf(runner)) {
        if (normalizePairKey(leg.pairKey) === wanted) {
          return {
            pairKey: leg.pairKey,
            label: leg.label,
            runner,
            market: runner.market,
            outcome: leg,
          }
        }
      }
    }
  }

  const [favourite] = byProbability(runners)
  if (!favourite) return null

  const binary =
    event !== null &&
    event.markets.length === 1 &&
    (event.markets[0]?.outcomes.length ?? 0) <= 2

  if (binary) {
    const yes = yesOutcomeOf(favourite.market)
    const yesRunner =
      runners.find(
        (r) =>
          normalizePairKey(r.yes.pairKey) ===
          normalizePairKey(yes?.pairKey ?? ''),
      ) ?? favourite
    const leg = yes ?? yesRunner.yes
    return {
      pairKey: leg.pairKey,
      label: leg.label,
      runner: yesRunner,
      market: yesRunner.market,
      outcome: leg,
    }
  }

  return {
    pairKey: favourite.yes.pairKey,
    label: favourite.yes.label,
    runner: favourite,
    market: favourite.market,
    outcome: favourite.yes,
  }
}
