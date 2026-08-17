// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The movers board's three de-noising rules.
 *
 * Each of them exists because the naive list is unreadable in a specific way:
 * both legs of one market as two rows, a 128-runner race owning the pane, and
 * a venue that publishes no move at all looking like a quiet venue.
 */
import { describe, expect, test } from 'bun:test'

import { collectOddsMovers, eventTopMove } from '../movers'
import type { PredictionVenueResult } from '@/hooks/use-prediction-events'

function venue(
  market: string,
  events: PredictionVenueResult['events'],
  extra: Partial<PredictionVenueResult> = {},
): PredictionVenueResult {
  return {
    market,
    label: market[0].toUpperCase() + market.slice(1),
    events,
    error: null,
    desktopOnly: false,
    ...extra,
  }
}

function binary(
  id: string,
  price: number,
  change: number | undefined,
  category = 'Economics',
): PredictionVenueResult['events'][number] {
  return {
    id: `evt-${id}`,
    market: 'polymarket',
    title: `Will ${id}?`,
    category,
    markets: [
      {
        id,
        title: `Will ${id}?`,
        outcomes: [
          {
            pairKey: `${id}-YES`,
            label: 'Yes',
            price,
            ...(change !== undefined ? { change24h: change } : {}),
          },
          {
            pairKey: `${id}-NO`,
            label: 'No',
            price: 1 - price,
            ...(change !== undefined ? { change24h: -change } : {}),
          },
        ],
      },
    ],
  }
}

describe('collectOddsMovers', () => {
  test('reports one row per market, not one per leg', () => {
    const { rows } = collectOddsMovers(
      [venue('polymarket', [binary('fed', 0.78, 0.14)])],
      {
        category: null,
        limit: 10,
      },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].outcome.label).toBe('Yes')
    expect(rows[0].change).toBeCloseTo(0.14, 10)
    expect(rows[0].previous).toBeCloseTo(0.64, 10)
  })

  test('ranks by the size of the move, not by probability', () => {
    const { rows } = collectOddsMovers(
      [
        venue('polymarket', [
          binary('small', 0.9, 0.01),
          binary('big', 0.21, -0.06),
          binary('mid', 0.31, 0.04),
        ]),
      ],
      { category: null, limit: 10 },
    )
    expect(rows.map((r) => r.marketSummary.id)).toEqual(['big', 'mid', 'small'])
  })

  test('caps a race at two rows so it cannot own the pane', () => {
    const race = {
      id: 'evt-race',
      market: 'polymarket',
      title: 'Who wins?',
      markets: Array.from({ length: 20 }, (_, i) => ({
        id: `runner-${i}`,
        title: `Runner ${i}`,
        outcomes: [
          {
            pairKey: `RUNNER-${i}-YES`,
            label: 'Yes',
            price: 0.1,
            change24h: 0.05 - i * 0.001,
          },
        ],
      })),
    }
    const { rows } = collectOddsMovers([venue('polymarket', [race])], {
      category: null,
      limit: 50,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].marketSummary.id).toBe('runner-0')
  })

  test('names a venue that answered but publishes no move, and drops its rows', () => {
    const { rows, venuesWithoutChange } = collectOddsMovers(
      [
        venue('polymarket', [binary('fed', 0.78, 0.14)]),
        venue('kalshi', [binary('cpi', 0.4, undefined)]),
      ],
      { category: null, limit: 10 },
    )
    expect(rows.map((r) => r.market)).toEqual(['polymarket'])
    expect(venuesWithoutChange).toEqual(['Kalshi'])
  })

  test('says nothing about a venue that refused — its silence is already shown', () => {
    const { venuesWithoutChange } = collectOddsMovers(
      [venue('kalshi', [], { desktopOnly: true })],
      { category: null, limit: 10 },
    )
    expect(venuesWithoutChange).toEqual([])
  })

  test('drops a market that did not move rather than listing it at zero', () => {
    const { rows, venuesWithoutChange } = collectOddsMovers(
      [venue('polymarket', [binary('flat', 0.5, 0)])],
      { category: null, limit: 10 },
    )
    expect(rows).toEqual([])
    // It DID publish a move; it just happened to be zero.
    expect(venuesWithoutChange).toEqual([])
  })

  test('narrows to the selected category', () => {
    const { rows } = collectOddsMovers(
      [
        venue('polymarket', [
          binary('fed', 0.78, 0.14, 'Economics'),
          binary('btc', 0.21, -0.2, 'Crypto'),
        ]),
      ],
      { category: 'Crypto', limit: 10 },
    )
    expect(rows.map((r) => r.marketSummary.id)).toEqual(['btc'])
  })

  test('refuses a price that is not a probability', () => {
    const broken = binary('weird', 0.5, 0.1)
    broken.markets[0].outcomes[0].price = 1.4
    const { rows } = collectOddsMovers([venue('polymarket', [broken])], {
      category: null,
      limit: 10,
    })
    expect(rows).toEqual([])
  })
})

describe('eventTopMove', () => {
  test('is the biggest absolute move anywhere in the event', () => {
    expect(eventTopMove(binary('fed', 0.78, -0.14))).toBeCloseTo(0.14, 10)
  })

  test('is zero when nothing in the event publishes a move', () => {
    expect(eventTopMove(binary('fed', 0.78, undefined))).toBe(0)
  })
})
