// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { hasEconomicFigures } from '../calendar-figures'
import type { EconomicCalendarEntry } from '@pairlens/shared/instrument-types'

function release(
  over: Partial<EconomicCalendarEntry> = {},
): EconomicCalendarEntry {
  return {
    id: 'bls:consumer-price-index:2026-09-11',
    title: 'Consumer Price Index',
    source: 'BLS',
    date: '2026-09-11',
    releaseMs: Date.parse('2026-09-11T12:30:00Z'),
    importance: 'high',
    country: 'US',
    ...over,
  }
}

describe('hasEconomicFigures', () => {
  it('is false for a schedule-only window, so no columns are drawn', () => {
    // A self-hosted App Server with no enrichment keys, or an older one: the
    // calendar is still correct, it just has dates and no figures. Three
    // columns of dashes is the thing this pane refuses to become.
    expect(hasEconomicFigures([release(), release({ id: 'b' })])).toBe(false)
    expect(hasEconomicFigures([])).toBe(false)
  })

  it('is true when any single row carries any single figure', () => {
    expect(hasEconomicFigures([release({ actual: '3.4%' })])).toBe(true)
    expect(hasEconomicFigures([release({ prior: '3.6%' })])).toBe(true)
    expect(hasEconomicFigures([release({ implied: '3.3%' })])).toBe(true)
    // The common real case: most of a federal calendar is county employment
    // tables with no figure, and one CPI row with all three.
    expect(
      hasEconomicFigures([
        release({ id: 'a', title: 'County Employment and Wages' }),
        release({ id: 'b', actual: '3.4%', prior: '3.6%', implied: '3.3%' }),
      ]),
    ).toBe(true)
  })

  it('treats an empty string as no figure, because it is not a value', () => {
    expect(
      hasEconomicFigures([release({ actual: '', prior: '', implied: '' })]),
    ).toBe(false)
  })
})
