// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The field as bands that fill the axis, instead of lines that share its floor.
 *
 * Eight probability lines on a fixed 0-100% axis have one bad failure mode and
 * a race hits it constantly: when the favourite is at 22%, every runner is
 * drawn inside the bottom fifth of the pane, three quarters of the chart is
 * empty, and the gap between second and third place is two pixels. The reading
 * the pane exists for ("who is closing on whom") is the reading that
 * compression destroys first.
 *
 * Stacking is the fix, because a race already IS a partition: the answers are
 * mutually exclusive and their probabilities sum to a dollar. Laid end to end
 * they fill the axis by construction, and each runner's band THICKNESS is its
 * probability, so second against third is a comparison of two heights rather
 * than of two lines a pixel apart.
 *
 * Three rules keep it from becoming a lie.
 *
 * **Never normalize to 100%.** The obvious implementation divides each runner
 * by the sum of the drawn runners, which fills the axis perfectly and reports
 * a 22% favourite as 30%. This module stacks the RAW probabilities and gives
 * the leftover to a rest band, so the axis is full, every band measures true,
 * and the grey at the top is exactly the mass held by the runners the chart is
 * not drawing (capped runners, ones the user toggled off, ones the venue has
 * no history for, plus whatever the venue's overround leaves on the table).
 *
 * **Only stack a field that is actually a partition.** A Kalshi strike ladder
 * ("above 60k", "above 65k", "above 70k") is nested, not exclusive: its Yes
 * prices sum to several dollars and stacking them draws a quantity that does
 * not exist. `isPartitionField` is the gate, and the pane falls back to lines
 * when it says no.
 *
 * **A runner with no quote contributes nothing, and says so.** Its band is
 * zero-height for the rows it has no price in (a stack cannot carry a hole),
 * but those rows are recorded in `gaps` so the crosshair omits the runner
 * rather than reading it out at 0%.
 */
import type { PredictionRunner } from '@/lib/predictions/race'
import type { SeriesRow } from '@/lib/predictions/series'

import { eventOverround } from '@/lib/predictions/race'
import { lastValues } from '@/lib/predictions/series'

/** The band holding the probability mass the chart is not drawing. */
export const REST_KEY = '__rest'

/** Below half a point the rest band is rounding noise, not a reading. */
const REST_EPSILON = 0.005

/**
 * How far from a fair dollar a field may price and still be stacked.
 *
 * Wide enough for a real book: both venues carry an overround, and a field
 * whose tail is unquoted sums low. Narrow enough that a nested ladder (which
 * sums to two or three dollars) and a set of unrelated markets can never slip
 * through, because for those the stack would be drawing a total that is not a
 * probability of anything.
 */
const MIN_FIELD_TOTAL = 0.85
const MAX_FIELD_TOTAL = 1.15

/** Below this a stack is one boundary line, which the line view draws better. */
const MIN_STACKED_RUNNERS = 3

/**
 * True when the field's answers are mutually exclusive and priced like it.
 *
 * Structural tests do not settle this: "who wins the nomination" and "which
 * strike does CPI clear" are both many-runner races, and only one of them is a
 * partition. The sum is what tells them apart, so the sum is what is checked.
 */
export function isPartitionField(runners: Array<PredictionRunner>): boolean {
  if (runners.length < MIN_STACKED_RUNNERS) return false
  const over = eventOverround(runners)
  if (!over) return false
  // Every runner counted, or near enough: a field where most of the tail is
  // unquoted has a total that means nothing.
  if (over.counted < MIN_STACKED_RUNNERS) return false
  return over.total >= MIN_FIELD_TOTAL && over.total <= MAX_FIELD_TOTAL
}

/** One row of the stack: a timestamp, a height per band, and the rest. */
export type StackRow = { ts: number } & Record<string, number>

export type StackedSeries = {
  rows: Array<StackRow>
  /** Bands bottom-first, richest at the floor. Recharts stacks in this order. */
  order: Array<string>
  /** Where the axis has to top out: 1, or the overround if it prices above. */
  max: number
  /** Some row leaves enough mass undrawn to be worth a band. */
  hasRest: boolean
  /** ts → the runners with no quote in that row. */
  gaps: Map<number, Set<string>>
}

const EMPTY: StackedSeries = {
  rows: [],
  order: [],
  max: 1,
  hasRest: false,
  gaps: new Map(),
}

/**
 * Lay the given runners end to end on each row, richest at the floor.
 *
 * The order is taken from each runner's LAST drawn value rather than from the
 * row being laid out. Ordering per row would re-sort the bands at every
 * crossover and the chart would shuffle itself as it streamed; a stack is read
 * by following one band across the pane, which needs the band to stay put.
 */
export function stackSeries(
  rows: ReadonlyArray<SeriesRow>,
  keys: ReadonlyArray<string>,
): StackedSeries {
  if (rows.length === 0 || keys.length === 0) return EMPTY

  const last = lastValues(rows, keys)
  const order = keys
    .slice()
    .sort((a, b) => (last.get(b) ?? 0) - (last.get(a) ?? 0))

  const out: Array<StackRow> = []
  const gaps = new Map<number, Set<string>>()
  let peak = 0
  let hasRest = false

  for (const row of rows) {
    const next: StackRow = { ts: row.ts }
    let sum = 0
    let missing: Set<string> | null = null

    for (const key of order) {
      const value = row[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[key] = value
        sum += value
      } else {
        next[key] = 0
        if (!missing) missing = new Set()
        missing.add(key)
      }
    }

    const rest = Math.max(0, 1 - sum)
    next[REST_KEY] = rest
    if (rest > REST_EPSILON) hasRest = true
    if (sum > peak) peak = sum
    if (missing) gaps.set(row.ts, missing)
    out.push(next)
  }

  return { rows: out, order, max: Math.max(1, peak), hasRest, gaps }
}
