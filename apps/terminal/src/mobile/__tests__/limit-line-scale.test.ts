// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { limitLineScale } from '../chart/limit-line-scale'

/**
 * The limit line reads and writes one price field, and on a probability venue
 * that field is in CENTS while the chart plots 0..1. Both directions are pinned
 * here because the failure mode is silent: the line shipped feeding a 53¢ field
 * to `priceToCoordinate` as the price 53, which mapped far off a 0..1 plot and
 * pinned to the bottom edge, and dragging it wrote `0.61` back into a field the
 * ticket reads as cents — an order at 0.61¢ that the ticket then refused.
 *
 * A round trip is the invariant worth stating: what the drag writes has to be
 * what the line then draws.
 */

const price = limitLineScale(false)
const cents = limitLineScale(true)

describe('a spot / perp / dex / equities pair keeps raw prices', () => {
  test('the field is the chart price, untouched', () => {
    expect(price.toChartPrice('63900.5')).toBe(63900.5)
    expect(price.toChartPrice('0.00001234')).toBe(0.00001234)
  })

  test('an empty or nonsense field draws nothing', () => {
    expect(price.toChartPrice('')).toBeNull()
    expect(price.toChartPrice('abc')).toBeNull()
    expect(price.toChartPrice('0')).toBeNull()
    expect(price.toChartPrice('-5')).toBeNull()
  })

  test('a drag writes the price at the pair magnitude precision', () => {
    expect(price.toField(63900.123456)).toBe('63900.12')
    expect(price.toField(1.23456789)).toBe('1.2346')
    expect(price.toField(0.0123456789)).toBe('0.012346')
    expect(price.toField(0.000012345678)).toBe('0.00001235')
  })

  test('nothing clamps a raw price into a probability range', () => {
    // The regression this guards: a shared clamp would have quietly rewritten
    // every BTC drag as 99.9.
    expect(price.toField(63900)).toBe('63900')
    expect(price.toChartPrice(price.toField(63900))).toBe(63900)
  })
})

describe('a prediction outcome is cents in the field, dollars on the chart', () => {
  test('the field converts to the probability the chart plots', () => {
    expect(cents.toChartPrice('53')).toBe(0.53)
    expect(cents.toChartPrice('4.5')).toBeCloseTo(0.045, 12)
    expect(cents.toChartPrice('99.9')).toBeCloseTo(0.999, 12)
  })

  test('a value that is not a probability draws no line at all', () => {
    // A `60000` inherited from a spot draft survives the switch to an outcome.
    // Null hides the line; the old code pinned it to the plot edge instead.
    expect(cents.toChartPrice('60000')).toBeNull()
    expect(cents.toChartPrice('100')).toBeNull()
    expect(cents.toChartPrice('0')).toBeNull()
    expect(cents.toChartPrice('')).toBeNull()
  })

  test('a drag writes CENTS back, at the tenth the venues quote', () => {
    expect(cents.toField(0.61)).toBe('61')
    expect(cents.toField(0.045)).toBe('4.5')
    expect(cents.toField(0.5327)).toBe('53.3')
  })

  test('a drag past the top of the axis writes the top of the range', () => {
    // `priceToCents(0.9999)` rounds to exactly 100, which is not a probability:
    // unclamped, the gesture would produce a field the submit gate refuses.
    expect(cents.toField(0.9999)).toBe('99.9')
    expect(cents.toField(1)).toBe('99.9')
    expect(cents.toField(1.4)).toBe('99.9')
    expect(cents.toField(0.0001)).toBe('0.1')
  })

  test('what the drag writes is what the line then draws', () => {
    for (const dollars of [0.01, 0.045, 0.53, 0.9, 0.999]) {
      const field = cents.toField(dollars)
      expect(cents.toChartPrice(field)).toBeCloseTo(dollars, 3)
    }
  })

  test('the tag reads in the axis unit, not as a bare probability', () => {
    expect(cents.formatTag(0.53, 'en')).toBe('53¢')
    expect(cents.formatTag(0.045, 'en')).toBe('4.5¢')
    expect(price.formatTag(63900.5, 'en')).toBe('63,900.50')
  })
})
