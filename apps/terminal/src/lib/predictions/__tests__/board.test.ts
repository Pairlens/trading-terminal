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
  createdOf,
  endOf,
  eventLiquidity,
  eventOpenInterest,
  eventVolume,
  flattenBoardEvents,
  liveMarketCount,
  sortBoardEvents,
  sortEventSummaries,
} from '../board'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'
import type { PredictionVenueResult } from '@/hooks/use-prediction-events'

const NOW = 1_700_000_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

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

/** One market per listing timestamp, so an event can be a ladder that grew. */
function withCreated(
  event: PredictionEventSummary,
  created: Array<number>,
): PredictionEventSummary {
  return {
    ...event,
    markets: created.map((createdMs, index) => ({
      ...event.markets[0],
      id: `${event.id}-m${index}`,
      createdMs,
    })),
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

  test('new ranks by the most recently listed market', () => {
    const rows = flattenBoardEvents(
      [
        venue([
          withCreated(evt('older'), [NOW - 30 * DAY]),
          withCreated(evt('fresh'), [NOW - HOUR]),
          withCreated(evt('midweek'), [NOW - 3 * DAY]),
        ]),
      ],
      { category: null, query: '' },
    )
    expect(sortBoardEvents(rows, 'new').map((r) => r.event.id)).toEqual([
      'fresh',
      'midweek',
      'older',
    ])
  })

  test('new sinks events whose venue published no listing time', () => {
    // The bug this prevents: a missing timestamp read as 0 would date the event
    // to 1970 and pin it under every real row, which looks like a sort that
    // ranked it last rather than a venue that said nothing.
    const rows = flattenBoardEvents(
      [
        venue([
          evt('silent'),
          withCreated(evt('listed'), [NOW - 5 * DAY]),
          withCreated(evt('newest'), [NOW - HOUR]),
        ]),
      ],
      { category: null, query: '' },
    )
    expect(sortBoardEvents(rows, 'new').map((r) => r.event.id)).toEqual([
      'newest',
      'listed',
      'silent',
    ])
  })

  test('new reads a ladder by its newest strike, not its first', () => {
    const rows = flattenBoardEvents(
      [
        venue([
          withCreated(evt('single'), [NOW - 2 * DAY]),
          // Opened a month ago, gained a strike an hour ago: new to trade.
          withCreated(evt('ladder'), [NOW - 30 * DAY, NOW - HOUR]),
        ]),
      ],
      { category: null, query: '' },
    )
    expect(sortBoardEvents(rows, 'new').map((r) => r.event.id)).toEqual([
      'ladder',
      'single',
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

describe('sortEventSummaries', () => {
  test('orders a bare event list the way the board orders its rows', () => {
    const events = [
      withCreated(evt('older'), [NOW - 30 * DAY]),
      evt('silent'),
      withCreated(evt('fresh'), [NOW - HOUR]),
    ]
    expect(sortEventSummaries(events, 'new').map((e) => e.id)).toEqual([
      'fresh',
      'older',
      'silent',
    ])
  })

  test('leaves the venue order alone, same as the board', () => {
    const events = [evt('a'), evt('b')]
    expect(sortEventSummaries(events, 'trending')).toBe(events)
  })
})

describe('createdOf', () => {
  test('reads the newest market in the event', () => {
    expect(createdOf(withCreated(evt('x'), [NOW - 9 * DAY, NOW - DAY]))).toBe(
      NOW - DAY,
    )
  })

  test('says nothing when no market carries a listing time', () => {
    expect(createdOf(evt('x'))).toBeNull()
  })

  test('refuses an epoch-zero timestamp rather than dating the event to 1970', () => {
    expect(createdOf(withCreated(evt('x'), [0]))).toBeNull()
    expect(createdOf(withCreated(evt('x'), [0, NOW - DAY]))).toBe(NOW - DAY)
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

describe('liveMarketCount', () => {
  test('counts markets, because a market is what a search can find', () => {
    // The board's search box said "Search 30 live markets" over thirty events
    // carrying hundreds of questions, and the first thing anyone types is a
    // candidate name that lives on one of them.
    const race = evt('nominee', {
      markets: Array.from({ length: 12 }, (_, i) => ({
        id: `runner-${i}`,
        title: `Runner ${i}`,
        outcomes: [{ pairKey: `R${i}-YES`, label: 'Yes', price: 0.08 }],
      })),
    })
    expect(liveMarketCount([venue([evt('a'), race])])).toBe(13)
  })

  test('does not count a venue that refused', () => {
    expect(
      liveMarketCount([
        venue([evt('a')]),
        venue([evt('b')], { market: 'kalshi', desktopOnly: true, events: [] }),
      ]),
    ).toBe(1)
  })

  test('is zero before anything answers', () => {
    expect(liveMarketCount(undefined)).toBe(0)
  })
})

describe('eventLiquidity and eventOpenInterest', () => {
  test('take the event figure first, then the sum of its markets', () => {
    expect(eventLiquidity(evt('a', { liquidity: 1_200_000 }))).toBe(1_200_000)
    const summed = evt('b', {
      markets: [
        {
          id: 'm1',
          title: 'q',
          outcomes: [],
          liquidity: 400,
          openInterest: 90,
        },
        {
          id: 'm2',
          title: 'q',
          outcomes: [],
          liquidity: 600,
          openInterest: 10,
        },
      ],
    })
    expect(eventLiquidity(summed)).toBe(1000)
    expect(eventOpenInterest(summed)).toBe(100)
  })

  test('are null when nothing states them, never zero', () => {
    // Zero is a claim about a market. Absent is a claim about the venue.
    expect(eventLiquidity(evt('a'))).toBeNull()
    expect(eventOpenInterest(evt('a'))).toBeNull()
  })
})
