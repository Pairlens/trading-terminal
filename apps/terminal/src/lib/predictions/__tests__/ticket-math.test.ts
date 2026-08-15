// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The cents ↔ dollars boundary and the max-loss reading, tested here rather
 * than through the 1400-line ticket that renders them. A regression in either
 * is a wrong order or a wrong number next to a confirm button.
 */
import { describe, expect, it } from 'bun:test'

import {
  centsToPrice,
  normalizeContracts,
  predictionMaxLoss,
  predictionSibling,
  priceToCents,
} from '../ticket-math'
import type { PredictionDirectoryEntry } from '@/stores/prediction-directory-store'

describe('centsToPrice', () => {
  it('converts a cents field to the dollar price the connector expects', () => {
    expect(centsToPrice('53')).toBe(0.53)
    expect(centsToPrice(7)).toBeCloseTo(0.07, 10)
    expect(centsToPrice('0.5')).toBeCloseTo(0.005, 10)
  })

  it('keeps sub-cent precision inside the range', () => {
    expect(centsToPrice('0.01')).toBeCloseTo(0.0001, 10)
    expect(centsToPrice('99.9')).toBeCloseTo(0.999, 10)
  })

  it('REFUSES out of range instead of clamping — this is the safety property', () => {
    // A `60000` left in the field by a BTC-USDT draft used to clamp to 0.999
    // and submit a buy at the venue's worst offer.
    expect(centsToPrice('60000')).toBeNull()
    expect(centsToPrice('100')).toBeNull()
    expect(centsToPrice('250')).toBeNull()
    expect(centsToPrice('0')).toBeNull()
    expect(centsToPrice('-4')).toBeNull()
  })

  it('refuses a field that cannot be a number at all', () => {
    expect(centsToPrice('')).toBeNull()
    expect(centsToPrice('abc')).toBeNull()
    expect(centsToPrice(Number.NaN)).toBeNull()
    expect(centsToPrice(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('priceToCents', () => {
  it('is the inverse for whole cents', () => {
    expect(priceToCents(0.53)).toBe(53)
    expect(priceToCents(0.07)).toBe(7)
  })

  it('keeps a tenth of a cent, which Polymarket quotes', () => {
    expect(priceToCents(0.005)).toBe(0.5)
    expect(priceToCents(0.1234)).toBe(12.3)
  })
})

describe('normalizeContracts', () => {
  it('floors to whole contracts', () => {
    expect(normalizeContracts('3.9')).toBe('3')
    expect(normalizeContracts(12)).toBe('12')
  })

  it('empties anything that is not a positive count', () => {
    expect(normalizeContracts('0')).toBe('')
    expect(normalizeContracts('-2')).toBe('')
    expect(normalizeContracts('')).toBe('')
  })
})

describe('predictionMaxLoss', () => {
  it('a buy risks the premium', () => {
    expect(
      predictionMaxLoss({ contracts: 10, price: 0.53, side: 'buy' }),
    ).toBeCloseTo(5.3, 10)
  })

  it('a sell risks the rest of the dollar', () => {
    expect(
      predictionMaxLoss({ contracts: 10, price: 0.53, side: 'sell' }),
    ).toBeCloseTo(4.7, 10)
  })

  it('is unknown without a price or a size', () => {
    expect(
      predictionMaxLoss({ contracts: 0, price: 0.5, side: 'buy' }),
    ).toBeNull()
    expect(
      predictionMaxLoss({ contracts: 10, price: null, side: 'buy' }),
    ).toBeNull()
  })
})

describe('predictionSibling', () => {
  const entry = (
    over: Partial<PredictionDirectoryEntry>,
  ): PredictionDirectoryEntry => ({
    market: 'polymarket',
    predictionMarketId: 'cond-1',
    outcome: 'Yes',
    name: 'Will it rain? - Yes',
    ...over,
  })

  it('finds the other outcome on the same market', () => {
    const entries = {
      'WILL-RAIN-YES': entry({}),
      'WILL-RAIN-NO': entry({ outcome: 'No', name: 'Will it rain? - No' }),
    }
    expect(predictionSibling('WILL-RAIN-YES', 'polymarket', entries)).toEqual({
      pairKey: 'WILL-RAIN-NO',
      label: 'No',
    })
  })

  it('offers nothing on a categorical market — there is no single other side', () => {
    const entries = {
      'RACE-A': entry({ outcome: 'Powell' }),
      'RACE-B': entry({ outcome: 'Warsh' }),
      'RACE-C': entry({ outcome: 'Hassett' }),
    }
    expect(predictionSibling('RACE-A', 'polymarket', entries)).toBeNull()
  })

  it('ignores a same-named outcome on a different market', () => {
    const entries = {
      'Q1-YES': entry({ market: 'kalshi', predictionMarketId: 'a' }),
      'Q2-NO': entry({
        market: 'kalshi',
        predictionMarketId: 'b',
        outcome: 'No',
      }),
    }
    // Falls through to Kalshi's structural rule rather than pairing two
    // unrelated questions.
    expect(predictionSibling('Q1-YES', 'kalshi', entries)).toEqual({
      pairKey: 'Q1-YES-NO',
      label: 'No',
    })
  })

  it('toggles the Kalshi NO suffix for a cold pair key', () => {
    expect(predictionSibling('KXBTCD-26AUG15-T53', 'kalshi', {})).toEqual({
      pairKey: 'KXBTCD-26AUG15-T53-NO',
      label: 'No',
    })
    expect(predictionSibling('KXBTCD-26AUG15-T53-NO', 'kalshi', {})).toEqual({
      pairKey: 'KXBTCD-26AUG15-T53',
      label: 'Yes',
    })
  })

  it('offers no switch on an unpinned non-Kalshi key', () => {
    expect(predictionSibling('SOME-HANDLE', 'polymarket', {})).toBeNull()
  })
})
