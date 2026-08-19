// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The stacked probability view.
 *
 * Three user-visible failures pinned here. Normalizing the drawn runners to
 * fill the axis would report a 22% favourite as a 30% favourite, which is the
 * whole reason the rest band exists. Stacking a nested strike ladder would
 * draw a field summing to two and a half dollars as if it were a probability.
 * And a runner the venue has no history for has to leave the crosshair
 * silent rather than be read out at 0%.
 */
import { describe, expect, test } from 'bun:test'

import { REST_KEY, isPartitionField, stackSeries } from '../stack'
import type { PredictionRunner } from '../race'
import type { SeriesRow } from '../series'

const HOUR = 3_600_000

function runner(label: string, price: number): PredictionRunner {
  const outcome = { pairKey: label.toUpperCase(), label, price }
  return {
    market: { id: label, title: `Will ${label} win?`, outcomes: [outcome] },
    yes: outcome,
    no: null,
    label,
  }
}

describe('isPartitionField', () => {
  test('accepts a race whose Yes prices sum to about a dollar', () => {
    expect(
      isPartitionField([
        runner('Vance', 0.22),
        runner('AOC', 0.13),
        runner('Rubio', 0.12),
        runner('Field', 0.55),
      ]),
    ).toBe(true)
  })

  test('refuses a nested strike ladder', () => {
    // "Above 60k" is true whenever "above 70k" is: these are not answers to
    // one question and laying them end to end draws 2.4 dollars of certainty.
    expect(
      isPartitionField([
        runner('Above 60k', 0.9),
        runner('Above 65k', 0.8),
        runner('Above 70k', 0.4),
        runner('Above 75k', 0.3),
      ]),
    ).toBe(false)
  })

  test('refuses a field that is mostly unquoted', () => {
    expect(
      isPartitionField([
        runner('A', 0.4),
        runner('B', 0.3),
        { ...runner('C', 0.1), yes: { pairKey: 'C', label: 'C' } },
        { ...runner('D', 0.1), yes: { pairKey: 'D', label: 'D' } },
      ]),
    ).toBe(false)
  })

  test('refuses a binary market: a stack of two is one boundary line', () => {
    expect(isPartitionField([runner('Yes', 0.68), runner('No', 0.32)])).toBe(
      false,
    )
  })
})

describe('stackSeries', () => {
  const rows: Array<SeriesRow> = [
    { ts: 0, A: 0.2, B: 0.1, C: 0.05 },
    { ts: HOUR, A: 0.25, B: 0.12, C: 0.04 },
  ]

  test('stacks raw probabilities and gives the leftover to the rest band', () => {
    const stacked = stackSeries(rows, ['A', 'B', 'C'])
    expect(stacked.rows[0]?.A).toBe(0.2)
    expect(stacked.rows[0]?.B).toBe(0.1)
    expect(stacked.rows[0]?.C).toBe(0.05)
    expect(stacked.rows[0]?.[REST_KEY]).toBeCloseTo(0.65, 10)
    // The reading the whole module exists for: the favourite's band is 25
    // points tall, not the 61% of the drawn field that normalizing would give.
    expect(stacked.rows[1]?.A).toBe(0.25)
    expect(stacked.hasRest).toBe(true)
  })

  test('every row sums to exactly one', () => {
    for (const row of stackSeries(rows, ['A', 'B', 'C']).rows) {
      const total = ['A', 'B', 'C', REST_KEY].reduce(
        (sum, key) => sum + (row[key] ?? 0),
        0,
      )
      expect(total).toBeCloseTo(1, 10)
    }
  })

  test('orders bands richest at the floor, by the last value not the first', () => {
    const crossing: Array<SeriesRow> = [
      { ts: 0, A: 0.6, B: 0.2 },
      { ts: HOUR, A: 0.2, B: 0.6 },
    ]
    expect(stackSeries(crossing, ['A', 'B']).order).toEqual(['B', 'A'])
  })

  test('a runner with no quote is a zero band and a recorded gap', () => {
    const holed: Array<SeriesRow> = [
      { ts: 0, A: 0.5 },
      { ts: HOUR, A: 0.5, B: 0.3 },
    ]
    const stacked = stackSeries(holed, ['A', 'B'])
    expect(stacked.rows[0]?.B).toBe(0)
    expect(stacked.gaps.get(0)?.has('B')).toBe(true)
    expect(stacked.gaps.has(HOUR)).toBe(false)
  })

  test('an overround field lifts the ceiling rather than being clipped', () => {
    const rich: Array<SeriesRow> = [{ ts: 0, A: 0.7, B: 0.36 }]
    const stacked = stackSeries(rich, ['A', 'B'])
    expect(stacked.max).toBeCloseTo(1.06, 10)
    expect(stacked.rows[0]?.[REST_KEY]).toBe(0)
    expect(stacked.hasRest).toBe(false)
  })

  test('no rows is an empty stack, not a crash', () => {
    expect(stackSeries([], ['A']).rows).toEqual([])
    expect(stackSeries([{ ts: 0 }], []).rows).toEqual([])
  })
})
