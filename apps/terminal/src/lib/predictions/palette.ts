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

export function runnerToken(index: number): string {
  if (index < 0) return 'var(--muted-foreground)'
  return RUNNER_TOKENS[index % RUNNER_TOKENS.length]
}

/** Venue-order position of an outcome, or -1 when the field does not hold it. */
export function runnerColorIndex(
  runners: Array<PredictionRunner>,
  pairKey: string,
): number {
  return runners.findIndex((runner) => runner.yes.pairKey === pairKey)
}
