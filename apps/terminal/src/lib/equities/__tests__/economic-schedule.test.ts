// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  economicDayKind,
  filterByImportance,
  formatCalendarDay,
  formatReleaseClock,
  groupEconomicByDate,
  nextEconomicRelease,
} from '../economic-schedule'
import type { EconomicCalendarEntry } from '@pairlens/shared/instrument-types'

function entry(
  over: Partial<EconomicCalendarEntry> & Pick<EconomicCalendarEntry, 'id'>,
): EconomicCalendarEntry {
  return {
    title: 'Consumer Price Index',
    source: 'BLS',
    date: '2026-08-18',
    releaseMs: null,
    importance: 'high',
    country: 'US',
    ...over,
  }
}

describe('groupEconomicByDate', () => {
  it('groups by day, ascending, without re-sorting inside a day', () => {
    const groups = groupEconomicByDate([
      entry({ id: 'b', date: '2026-08-19', title: 'FOMC Minutes' }),
      entry({ id: 'a', date: '2026-08-18', title: 'Housing Starts' }),
      entry({ id: 'c', date: '2026-08-18', title: 'Import Prices' }),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-08-18', '2026-08-19'])
    // The server's order inside a day is the clock, so a group must keep it.
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(['a', 'c'])
  })

  it('is empty for no entries rather than a group of nothing', () => {
    expect(groupEconomicByDate([])).toEqual([])
  })
})

describe('economicDayKind', () => {
  it('measures against the window the server cut, not the browser clock', () => {
    expect(economicDayKind('2026-08-17', '2026-08-17')).toBe('today')
    expect(economicDayKind('2026-08-18', '2026-08-17')).toBe('tomorrow')
    expect(economicDayKind('2026-08-19', '2026-08-17')).toBe('later')
  })

  it('crosses a month and a year without arithmetic drift', () => {
    expect(economicDayKind('2026-09-01', '2026-08-31')).toBe('tomorrow')
    expect(economicDayKind('2027-01-01', '2026-12-31')).toBe('tomorrow')
  })
})

describe('nextEconomicRelease', () => {
  const now = Date.UTC(2026, 7, 18, 12, 0)

  it('picks the soonest release still ahead', () => {
    const id = nextEconomicRelease(
      [
        entry({ id: 'past', releaseMs: Date.UTC(2026, 7, 18, 11, 0) }),
        entry({ id: 'soon', releaseMs: Date.UTC(2026, 7, 18, 14, 0) }),
        entry({ id: 'later', releaseMs: Date.UTC(2026, 7, 18, 18, 0) }),
      ],
      now,
    )
    expect(id).toBe('soon')
  })

  it('never marks a day-level row next, because it has no moment', () => {
    // FOMC minutes and every Census indicator arrive with releaseMs null. One
    // of them highlighted as 'next' would be a countdown to nothing.
    expect(
      nextEconomicRelease([entry({ id: 'minutes', releaseMs: null })], now),
    ).toBeNull()
  })

  it('is null once everything in the window has printed', () => {
    expect(
      nextEconomicRelease(
        [entry({ id: 'past', releaseMs: Date.UTC(2026, 7, 18, 11, 0) })],
        now,
      ),
    ).toBeNull()
  })

  it('treats a release happening exactly now as gone', () => {
    expect(
      nextEconomicRelease([entry({ id: 'now', releaseMs: now })], now),
    ).toBeNull()
  })
})

describe('filterByImportance', () => {
  const entries = [
    entry({ id: 'h', importance: 'high' }),
    entry({ id: 'm', importance: 'medium' }),
    entry({ id: 'l', importance: 'low' }),
  ]

  it('keeps everything at the low floor', () => {
    expect(filterByImportance(entries, 'low').map((e) => e.id)).toEqual([
      'h',
      'm',
      'l',
    ])
  })

  it('is a floor, not an equality: medium keeps high too', () => {
    expect(filterByImportance(entries, 'medium').map((e) => e.id)).toEqual([
      'h',
      'm',
    ])
    expect(filterByImportance(entries, 'high').map((e) => e.id)).toEqual(['h'])
  })
})

describe('formatReleaseClock', () => {
  it('reads the Eastern clock, not the host timezone', () => {
    // 12:30Z is 08:30 EDT: the summer half of the year.
    expect(formatReleaseClock(Date.UTC(2026, 7, 12, 12, 30))).toBe('08:30')
    // 13:30Z is the same 08:30, in EST.
    expect(formatReleaseClock(Date.UTC(2026, 10, 10, 13, 30))).toBe('08:30')
    // The FOMC statement, both sides of the transition.
    expect(formatReleaseClock(Date.UTC(2026, 8, 16, 18, 0))).toBe('14:00')
    expect(formatReleaseClock(Date.UTC(2026, 11, 9, 19, 0))).toBe('14:00')
  })
})

describe('formatCalendarDay', () => {
  it('prints the date as written, not the day before', () => {
    // A calendar date is not an instant. Rendering its midnight in a zone west
    // of UTC would show the 17th for a row the server dated the 18th.
    expect(formatCalendarDay('2026-08-18', 'en-US')).toBe('Tue, Aug 18')
  })

  it('returns the input when the date is not one', () => {
    expect(formatCalendarDay('not-a-date', 'en-US')).toBe('not-a-date')
  })
})
