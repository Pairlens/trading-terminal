// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  formatPredictionBookPrice,
  formatPredictionChartPrice,
  formatPredictionPrice,
} from '../format-price'

describe('formatPredictionPrice', () => {
  it('reads a probability as cents', () => {
    expect(formatPredictionPrice(0.53)).toBe('53¢')
    expect(formatPredictionPrice(0.99)).toBe('99¢')
    expect(formatPredictionPrice(1)).toBe('100¢')
  })

  it('keeps a decimal below ten cents, where a rounded cent is a big move', () => {
    expect(formatPredictionPrice(0.005)).toBe('0.5¢')
    expect(formatPredictionPrice(0.07)).toBe('7.0¢')
  })

  it('keeps a decimal for a fractional cent at any magnitude', () => {
    expect(formatPredictionPrice(0.535)).toBe('53.5¢')
  })

  it('does not invent precision on a whole cent', () => {
    expect(formatPredictionPrice(0.5)).toBe('50¢')
  })

  it('has a reading for zero and none for a non-number', () => {
    expect(formatPredictionPrice(0)).toBe('0¢')
    expect(formatPredictionPrice(Number.NaN)).toBe('—')
  })

  it('is the same reading on the axis and in the book', () => {
    expect(formatPredictionChartPrice(0.53)).toBe('53¢')
    expect(formatPredictionBookPrice(0.53)).toBe('53¢')
  })

  it('never exceeds the four characters a price gutter reserves', () => {
    for (const p of [0, 0.001, 0.05, 0.5, 0.999, 1]) {
      expect(formatPredictionChartPrice(p).length).toBeLessThanOrEqual(5)
    }
  })
})
