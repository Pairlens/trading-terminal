// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  daysUntilDate,
  formatCompactCount,
  formatCompactMoney,
  formatMoneyPrecise,
  formatPercentFraction,
  formatRatio,
  formatSectorLabel,
  formatSignedPercentFraction,
  joinValues,
  summarizeAnalystRatings,
} from '../company-format'

describe('formatCompactMoney', () => {
  it('abbreviates in the reporting currency, keeping three digits', () => {
    // One fraction digit would round this to '$3T'.
    expect(formatCompactMoney(2_980_000_000_000, 'USD')).toBe('$2.98T')
    expect(formatCompactMoney(113_269_000_000, 'USD')).toBe('$113B')
  })

  it('falls back to a suffixed code when Intl rejects the currency', () => {
    // Intl throws on a code that is not three letters; a provider shipping one
    // must not take the cell out.
    expect(formatCompactMoney(1_200_000_000, 'US')).toBe('1.2B US')
    expect(formatCompactMoney(1_200_000_000, null)).toBe('1.2B')
  })

  it('absent stays absent', () => {
    expect(formatCompactMoney(null, 'USD')).toBeNull()
    expect(formatCompactMoney(Number.NaN, 'USD')).toBeNull()
  })
})

describe('formatRatio', () => {
  it('follows magnitude: hundredths under ten, tenths above', () => {
    expect(formatRatio(42.11)).toBe('42.1')
    expect(formatRatio(0.784)).toBe('0.78')
    expect(formatRatio(-13.42)).toBe('-13.4')
    expect(formatRatio(null)).toBeNull()
  })
})

describe('formatPercentFraction', () => {
  it('reads a fraction as a percentage', () => {
    expect(formatPercentFraction(0.559)).toBe('55.9%')
    expect(formatPercentFraction(1.196)).toBe('119.6%')
  })

  it('keeps a tiny yield visible instead of rounding it to nothing', () => {
    // 0.03% is what a dividend payer of this size actually yields; '0.0%'
    // would tell the reader it pays nothing.
    expect(formatPercentFraction(0.0003)).toBe('0.03%')
    expect(formatPercentFraction(-0.004)).toBe('-0.40%')
  })

  it('signs growth, and only when it is positive', () => {
    expect(formatSignedPercentFraction(1.222)).toBe('+122.2%')
    expect(formatSignedPercentFraction(-0.084)).toBe('-8.4%')
    expect(formatSignedPercentFraction(0)).toBe('0.00%')
    expect(formatSignedPercentFraction(null)).toBeNull()
  })
})

describe('formatCompactCount and formatMoneyPrecise', () => {
  it('counts abbreviate, prices do not', () => {
    expect(formatCompactCount(24_400_000_000)).toBe('24.4B')
    expect(formatMoneyPrecise(2.88, 'USD')).toBe('$2.88')
    expect(formatMoneyPrecise(149.6, 'US')).toBe('149.60 US')
    expect(formatMoneyPrecise(null, 'USD')).toBeNull()
  })
})

describe('formatSectorLabel', () => {
  it('stops the provider shouting', () => {
    expect(formatSectorLabel('TECHNOLOGY')).toBe('Technology')
    expect(formatSectorLabel('SEMICONDUCTORS & RELATED DEVICES')).toBe(
      'Semiconductors & Related Devices',
    )
    expect(formatSectorLabel('REAL ESTATE & CONSTRUCTION')).toBe(
      'Real Estate & Construction',
    )
  })

  it('leaves anything already cased alone', () => {
    // Recasing mixed input is how 'NVIDIA Corp' becomes 'Nvidia Corp'.
    expect(formatSectorLabel('Life Sciences')).toBe('Life Sciences')
    expect(formatSectorLabel('iShares MSCI')).toBe('iShares MSCI')
    expect(formatSectorLabel(null)).toBeNull()
    expect(formatSectorLabel('   ')).toBeNull()
  })
})

describe('summarizeAnalystRatings', () => {
  it('collapses five buckets into the three a row shows', () => {
    expect(
      summarizeAnalystRatings({
        strongBuy: 18,
        buy: 39,
        hold: 5,
        sell: 1,
        strongSell: 2,
      }),
    ).toEqual({ buy: 57, hold: 5, sell: 3, total: 65 })
  })

  it('treats an absent bucket as nothing, not as a zero opinion', () => {
    expect(
      summarizeAnalystRatings({
        strongBuy: null,
        buy: 4,
        hold: null,
        sell: null,
        strongSell: null,
      }),
    ).toEqual({ buy: 4, hold: 0, sell: 0, total: 4 })
  })

  it('no coverage at all is null, not an empty bar', () => {
    expect(summarizeAnalystRatings(null)).toBeNull()
    expect(
      summarizeAnalystRatings({
        strongBuy: 0,
        buy: 0,
        hold: 0,
        sell: 0,
        strongSell: 0,
      }),
    ).toBeNull()
  })
})

describe('daysUntilDate', () => {
  const noon = Date.parse('2026-08-17T12:00:00Z')
  const lateEvening = Date.parse('2026-08-17T23:30:00Z')

  it('counts calendar days, not elapsed hours', () => {
    expect(daysUntilDate('2026-08-17', noon)).toBe(0)
    expect(daysUntilDate('2026-08-28', noon)).toBe(11)
    expect(daysUntilDate('2026-08-16', noon)).toBe(-1)
  })

  it('does not flip a day because the afternoon is late', () => {
    expect(daysUntilDate('2026-08-18', noon)).toBe(1)
    expect(daysUntilDate('2026-08-18', lateEvening)).toBe(1)
  })

  it('a date it cannot read is not a day count', () => {
    expect(Number.isNaN(daysUntilDate('not-a-date', noon))).toBe(true)
  })
})

describe('joinValues', () => {
  it('stacks the figures that arrived and nothing else', () => {
    expect(joinValues(['42.1', '31.6'])).toBe('42.1 · 31.6')
    expect(joinValues(['42.1', null])).toBe('42.1')
    expect(joinValues([null, null])).toBeNull()
  })
})
