// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  earningsDayKind,
  groupEarningsByDate,
  groupEarningsBySlot,
} from '../earnings-schedule'
import type { EarningsCalendarEntry } from '@pairlens/shared/instrument-types'

function entry(
  symbol: string,
  reportDate: string,
  epsEstimate: number | null = null,
  reportTime?: EarningsCalendarEntry['reportTime'],
): EarningsCalendarEntry {
  return {
    symbol,
    name: `${symbol} Inc`,
    reportDate,
    fiscalDateEnding: '2026-07-31',
    epsEstimate,
    currency: 'USD',
    ...(reportTime ? { reportTime } : {}),
  }
}

describe('groupEarningsByDate', () => {
  it('groups by day, days ascending', () => {
    const groups = groupEarningsByDate([
      entry('WMT', '2026-08-21'),
      entry('CRM', '2026-08-27'),
      entry('NVDA', '2026-08-27', 0.74),
      entry('DE', '2026-11-26'),
    ])

    expect(groups.map((g) => g.date)).toEqual([
      '2026-08-21',
      '2026-08-27',
      '2026-11-26',
    ])
    expect(groups[1].entries.map((e) => e.symbol)).toEqual(['CRM', 'NVDA'])
  })

  it('keeps the server order inside a day, so a refresh does not reshuffle', () => {
    const groups = groupEarningsByDate([
      entry('CRM', '2026-08-27'),
      entry('AAPL', '2026-08-27'),
    ])
    expect(groups[0].entries.map((e) => e.symbol)).toEqual(['CRM', 'AAPL'])
  })

  it('an empty window has no groups', () => {
    expect(groupEarningsByDate([])).toEqual([])
  })
})

describe('groupEarningsBySlot', () => {
  it('reads a day forwards: before the bell, after the close, then unstated', () => {
    const groups = groupEarningsBySlot([
      entry('NVDA', '2026-08-27', 0.74, 'amc'),
      entry('ZZZ', '2026-08-27'),
      entry('WMT', '2026-08-27', 0.67, 'bmo'),
    ])
    expect(groups.map((g) => g.slot)).toEqual(['bmo', 'amc', 'unstated'])
    expect(groups[0].entries.map((e) => e.symbol)).toEqual(['WMT'])
    expect(groups[2].entries.map((e) => e.symbol)).toEqual(['ZZZ'])
  })

  it('keeps the server order inside a slot', () => {
    const groups = groupEarningsBySlot([
      entry('CRM', '2026-08-27', null, 'amc'),
      entry('AAPL', '2026-08-27', null, 'amc'),
    ])
    expect(groups[0].entries.map((e) => e.symbol)).toEqual(['CRM', 'AAPL'])
  })

  it('omits slots nobody is in rather than heading an empty list', () => {
    const groups = groupEarningsBySlot([
      entry('WMT', '2026-08-27', 0.67, 'bmo'),
    ])
    expect(groups.map((g) => g.slot)).toEqual(['bmo'])
  })

  // The slot is what a trader positions on. A row nobody stated one for gets
  // its own bucket, never the more plausible neighbour's.
  it('never folds an unstated row into a stated slot', () => {
    const groups = groupEarningsBySlot([
      entry('AAA', '2026-08-27'),
      entry('BBB', '2026-08-27', null, 'bmo'),
    ])
    expect(groups.map((g) => g.slot)).toEqual(['bmo', 'unstated'])
    expect(groups.find((g) => g.slot === 'unstated')!.entries).toHaveLength(1)
  })

  it('an empty day has no slots', () => {
    expect(groupEarningsBySlot([])).toEqual([])
  })
})

describe('earningsDayKind', () => {
  const noon = Date.parse('2026-08-17T12:00:00Z')

  it('names today and tomorrow, and only those', () => {
    expect(earningsDayKind('2026-08-17', noon)).toBe('today')
    expect(earningsDayKind('2026-08-18', noon)).toBe('tomorrow')
    expect(earningsDayKind('2026-08-19', noon)).toBe('later')
    expect(earningsDayKind('2026-08-16', noon)).toBe('past')
  })

  it('crosses a month end without inventing a day', () => {
    const monthEnd = Date.parse('2026-08-31T09:00:00Z')
    expect(earningsDayKind('2026-09-01', monthEnd)).toBe('tomorrow')
    expect(earningsDayKind('2026-08-31', monthEnd)).toBe('today')
  })
})
