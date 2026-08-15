// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  desktopOnlyLabels,
  eventEndMs,
  mergePredictionEvents,
  shouldNameVenues,
} from '../lib/prediction-preview'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'
import type { PredictionVenueResult } from '@/hooks/use-prediction-events'

const NOW = 1_700_000_000_000
const HOUR = 3_600_000

function event(
  id: string,
  extra: Partial<PredictionEventSummary> = {},
): PredictionEventSummary {
  return {
    id,
    market: 'polymarket',
    title: id,
    markets: [
      {
        id: `${id}-m`,
        title: id,
        outcomes: [{ pairKey: `${id}-YES`, label: 'Yes', price: 0.62 }],
      },
    ],
    endMs: NOW + HOUR,
    ...extra,
  }
}

function venue(
  market: string,
  events: Array<PredictionEventSummary>,
  extra: Partial<PredictionVenueResult> = {},
): PredictionVenueResult {
  return {
    market,
    label: market,
    events,
    error: null,
    desktopOnly: false,
    ...extra,
  }
}

describe('mergePredictionEvents', () => {
  test('leads with each venue busiest first', () => {
    const rows = mergePredictionEvents(
      [
        venue('polymarket', [
          event('quiet', { volume: 10 }),
          event('busy', { volume: 900 }),
        ]),
      ],
      0,
      NOW,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['busy', 'quiet'])
  })

  test('breaks a volume tie with the soonest resolution', () => {
    const rows = mergePredictionEvents(
      [
        venue('polymarket', [
          event('later', { endMs: NOW + 5 * HOUR }),
          event('sooner', { endMs: NOW + HOUR }),
        ]),
      ],
      0,
      NOW,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['sooner', 'later'])
  })

  test('interleaves venues so one cannot crowd out the other', () => {
    // Polymarket quotes volume in a far larger unit here; a global sort by it
    // would hand every row to Polymarket and Kalshi would never appear.
    const rows = mergePredictionEvents(
      [
        venue('polymarket', [
          event('p1', { volume: 900_000 }),
          event('p2', { volume: 800_000 }),
        ]),
        venue('kalshi', [
          event('k1', { volume: 40 }),
          event('k2', { volume: 30 }),
        ]),
      ],
      0,
      NOW,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['p1', 'k1', 'p2', 'k2'])
    expect(rows.map((r) => r.market)).toEqual([
      'polymarket',
      'kalshi',
      'polymarket',
      'kalshi',
    ])
  })

  test('caps at the limit, still interleaved', () => {
    const rows = mergePredictionEvents(
      [
        venue('polymarket', [event('p1'), event('p2'), event('p3')]),
        venue('kalshi', [event('k1'), event('k2')]),
      ],
      3,
      NOW,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['p1', 'k1', 'p2'])
  })

  test('drops resolved events and events with no outcome to tap', () => {
    const rows = mergePredictionEvents(
      [
        venue('polymarket', [
          event('past', { endMs: NOW - HOUR }),
          event('empty', { markets: [] }),
          event('outcomeless', {
            markets: [{ id: 'x', title: 'x', outcomes: [] }],
          }),
          event('open'),
        ]),
      ],
      0,
      NOW,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['open'])
  })

  test('keeps an event with no end date at all', () => {
    const rows = mergePredictionEvents(
      [venue('polymarket', [event('undated', { endMs: undefined })])],
      0,
      NOW,
    )
    expect(rows.map((r) => r.event.id)).toEqual(['undated'])
  })

  test('a venue that refused or needs the desktop contributes nothing', () => {
    const rows = mergePredictionEvents(
      [
        venue('kalshi', [], { desktopOnly: true }),
        venue('polymarket', [], { error: 'boom' }),
      ],
      0,
      NOW,
    )
    expect(rows).toEqual([])
  })

  test('undefined results are an empty board, not a throw', () => {
    expect(mergePredictionEvents(undefined, 5, NOW)).toEqual([])
  })
})

describe('eventEndMs', () => {
  test('falls back to the first market when the event carries no date', () => {
    const summary = event('e', { endMs: undefined })
    summary.markets[0].endMs = NOW + 2 * HOUR
    expect(eventEndMs(summary)).toBe(NOW + 2 * HOUR)
  })
})

describe('desktopOnlyLabels', () => {
  test('names only the venues a browser cannot reach', () => {
    expect(
      desktopOnlyLabels([
        venue('kalshi', [], { label: 'Kalshi', desktopOnly: true }),
        venue('polymarket', [event('p1')], { label: 'Polymarket' }),
      ]),
    ).toEqual(['Kalshi'])
  })
})

describe('shouldNameVenues', () => {
  test('stays quiet when every row came from the same venue', () => {
    const rows = mergePredictionEvents(
      [venue('polymarket', [event('p1'), event('p2')])],
      0,
      NOW,
    )
    expect(shouldNameVenues(rows)).toBe(false)
  })

  test('names them once two venues actually contributed', () => {
    const rows = mergePredictionEvents(
      [venue('polymarket', [event('p1')]), venue('kalshi', [event('k1')])],
      0,
      NOW,
    )
    expect(shouldNameVenues(rows)).toBe(true)
  })
})
