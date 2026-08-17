// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a field of runners is ordered, filtered and summarised on a phone.
 *
 * Pure, and separate from the screen that draws it, for the reason
 * `prediction-preview.ts` gives about the event board: the ordering rules are
 * the part that can be wrong in a way nobody notices, and they can be pinned
 * without a plugin host.
 *
 * The desktop ladder offers four sorts. The phone offers one, because a
 * ladder IS the probability ordering — every other sort is a table, and a
 * table wants a header row the 402px screen does not have. What the phone
 * keeps from the desktop is the part that matters: unquoted runners sink
 * rather than sorting as zero, and ties hold venue order so the colour index
 * stays put.
 */
import type { PredictionRunner } from '@/lib/predictions/race'

import { runnerPrice } from '@/lib/predictions/race'

/**
 * Best-priced first.
 *
 * A runner the venue is not quoting is not the cheapest runner, so it sinks
 * to the end instead of ranking at zero — the same rule the desktop pane
 * applies, and the reason the tail footer can claim "all under 4¢" honestly.
 */
export function rankRunners(
  runners: ReadonlyArray<PredictionRunner>,
): Array<PredictionRunner> {
  return runners
    .map((runner, index) => ({ runner, index, price: runnerPrice(runner) }))
    .sort((a, b) => {
      if (a.price === null && b.price === null) return a.index - b.index
      if (a.price === null) return 1
      if (b.price === null) return -1
      return b.price - a.price || a.index - b.index
    })
    .map((entry) => entry.runner)
}

/**
 * Runners matching a filter, by their own label or by the market question.
 *
 * The question is searched too because a scalar ladder's labels are bare
 * numbers ('Above 13.5M'): typing the subject would match nothing otherwise.
 */
export function filterRunners(
  runners: ReadonlyArray<PredictionRunner>,
  query: string,
): Array<PredictionRunner> {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...runners]
  return runners.filter(
    (runner) =>
      runner.label.toLowerCase().includes(needle) ||
      runner.market.title.toLowerCase().includes(needle),
  )
}

/**
 * Whether the rows a page cut off really are the cheap tail.
 *
 * The footer says two different things and only one of them is a claim: "128
 * more, all under 4¢" describes the field, "show 40 more" describes the page.
 * An unquoted runner is not under 4¢ — it is unpriced — so it disqualifies the
 * stronger sentence rather than being counted into it.
 */
export function isCheapTail(
  hidden: ReadonlyArray<PredictionRunner>,
  ceiling: number,
): boolean {
  if (hidden.length === 0) return false
  return hidden.every((runner) => {
    const price = runnerPrice(runner)
    return price !== null && price < ceiling
  })
}

/**
 * The best-priced runner, or null when the venue quotes none of them.
 *
 * The event strip's reading of a race: a field has no single probability, and
 * the leader is the one number that says which way it is leaning.
 */
export function leadingRunner(
  runners: ReadonlyArray<PredictionRunner>,
): PredictionRunner | null {
  let best: PredictionRunner | null = null
  let bestPrice = -1
  for (const runner of runners) {
    const price = runnerPrice(runner)
    if (price === null || price <= bestPrice) continue
    best = runner
    bestPrice = price
  }
  return best
}
