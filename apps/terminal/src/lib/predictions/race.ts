// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "How many answers does this question have, and what do they cost together?"
 *
 * A prediction event is one of two things and the terminal has to tell them
 * apart before it draws anything. A binary event has one market and two legs
 * that sum to a dollar, so the only interesting reading is the probability. A
 * race has many mutually exclusive answers, and there the interesting reading
 * is the SUM: if every Yes price adds to 103.4%, buying the whole field is a
 * guaranteed 3.4% loss, and selling it is the arb. That number does not exist
 * on a binary market and must never be shown as if it did.
 *
 * The venues disagree about how a race is shaped — Polymarket gives one market
 * per candidate, Kalshi one market per strike, and either may put several
 * outcomes inside a single market — so `runnersOf` normalizes all three into
 * "the tradeable answers" and everything downstream counts that list.
 */
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'

import { binarySideOf } from '@/lib/predictions/event-labels'

/** One tradeable answer to the event's question. */
export type PredictionRunner = {
  /** The market this answer lives in — what an order and a chart address. */
  market: PredictionMarketSummary
  /** The Yes-side outcome: what "this answer happens" costs. */
  yes: PredictionOutcomeSummary
  /** The complement, when the market publishes one. */
  no: PredictionOutcomeSummary | null
  /** What to call it: the venue's short label, else the question. */
  label: string
}

/**
 * The Yes side of a market, or its first outcome.
 *
 * Label first because both venues spell it, position second because a
 * candidate pair ('Newsom' / 'Field') has no Yes to match and ccxt builds the
 * affirmative leg first on both.
 */
export function yesOutcomeOf(
  market: PredictionMarketSummary,
): PredictionOutcomeSummary | null {
  const named = market.outcomes.find((o) => binarySideOf(o.label) === 'yes')
  return named ?? market.outcomes[0] ?? null
}

function noOutcomeOf(
  market: PredictionMarketSummary,
  yes: PredictionOutcomeSummary,
): PredictionOutcomeSummary | null {
  const named = market.outcomes.find((o) => binarySideOf(o.label) === 'no')
  if (named) return named
  const other = market.outcomes.find((o) => o.pairKey !== yes.pairKey)
  return other ?? null
}

/**
 * The event's tradeable answers, one row per answer.
 *
 * Multi-market events are the common race shape and each market IS an answer,
 * so its Yes leg is the runner and its No leg rides along for the ladder's
 * second chip. A single market carrying more than two outcomes is the other
 * shape: there every outcome is an answer and none of them is a complement.
 *
 * A plain binary market returns its two legs, which makes `runnersOf` total —
 * callers never branch on shape, they count.
 */
export function runnersOf(
  event: Pick<PredictionEventSummary, 'markets'>,
): Array<PredictionRunner> {
  const markets = event.markets ?? []

  if (markets.length > 1) {
    const runners: Array<PredictionRunner> = []
    for (const market of markets) {
      const yes = yesOutcomeOf(market)
      if (!yes) continue
      runners.push({
        market,
        yes,
        no: noOutcomeOf(market, yes),
        label: market.shortTitle?.trim() || market.title,
      })
    }
    return runners
  }

  const only = markets[0]
  if (!only) return []
  if (only.outcomes.length > 2) {
    return only.outcomes.map((outcome) => ({
      market: only,
      yes: outcome,
      no: null,
      label: outcome.label,
    }))
  }
  return only.outcomes.map((outcome) => ({
    market: only,
    yes: outcome,
    no: only.outcomes.find((o) => o.pairKey !== outcome.pairKey) ?? null,
    label: outcome.label,
  }))
}

/**
 * More than two answers means the ladder and the overround are the right
 * reading, and a two-line Yes/No header is not.
 *
 * Deliberately structural rather than a venue or a category test: "who wins
 * the nomination" and "which strike does CPI land above" are the same shape to
 * a trader even though one is a field of candidates and the other a scalar
 * ladder.
 */
export function isRaceEvent(
  event: Pick<PredictionEventSummary, 'markets'>,
): boolean {
  return runnersOf(event).length > 2
}

/** Which price the overround was summed from — stated, never assumed. */
export type OverroundBasis = 'ask' | 'last'

export type EventOverround = {
  /** Sum of the runners' Yes prices, in collateral units (1.034 = 103.4%). */
  total: number
  /** How far above (or below) a fair 100% the field is priced. */
  edge: number
  basis: OverroundBasis
  /** Runners the sum could read a price for. */
  counted: number
  /** Runners with no price at all — the sum understates by this many. */
  missing: number
}

/**
 * The sum of every Yes price in the field.
 *
 * The basis matters enough to be part of the answer. Summing asks measures
 * what buying the whole field would actually cost, which is the reading the
 * arb depends on; summing last prices measures what the market believes, which
 * is the reading available when the venue is not publishing a full book. Mixing
 * the two per runner would produce a number that is neither, so the basis is
 * chosen once for the whole field: asks when EVERY runner has one, last
 * otherwise.
 *
 * Runners with no price are counted as missing rather than as zero. A field
 * summing to 96% because four runners are unquoted is not an arbitrage, and
 * reporting it as one is the failure this split exists to prevent.
 *
 * Null below two runners: one price is not a field.
 */
export function eventOverround(
  runners: Array<PredictionRunner>,
): EventOverround | null {
  if (runners.length < 2) return null

  const asks = runners.map((r) => priceOf(r.yes.ask))
  const useAsk = asks.every((value) => value !== null)
  const basis: OverroundBasis = useAsk ? 'ask' : 'last'

  let total = 0
  let counted = 0
  let missing = 0
  for (const runner of runners) {
    const value = useAsk
      ? priceOf(runner.yes.ask)
      : (priceOf(runner.yes.price) ?? priceOf(runner.yes.ask))
    if (value === null) {
      missing++
      continue
    }
    total += value
    counted++
  }
  if (counted < 2) return null

  return { total, edge: total - 1, basis, counted, missing }
}

/** A probability is a number strictly inside (0, 1]; anything else is absent. */
function priceOf(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0 || value > 1) return null
  return value
}

/**
 * How much of the probability mass the top `n` runners hold.
 *
 * The board's one-line reading of a 128-runner field: "top 4 hold 50%" says
 * more about the shape of the race than any four rows can.
 */
export function topRunnerShare(
  runners: Array<PredictionRunner>,
  n: number,
): number | null {
  const priced = runners
    .map((r) => priceOf(r.yes.price) ?? priceOf(r.yes.ask))
    .filter((value): value is number => value !== null)
  if (priced.length === 0) return null
  const total = priced.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return null
  const top = priced
    .slice()
    .sort((a, b) => b - a)
    .slice(0, n)
    .reduce((sum, value) => sum + value, 0)
  return top / total
}

/** Runners by probability, richest first. Ties keep venue order (stable sort). */
export function byProbability(
  runners: Array<PredictionRunner>,
): Array<PredictionRunner> {
  return runners
    .slice()
    .sort(
      (a, b) =>
        (priceOf(b.yes.price) ?? priceOf(b.yes.ask) ?? 0) -
        (priceOf(a.yes.price) ?? priceOf(a.yes.ask) ?? 0),
    )
}

/** The runner's probability for display and sorting, or null when unquoted. */
export function runnerPrice(runner: PredictionRunner): number | null {
  return priceOf(runner.yes.price) ?? priceOf(runner.yes.ask)
}
