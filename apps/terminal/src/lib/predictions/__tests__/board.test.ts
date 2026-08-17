// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Board flattening, ordering and the resolution clock.
 *
 * The orderings are where a missing value does damage: treating "no published
 * volume" as zero buries a busy event under a dead one, and treating "no close
 * published" as now puts an open-ended question at the top of a pane whose
 * whole premise is the countdown.
 */
import { describe, expect, test } from 'bun:test'

import {
  collectResolvingSoon,
  endOf,
  eventVolume,
  flattenBoardEvents,
  sortBoardEvents,
} from '../board'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'
import type { PredictionVenueResult } from '@/hooks/use-prediction-events'

const NOW = 1_700_000_000_000
const HOUR = 3_600_000

function evt(
  id: string,
  extra: Partial<PredictionEventSummary> = {},
): PredictionEventSummary {
  return {
    id,
    market: 'polymarket',
    title: `Will ${id} happen?`,
    category: 'Economics',
    markets: [
      {
        id: `${id}-m`,
        title: `Will ${id} happen?`,
        outcomes: [
          { pairKey: `${id}-YES`, label: 'Yes', price: 0.4 },
          { pairKey: `${id}-NO`, label: 'No', price: 0.6 },
        ],
      },
    ],
    ...extra,
  }
}

function venue(
  events: Array<PredictionEventSummary>,
  extra: Partial<PredictionVenueResult> = {},
): PredictionVenueResult {
  return {
    market: 'polymarket',
    label: 'Polymarket',
    events,
    error: null,
    desktopOnly: false,
    ...extra,
  }
}

describe('flattenBoardEvents', () => {
  test('keeps the venue with every event', () => {
    const rows = flattenBoardEvents([venue([evt('a'), evt('b')])], {
      category: null,
      query: '',
    })
    expect(rows.map((r) => r.key)).toEqual(['polymarket:a', 'polymarket:b'])
    expect(rows[0].venueLabel).toBe('Polymarket')
  })

  test('drops venues that refused — their state is shown elsewhere', () => {
    expect(
      flattenBoardEvents(
        [venue([evt('a')], { desktopOnly: true, events: [] })],
        { category: null, query: '' },
      ),
    ).toEqual([])
  })

  test('matches a market question, not only the heading', () => {
    const ladder = evt('cpi', {
      title: 'CPI in August',
      markets: [
        {
          id: 'cpi-3',
          title: 'CPI in August',
          shortTitle: 'Above 3.0%',
          outcomes: [{ pairKey: 'CPI-3-YES', label: 'Yes', price: 0.1 }],
        },
      ],
    })
    expect(
      flattenBoardEvents([venue([ladder])], { category: null, query: '3.0' }),
    ).toHaveLength(1)
  })

  test('narrows by category', () => {
    const rows = flattenBoardEvents(
      [venue([evt('a'), evt('b', { category: 'Crypto' })])],
      { category: 'Crypto', query: '' },
    )
    expect(rows.map((r) => r.event.id)).toEqual(['b'])
  })
})

describe('sortBoardEvents', () => {
  test('trending is the venue order, untouched', () => {
    const rows = flattenBoardEvents([venue([evt('a'), evt('b')])], {
      category: null,
      query: '',
    })
    expect(sortBoardEvents(rows, 'trending')).toBe(rows)
  })

  test('volume ranks by size and sinks the unpublished', () => {
    const rows = flattenBoardEvents(
      [
        venue([
          evt('quiet', { volume: 10 }),
          evt('unknown'),
          evt('busy', { volume: 900 }),
        ]),
      ],
      { category: null, query: '' },
    )
    expect(sortBoardEvents(rows, 'volume').map((r) => r.event.id)).toEqual([
      'busy',
      'quiet',
      'unknown',
    ])
  })

  test('ending soon sinks events with no published close', () => {
    const rows = flattenBoardEvents(
      [
        venue([
          evt('later', { endMs: NOW + 40 * HOUR }),
          evt('open-ended'),
          evt('imminent', { endMs: NOW + HOUR }),
        ]),
      ],
      { category: null, query: '' },
    )
    expect(sortBoardEvents(rows, 'endingSoon').map((r) => r.event.id)).toEqual([
      'imminent',
      'later',
      'open-ended',
    ])
  })

  test('biggest move ranks by the largest move in the event', () => {
    const moved = evt('moved')
    moved.markets[0].outcomes[0].change24h = 0.14
    const nudged = evt('nudged')
    nudged.markets[0].outcomes[0].change24h = 0.01
    const rows = flattenBoardEvents([venue([nudged, evt('still'), moved])], {
      category: null,
      query: '',
    })
    expect(sortBoardEvents(rows, 'biggestMove').map((r) => r.event.id)).toEqual(
      ['moved', 'nudged', 'still'],
    )
  })
})

describe('endOf / eventVolume', () => {
  test('falls back to the soonest market close', () => {
    const e = evt('x')
    e.markets = [
      { ...e.markets[0], id: 'm1', endMs: NOW + 5 * HOUR },
      { ...e.markets[0], id: 'm2', endMs: NOW + HOUR },
    ]
    expect(endOf(e)).toBe(NOW + HOUR)
  })

  test('sums market volume when the event publishes none', () => {
    const e = evt('x')
    e.markets = [
      { ...e.markets[0], id: 'm1', volume: 10 },
      { ...e.markets[0], id: 'm2', volume: 5 },
    ]
    expect(eventVolume(e)).toBe(15)
    expect(eventVolume(evt('y'))).toBeNull()
  })
})

describe('collectResolvingSoon', () => {
  test('one row per event, sorted by the clock', () => {
    const rows = collectResolvingSoon(
      [
        venue([
          evt('later', { endMs: NOW + 40 * HOUR }),
          evt('soon', { endMs: NOW + 2 * HOUR }),
        ]),
      ],
      { category: null, limit: 10, now: NOW },
    )
    expect(rows.map((r) => r.event.id)).toEqual(['soon', 'later'])
    expect(rows[0].price).toBe(0.4)
  })

  test('collapses a ladder to its soonest market and says which strike', () => {
    const ladder = evt('cpi', {
      title: 'CPI in August',
      endMs: NOW + 10 * HOUR,
      markets: [
        {
          id: 'a',
          title: 'CPI',
          shortTitle: 'Above 3.0%',
          endMs: NOW + 10 * HOUR,
          outcomes: [{ pairKey: 'A-YES', label: 'Yes', price: 0.1 }],
        },
        {
          id: 'b',
          title: 'CPI',
          shortTitle: 'Above 2.5%',
          endMs: NOW + 6 * HOUR,
          outcomes: [{ pairKey: 'B-YES', label: 'Yes', price: 0.6 }],
        },
        {
          id: 'c',
          title: 'CPI',
          shortTitle: 'Above 2.0%',
          endMs: NOW + 12 * HOUR,
          outcomes: [{ pairKey: 'C-YES', label: 'Yes', price: 0.9 }],
        },
      ],
    })
    const rows = collectResolvingSoon([venue([ladder])], {
      category: null,
      limit: 10,
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].marketSummary.id).toBe('b')
    expect(rows[0].title).toBe('CPI in August · Above 2.5%')
  })

  test('drops what has already settled', () => {
    expect(
      collectResolvingSoon([venue([evt('done', { endMs: NOW - HOUR })])], {
        category: null,
        limit: 10,
        now: NOW,
      }),
    ).toEqual([])
  })

  test('drops what publishes no close at all', () => {
    expect(
      collectResolvingSoon([venue([evt('open-ended')])], {
        category: null,
        limit: 10,
        now: NOW,
      }),
    ).toEqual([])
  })
})
