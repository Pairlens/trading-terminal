// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event as a reader that cannot see the board would receive it.
 *
 * The screen block and `get_prediction_event` share this renderer, so what
 * is pinned here is what both of them say. The trims matter most: a model
 * told about eight of a hundred and twenty-eight runners is reading a
 * different market from one told about eight.
 */
import { describe, expect, test } from 'bun:test'

import {
  describePredictionEvent,
  readPredictionEvent,
} from '../assistant-summary'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'

function race(count: number, price = 0.1): PredictionEventSummary {
  return {
    id: 'race',
    market: 'polymarket',
    title: 'Who wins',
    markets: Array.from({ length: count }, (_, index) => ({
      id: `m${index}`,
      title: `Will runner ${index} win?`,
      shortTitle: `Runner ${index}`,
      outcomes: [
        { pairKey: `R${index}-YES`, label: 'Yes', price },
        { pairKey: `R${index}-NO`, label: 'No', price: 1 - price },
      ],
    })),
  }
}

const BINARY: PredictionEventSummary = {
  id: 'binary',
  market: 'kalshi',
  title: 'Will it rain',
  endMs: Date.UTC(2026, 8, 1),
  markets: [
    {
      id: 'm',
      title: 'Will it rain?',
      outcomes: [
        { pairKey: 'RAIN-YES', label: 'Yes', price: 0.42, ask: 0.44 },
        { pairKey: 'RAIN-NO', label: 'No', price: 0.58 },
      ],
    },
  ],
}

describe('readPredictionEvent', () => {
  test('trims the ladder and says what it trimmed from', () => {
    const reading = readPredictionEvent(race(128), 8)
    expect(reading.outcomeCount).toBe(128)
    expect(reading.runners).toHaveLength(8)
    expect(reading.runnersShown).toBe(8)
    expect(reading.truncated).toBe(true)
  })

  test('a binary market gets no field total', () => {
    // Two legs of one market sum to a dollar by construction. Reporting
    // that as an over-round invents an edge that is not there.
    expect(readPredictionEvent(BINARY).fieldTotal).toBeNull()
  })

  test('reports the sum of a real field, and what it was priced off', () => {
    const field = readPredictionEvent(race(4, 0.3)).fieldTotal
    expect(field?.sumOfYesPrices).toBe(1.2)
    expect(field?.edge).toBe(0.2)
    expect(field?.basis).toBe('last')
    expect(field?.pricedRunners).toBe(4)
  })

  test('a price the venue did not publish stays null, never zero', () => {
    const reading = readPredictionEvent({
      ...BINARY,
      markets: [
        {
          id: 'm',
          title: 'Will it rain?',
          outcomes: [{ pairKey: 'RAIN-YES', label: 'Yes' }],
        },
      ],
    })
    expect(reading.runners[0].yes).toBeNull()
    expect(reading.runners[0].yesPercent).toBeNull()
  })
})

describe('describePredictionEvent', () => {
  test('names the leg the ticket is pointed at, and its key', () => {
    const reading = readPredictionEvent(race(12))
    const line = describePredictionEvent(reading, {
      label: 'Runner 3',
      pairKey: 'R3-YES',
      price: 0.1,
    })
    expect(line).toContain('12-outcome field')
    expect(line).toContain('Runner 3')
    // The key is the whole point: a model that reads a price with no key
    // has nothing to hand place_order.
    expect(line).toContain('R3-YES')
    expect(line).toContain('10.0¢')
  })

  test('states the price units, because 0.195 and 19.5 are both plausible', () => {
    const line = describePredictionEvent(readPredictionEvent(BINARY), null)
    expect(line).toContain('binary market')
    expect(line).toContain('collateral units')
  })

  test('is dash-free house prose', () => {
    const line = describePredictionEvent(readPredictionEvent(race(3)), {
      label: 'Runner 0',
      pairKey: 'R0-YES',
      price: 0.1,
    })
    expect(line).not.toMatch(/[—–]/)
  })
})
