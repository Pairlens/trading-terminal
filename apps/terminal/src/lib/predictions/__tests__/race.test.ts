// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Race detection and the overround.
 *
 * Two user-visible failures these pin down. Calling a binary market a race
 * puts a "sum of all Yes prices: 100%" gauge over a question with two answers,
 * where the number is a tautology. And summing a field that has unquoted
 * runners reports 96% — a free-money arbitrage that does not exist.
 */
import { describe, expect, test } from 'bun:test'

import {
  byProbability,
  eventOverround,
  headlineRunner,
  isRaceEvent,
  massBarSegments,
  raceFieldKind,
  runnersOf,
  topRunnerShare,
  yesOutcomeOf,
} from '../race'
import type {
  PredictionEventSummary,
  PredictionMarketSummary,
} from '@pairlens/shared/instrument-types'

function market(
  id: string,
  outcomes: Array<{
    label: string
    price?: number
    ask?: number
  }>,
  shortTitle?: string,
): PredictionMarketSummary {
  return {
    id,
    title: `Will ${id} happen?`,
    ...(shortTitle ? { shortTitle } : {}),
    outcomes: outcomes.map((o) => ({
      pairKey: `${id}-${o.label}`.toUpperCase(),
      label: o.label,
      ...(o.price !== undefined ? { price: o.price } : {}),
      ...(o.ask !== undefined ? { ask: o.ask } : {}),
    })),
  }
}

function event(
  markets: Array<PredictionMarketSummary>,
): PredictionEventSummary {
  return { id: 'evt', market: 'polymarket', title: 'The question', markets }
}

const BINARY = event([
  market('fed', [
    { label: 'Yes', price: 0.68 },
    { label: 'No', price: 0.32 },
  ]),
])

const FIELD = event([
  market(
    'newsom',
    [
      { label: 'Yes', price: 0.34 },
      { label: 'No', price: 0.66 },
    ],
    'Gavin Newsom',
  ),
  market(
    'shapiro',
    [
      { label: 'Yes', price: 0.14 },
      { label: 'No', price: 0.86 },
    ],
    'Josh Shapiro',
  ),
  market(
    'aoc',
    [
      { label: 'Yes', price: 0.11 },
      { label: 'No', price: 0.89 },
    ],
    'A. Ocasio-Cortez',
  ),
  market(
    'whitmer',
    [
      { label: 'Yes', price: 0.09 },
      { label: 'No', price: 0.91 },
    ],
    'Gretchen Whitmer',
  ),
])

describe('runnersOf', () => {
  test('a binary market is its two legs', () => {
    const runners = runnersOf(BINARY)
    expect(runners.map((r) => r.label)).toEqual(['Yes', 'No'])
    expect(runners[0].no?.label).toBe('No')
  })

  test('a multi-market event is one runner per market, named by its short label', () => {
    const runners = runnersOf(FIELD)
    expect(runners).toHaveLength(4)
    expect(runners.map((r) => r.label)).toEqual([
      'Gavin Newsom',
      'Josh Shapiro',
      'A. Ocasio-Cortez',
      'Gretchen Whitmer',
    ])
    // The Yes leg is what a race row prices; the No leg is the second chip.
    expect(runners[0].yes.price).toBe(0.34)
    expect(runners[0].no?.price).toBe(0.66)
  })

  test('a single market with many outcomes is one runner per outcome, with no complement', () => {
    const scalar = event([
      market('cpi', [
        { label: 'Above 3.0%', price: 0.2 },
        { label: '2.5–3.0%', price: 0.5 },
        { label: 'Below 2.5%', price: 0.3 },
      ]),
    ])
    const runners = runnersOf(scalar)
    expect(runners).toHaveLength(3)
    expect(runners.every((r) => r.no === null)).toBe(true)
  })

  test('a market with no outcomes contributes no runner', () => {
    expect(
      runnersOf(event([market('a', []), market('b', [{ label: 'Yes' }])])),
    ).toHaveLength(1)
  })
})

describe('yesOutcomeOf', () => {
  test('prefers the labelled affirmative over position', () => {
    const m = market('x', [
      { label: 'No', price: 0.4 },
      { label: 'Yes', price: 0.6 },
    ])
    expect(yesOutcomeOf(m)?.label).toBe('Yes')
  })

  test('falls back to the first leg for a candidate pair', () => {
    const m = market('x', [{ label: 'Newsom' }, { label: 'Field' }])
    expect(yesOutcomeOf(m)?.label).toBe('Newsom')
  })
})

describe('isRaceEvent', () => {
  test('two answers is not a race', () => {
    expect(isRaceEvent(BINARY)).toBe(false)
  })

  test('a two-market event is still not a race', () => {
    expect(isRaceEvent(event([FIELD.markets[0], FIELD.markets[1]]))).toBe(false)
  })

  test('three or more answers is', () => {
    expect(isRaceEvent(FIELD)).toBe(true)
  })
})

describe('eventOverround', () => {
  test('sums the field and states the edge', () => {
    const result = eventOverround(runnersOf(FIELD))!
    expect(result.basis).toBe('last')
    expect(result.counted).toBe(4)
    expect(result.total).toBeCloseTo(0.68, 10)
    expect(result.edge).toBeCloseTo(-0.32, 10)
  })

  test('uses asks only when every runner has one', () => {
    const withAsks = event([
      market('a', [{ label: 'Yes', price: 0.34, ask: 0.35 }]),
      market('b', [{ label: 'Yes', price: 0.34, ask: 0.36 }]),
      market('c', [{ label: 'Yes', price: 0.34, ask: 0.36 }]),
    ])
    const asked = eventOverround(runnersOf(withAsks))!
    expect(asked.basis).toBe('ask')
    expect(asked.total).toBeCloseTo(1.07, 10)

    const partial = event([
      market('a', [{ label: 'Yes', price: 0.34, ask: 0.35 }]),
      market('b', [{ label: 'Yes', price: 0.34 }]),
      market('c', [{ label: 'Yes', price: 0.34, ask: 0.36 }]),
    ])
    expect(eventOverround(runnersOf(partial))!.basis).toBe('last')
  })

  test('reports unquoted runners rather than counting them as free', () => {
    const gappy = event([
      market('a', [{ label: 'Yes', price: 0.5 }]),
      market('b', [{ label: 'Yes', price: 0.5 }]),
      market('c', [{ label: 'Yes' }]),
    ])
    const result = eventOverround(runnersOf(gappy))!
    expect(result.counted).toBe(2)
    expect(result.missing).toBe(1)
    // Without `missing` on screen this reads as a 100% field, which for a
    // three-horse race with an unpriced horse is not what it means.
    expect(result.total).toBeCloseTo(1, 10)
  })

  test('refuses a field it cannot price', () => {
    const lone = event([market('a', [{ label: 'Yes', price: 0.5 }])])
    expect(eventOverround(runnersOf(lone))).toBeNull()
    const unpriced = event([
      market('a', [{ label: 'Yes' }]),
      market('b', [{ label: 'Yes' }]),
    ])
    expect(eventOverround(runnersOf(unpriced))).toBeNull()
  })

  test('rejects prices outside a probability', () => {
    const nonsense = event([
      market('a', [{ label: 'Yes', price: 1.4 }]),
      market('b', [{ label: 'Yes', price: 0 }]),
      market('c', [{ label: 'Yes', price: 0.5 }]),
    ])
    expect(eventOverround(runnersOf(nonsense))).toBeNull()
  })
})

describe('topRunnerShare', () => {
  test('states the mass the leaders hold as a fraction of what is priced', () => {
    // 0.34 + 0.14 = 0.48 of a 0.68 field.
    expect(topRunnerShare(runnersOf(FIELD), 2)).toBeCloseTo(0.48 / 0.68, 10)
  })

  test('is null when nothing is priced', () => {
    expect(
      topRunnerShare(runnersOf(event([market('a', [{ label: 'Yes' }])])), 4),
    ).toBeNull()
  })
})

describe('byProbability', () => {
  test('richest first, unquoted last', () => {
    const mixed = event([
      market('a', [{ label: 'Yes' }]),
      market('b', [{ label: 'Yes', price: 0.2 }]),
      market('c', [{ label: 'Yes', price: 0.6 }]),
    ])
    expect(byProbability(runnersOf(mixed)).map((r) => r.market.id)).toEqual([
      'c',
      'b',
      'a',
    ])
  })
})

describe('headlineRunner', () => {
  test('is the Yes leg, whichever order the venue printed the legs in', () => {
    // Polymarket regularly returns No first. Reading `runners[0]` put a 92%
    // headline in green over a question the market gives an 8% chance.
    const inverted = event([
      market('fed', [
        { label: 'No', price: 0.32 },
        { label: 'Yes', price: 0.68 },
      ]),
    ])
    expect(headlineRunner(runnersOf(inverted))?.yes.price).toBe(0.68)
    expect(headlineRunner(runnersOf(BINARY))?.yes.price).toBe(0.68)
  })

  test('falls back to the first runner where no leg is named Yes', () => {
    // A candidate pair ('Newsom' / 'Field') has no affirmative leg to find.
    const pair = event([
      market('nominee', [
        { label: 'Newsom', price: 0.34 },
        { label: 'Field', price: 0.66 },
      ]),
    ])
    expect(headlineRunner(runnersOf(pair))?.label).toBe('Newsom')
  })

  test('is null on an empty field rather than throwing', () => {
    expect(headlineRunner([])).toBeNull()
  })
})

describe('raceFieldKind', () => {
  test('many markets are candidates, each its own question', () => {
    expect(raceFieldKind(FIELD)).toBe('candidates')
  })

  test('one market with many outcomes is outcomes on one question', () => {
    const scalar = event([
      market('cpi', [
        { label: 'Above 3.0%', price: 0.2 },
        { label: '2.5-3.0%', price: 0.5 },
        { label: 'Below 2.5%', price: 0.3 },
      ]),
    ])
    expect(raceFieldKind(scalar)).toBe('outcomes')
  })
})

describe('massBarSegments', () => {
  test('is absolute probability, so the grey tail means everyone else', () => {
    // Four runners at 5% each must fill a fifth of the bar. Normalising by
    // their own sum filled the whole thing and made a wide-open race read as
    // a decided one.
    const flat = event([
      market('a', [{ label: 'Yes', price: 0.05 }]),
      market('b', [{ label: 'Yes', price: 0.05 }]),
      market('c', [{ label: 'Yes', price: 0.05 }]),
      market('d', [{ label: 'Yes', price: 0.05 }]),
      market('e', [{ label: 'Yes', price: 0.05 }]),
    ])
    const segments = massBarSegments(runnersOf(flat), 4)
    expect(segments).toHaveLength(4)
    expect(segments.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(20, 10)
  })

  test('ranks the segments richest first, whatever the venue order', () => {
    const segments = massBarSegments(runnersOf(FIELD), 4)
    expect(segments.map((s) => Math.round(s.percent))).toEqual([34, 14, 11, 9])
  })

  test('squeezes an overround field instead of overflowing the bar', () => {
    // A thin book can price a field well over 100%. The bar can never say
    // more than "all of it", and the ranking has to survive the squeeze.
    const overround = event([
      market('a', [{ label: 'Yes', price: 0.6 }]),
      market('b', [{ label: 'Yes', price: 0.5 }]),
      market('c', [{ label: 'Yes', price: 0.4 }]),
      market('d', [{ label: 'Yes', price: 0.3 }]),
    ])
    const segments = massBarSegments(runnersOf(overround), 4)
    const total = segments.reduce((sum, s) => sum + s.percent, 0)
    expect(total).toBeCloseTo(100, 10)
    expect(segments[0].percent).toBeGreaterThan(segments[1].percent)
    expect(segments.every((s) => s.percent > 0)).toBe(true)
  })

  test('skips unquoted runners rather than drawing them at zero', () => {
    const partial = event([
      market('a', [{ label: 'Yes', price: 0.4 }]),
      market('b', [{ label: 'Yes' }]),
      market('c', [{ label: 'Yes', price: 0.1 }]),
    ])
    expect(
      massBarSegments(runnersOf(partial), 4).map((s) => s.pairKey),
    ).toEqual(['A-YES', 'C-YES'])
  })
})
