// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The ladder's ordering rules.
 *
 * All three assertions here are about the same failure mode: treating "the
 * venue is not quoting this" as "this is worth nothing". A ladder that ranks
 * an unquoted runner last is right; one that ranks it at 0¢ puts it in the
 * tail, and the footer then claims a hundred rows are "all under 4¢" when some
 * of them have no price at all.
 */
import { describe, expect, it } from 'bun:test'

import {
  filterRunners,
  isCheapTail,
  leadingRunner,
  rankRunners,
} from '../lib/outcome-ladder'
import type { PredictionRunner } from '@/lib/predictions/race'

function runner(
  label: string,
  price: number | undefined,
  title = `Will ${label} win?`,
): PredictionRunner {
  return {
    market: { id: `mkt-${label}`, title, outcomes: [] },
    yes: { pairKey: `${label}-YES`, label: 'Yes', ...(price ? { price } : {}) },
    no: null,
    label,
  }
}

describe('rankRunners', () => {
  it('puts the best-priced runner first', () => {
    const ranked = rankRunners([
      runner('Harris', 0.12),
      runner('Newsom', 0.41),
      runner('Shapiro', 0.22),
    ])
    expect(ranked.map((r) => r.label)).toEqual(['Newsom', 'Shapiro', 'Harris'])
  })

  it('sinks unquoted runners instead of ranking them at zero', () => {
    const ranked = rankRunners([
      runner('Unquoted', undefined),
      runner('Cheap', 0.01),
      runner('Leader', 0.6),
    ])
    expect(ranked.map((r) => r.label)).toEqual(['Leader', 'Cheap', 'Unquoted'])
  })

  it('holds venue order on a tie, so the colour index cannot move', () => {
    // `runnerColorIndex` numbers a runner by its position in the VENUE's
    // ordering. A sort that reshuffled equals would repaint the field's dots
    // every time the board refreshed with the same prices.
    const ranked = rankRunners([
      runner('First', 0.25),
      runner('Second', 0.25),
      runner('Third', 0.25),
    ])
    expect(ranked.map((r) => r.label)).toEqual(['First', 'Second', 'Third'])
  })

  it('does not mutate the input', () => {
    const input = [runner('A', 0.1), runner('B', 0.9)]
    rankRunners(input)
    expect(input.map((r) => r.label)).toEqual(['A', 'B'])
  })
})

describe('filterRunners', () => {
  it('matches the runner label', () => {
    const rows = filterRunners(
      [runner('Newsom', 0.4), runner('Harris', 0.2)],
      'new',
    )
    expect(rows.map((r) => r.label)).toEqual(['Newsom'])
  })

  it('matches the market question too, for a scalar ladder', () => {
    // A strike ladder's labels are bare numbers ('Above 13.5M'), so typing the
    // subject would match nothing without this.
    const rows = filterRunners(
      [
        runner('Above 13.5M', 0.4, 'How many jobs added in August?'),
        runner('Above 14M', 0.1, 'How many jobs added in August?'),
      ],
      'jobs',
    )
    expect(rows).toHaveLength(2)
  })

  it('returns everything for an empty query', () => {
    const all = [runner('A', 0.1), runner('B', 0.2)]
    expect(filterRunners(all, '   ')).toHaveLength(2)
  })
})

describe('isCheapTail', () => {
  it('is true only when every hidden runner is priced under the ceiling', () => {
    expect(isCheapTail([runner('A', 0.01), runner('B', 0.03)], 0.04)).toBe(true)
    expect(isCheapTail([runner('A', 0.01), runner('B', 0.4)], 0.04)).toBe(false)
  })

  it('refuses to count an unquoted runner as cheap', () => {
    // The whole reason this is a function: "all under 4¢" is a claim about the
    // field, and a runner with no price has not made one.
    expect(isCheapTail([runner('A', 0.01), runner('B', undefined)], 0.04)).toBe(
      false,
    )
  })

  it('is false for an empty tail', () => {
    expect(isCheapTail([], 0.04)).toBe(false)
  })
})

describe('leadingRunner', () => {
  it('picks the best-priced runner', () => {
    expect(
      leadingRunner([runner('A', 0.2), runner('B', 0.55), runner('C', 0.1)])
        ?.label,
    ).toBe('B')
  })

  it('is null when the venue quotes none of them', () => {
    expect(leadingRunner([runner('A', undefined)])).toBeNull()
    expect(leadingRunner([])).toBeNull()
  })
})
