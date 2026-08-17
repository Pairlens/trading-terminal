// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { formatIpoPriceRange } from '../ipo-range'

describe('formatIpoPriceRange', () => {
  it('formats a real range in the filing currency', () => {
    expect(formatIpoPriceRange(35, 37, 'USD')).toEqual({
      kind: 'range',
      low: '$35.00',
      high: '$37.00',
    })
  })

  it('reports an unpriced deal as unknown, never as zero', () => {
    // The server already turns the provider's literal 0 into null; this is
    // the second half of the same rule, and the one a reader sees.
    expect(formatIpoPriceRange(null, null, 'USD')).toEqual({ kind: 'unknown' })
  })

  it('shows the single price a half-filed range carries', () => {
    expect(formatIpoPriceRange(18, null, 'USD')).toEqual({
      kind: 'single',
      value: '$18.00',
    })
    expect(formatIpoPriceRange(null, 20, 'USD')).toEqual({
      kind: 'single',
      value: '$20.00',
    })
  })

  it('collapses a range of one price', () => {
    expect(formatIpoPriceRange(19, 19, 'USD')).toEqual({
      kind: 'single',
      value: '$19.00',
    })
  })

  it('rights an inverted range rather than printing it backwards', () => {
    expect(formatIpoPriceRange(22, 19, 'USD')).toEqual({
      kind: 'range',
      low: '$19.00',
      high: '$22.00',
    })
  })

  it('survives a missing or unusable currency code', () => {
    expect(formatIpoPriceRange(35, 37, null)).toEqual({
      kind: 'range',
      low: '35.00',
      high: '37.00',
    })
    expect(formatIpoPriceRange(35, 37, 'ZZZZ')).toEqual({
      kind: 'range',
      low: '35.00 ZZZZ',
      high: '37.00 ZZZZ',
    })
  })
})
