// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The default side, and the URL's right to override it.
 *
 * A prediction pair is an event, so something has to decide which of its
 * answers the order ticket is sizing. Getting that wrong is not cosmetic: an
 * unchecked `?o=` carried over from another question would aim a live ticket
 * at an instrument that is not on screen, and a binary default that follows
 * the market's lean would silently move the ticket from Yes to No the moment
 * the question crossed 50%.
 */
import { describe, expect, test } from 'bun:test'

import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'

import { resolveSelection } from '@/lib/predictions/selection'
import { runnersOf } from '@/lib/predictions/race'

const BINARY: PredictionEventSummary = {
  id: 'KXFED-26MAR',
  market: 'kalshi',
  title: 'Will the Fed cut in March?',
  markets: [
    {
      id: 'KXFED-26MAR-CUT',
      title: 'Will the Fed cut in March?',
      outcomes: [
        { pairKey: 'KXFED-26MAR-CUT', label: 'Yes', price: 0.37 },
        { pairKey: 'KXFED-26MAR-CUT-NO', label: 'No', price: 0.63 },
      ],
    },
  ],
}

const RACE: PredictionEventSummary = {
  id: '903193',
  market: 'polymarket',
  title: 'Who wins the 2028 Democratic nomination?',
  markets: [
    {
      id: '0xa',
      title: 'Will Gavin Newsom win?',
      shortTitle: 'Gavin Newsom',
      outcomes: [
        { pairKey: 'POLY-NEWSOM-YES', label: 'Yes', price: 0.31 },
        { pairKey: 'POLY-NEWSOM-NO', label: 'No', price: 0.69 },
      ],
    },
    {
      id: '0xb',
      title: 'Will Josh Shapiro win?',
      shortTitle: 'Josh Shapiro',
      outcomes: [
        { pairKey: 'POLY-SHAPIRO-YES', label: 'Yes', price: 0.14 },
        { pairKey: 'POLY-SHAPIRO-NO', label: 'No', price: 0.86 },
      ],
    },
    {
      id: '0xc',
      title: 'Will Pete Buttigieg win?',
      shortTitle: 'Pete Buttigieg',
      outcomes: [
        { pairKey: 'POLY-PETE-YES', label: 'Yes', price: 0.09 },
        { pairKey: 'POLY-PETE-NO', label: 'No', price: 0.91 },
      ],
    },
  ],
}

describe('resolveSelection — defaults', () => {
  test('a field opens on its favourite, so the board is tradeable on paint', () => {
    const selected = resolveSelection(runnersOf(RACE), RACE, '')
    expect(selected?.pairKey).toBe('POLY-NEWSOM-YES')
    expect(selected?.label).toBe('Yes')
    expect(selected?.market.shortTitle).toBe('Gavin Newsom')
  })

  test('a binary opens on Yes even when No is the side that is leading', () => {
    const selected = resolveSelection(runnersOf(BINARY), BINARY, '')
    expect(selected?.pairKey).toBe('KXFED-26MAR-CUT')
    expect(selected?.label).toBe('Yes')
  })

  test('an event with no runners selects nothing rather than guessing', () => {
    expect(resolveSelection([], BINARY, '')).toBeNull()
  })
})

describe('resolveSelection — the URL', () => {
  test('a leg the event publishes is honoured, so a link can be specific', () => {
    const selected = resolveSelection(runnersOf(RACE), RACE, 'POLY-PETE-YES')
    expect(selected?.pairKey).toBe('POLY-PETE-YES')
    expect(selected?.market.shortTitle).toBe('Pete Buttigieg')
  })

  test('the No side of a runner is reachable, not just the affirmative', () => {
    const selected = resolveSelection(
      runnersOf(BINARY),
      BINARY,
      'KXFED-26MAR-CUT-NO',
    )
    expect(selected?.label).toBe('No')
  })

  test('a key from some other question falls back rather than aiming the ticket at it', () => {
    const selected = resolveSelection(runnersOf(RACE), RACE, 'KXFED-26MAR-CUT')
    expect(selected?.pairKey).toBe('POLY-NEWSOM-YES')
  })

  test('the URL survives the casing a link is free to change', () => {
    const selected = resolveSelection(runnersOf(RACE), RACE, 'poly-pete-yes')
    expect(selected?.pairKey).toBe('POLY-PETE-YES')
  })
})
