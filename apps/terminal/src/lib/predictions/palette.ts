// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One colour per runner, agreed on by every pane that draws the same field.
 *
 * The ladder's dot, the basket's swatch and the basket's stake bar have to
 * name the same runner with the same colour, or the two panes read as two
 * different races. So the index is the runner's position in the VENUE's own
 * ordering rather than its position in whatever the user just sorted by — a
 * colour that changes when you re-sort a table is worse than no colour.
 */
import type { PredictionRunner } from '@/lib/predictions/race'

/** Chart tokens, walked in order. Beyond the list, colours repeat. */
export const RUNNER_TOKENS = [
  'var(--chart-3)',
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

/**
 * A second lap of the same five hues, lifted toward the background.
 *
 * The theme carries exactly five chart tokens and every one of the eighteen
 * themes defines its own, so inventing a sixth colour here would either clash
 * with a theme or have to be added to all of them. Mixing toward `--background`
 * keeps the hue (a pale chart-3 still reads as "the blue one") and stays
 * theme-correct in light and dark alike, because both mix toward whatever the
 * page is actually painted on.
 *
 * One extra lap, not many: past ten a legend stops being scannable, and the
 * ladder is the surface for a field that size.
 */
const RUNNER_TOKEN_LAPS = 2

/** Distinct colours available before any two runners must share one. */
export const RUNNER_TOKEN_COUNT = RUNNER_TOKENS.length * RUNNER_TOKEN_LAPS

export function runnerToken(index: number): string {
  if (index < 0) return 'var(--muted-foreground)'
  const slot = index % RUNNER_TOKEN_COUNT
  const base = RUNNER_TOKENS[slot % RUNNER_TOKENS.length]
  if (slot < RUNNER_TOKENS.length) return base
  return `color-mix(in oklch, ${base}, var(--background) 42%)`
}

/**
 * Colours for a SUBSET of a field, guaranteed distinct.
 *
 * `runnerToken` keys on the runner's position in the venue's own ordering,
 * which is what stops a colour changing when the ladder is re-sorted. A chart
 * of the leaders is exactly that re-sort though: it draws eight runners whose
 * venue positions might be 3, 17 and 42, and two of those collide on a
 * ten-colour wheel often enough to matter — two identically coloured lines is
 * a worse failure than one line whose colour disagrees with a dot elsewhere.
 *
 * So the venue's colour is the FIRST choice and a collision walks forward to
 * the first free slot. On a field small enough to fit the wheel nothing moves,
 * which is the common case and the one where the ladder's dots are actually
 * doing identification work.
 */
export function assignRunnerColors(
  venueIndices: ReadonlyArray<number>,
): Array<string> {
  const taken = new Set<number>()
  const out: Array<string> = []

  for (const index of venueIndices) {
    if (index < 0) {
      out.push(runnerToken(-1))
      continue
    }
    let slot = index % RUNNER_TOKEN_COUNT
    // Bounded by the wheel: past a full lap of collisions every colour is in
    // use and the runner keeps its own, which is the honest outcome.
    for (let step = 0; step < RUNNER_TOKEN_COUNT && taken.has(slot); step++) {
      slot = (slot + 1) % RUNNER_TOKEN_COUNT
    }
    taken.add(slot)
    out.push(runnerToken(slot))
  }

  return out
}

/** Venue-order position of an outcome, or -1 when the field does not hold it. */
export function runnerColorIndex(
  runners: Array<PredictionRunner>,
  pairKey: string,
): number {
  return runners.findIndex((runner) => runner.yes.pairKey === pairKey)
}
