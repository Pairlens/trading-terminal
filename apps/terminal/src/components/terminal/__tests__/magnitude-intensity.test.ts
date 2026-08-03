// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import {
  computeMagnitudeReference,
  magnitudeFillColor,
  magnitudeIntensity,
  magnitudeTextColor,
} from '../magnitude-intensity'

const levels = (...values: Array<number>) => values

/** Read the `NN.N%` out of a color-mix string. */
function pctOf(color: string): number {
  const match = color.match(/([\d.]+)%/)
  if (!match) throw new Error(`no percentage in ${color}`)
  return parseFloat(match[1])
}

describe('computeMagnitudeReference', () => {
  test('is the median of both sides pooled, times the multiple', () => {
    // pooled sorted: [1,2,3,4] → median 2.5 → 2.5 * 6
    expect(computeMagnitudeReference(levels(1, 3), levels(2, 4))).toBe(15)
  })

  test('takes the middle element for an odd count', () => {
    expect(computeMagnitudeReference(levels(1, 2, 9))).toBe(12)
  })

  test('a lone whale does not move the reference much', () => {
    const calm = computeMagnitudeReference(levels(1, 1, 1, 1, 1))
    const whale = computeMagnitudeReference(levels(1, 1, 1, 1, 1000))
    expect(whale).toBe(calm)
  })

  test('ignores zero and negative sizes', () => {
    expect(computeMagnitudeReference(levels(0, 2, 2, -5))).toBe(12)
  })

  test('returns 0 for an empty or all-zero book', () => {
    expect(computeMagnitudeReference([])).toBe(0)
    expect(computeMagnitudeReference(levels(0, 0))).toBe(0)
  })
})

describe('magnitudeIntensity', () => {
  const ref = computeMagnitudeReference(levels(10, 10, 10)) // median 10 → ref 60

  test('a median-sized level sits mid-ramp, not at either end', () => {
    const t = magnitudeIntensity(10, ref)
    expect(t).toBeGreaterThan(0.3)
    expect(t).toBeLessThan(0.5)
  })

  test('saturates at the reference and stays clamped beyond it', () => {
    expect(magnitudeIntensity(60, ref)).toBe(1)
    expect(magnitudeIntensity(60_000, ref)).toBe(1)
  })

  test('is monotonic in size', () => {
    const ts = [1, 5, 10, 20, 40, 60].map((s) => magnitudeIntensity(s, ref))
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThan(ts[i - 1])
    }
  })

  test('compresses the tail: doubling size is less than doubling intensity', () => {
    // The point of the curve — small levels stay distinguishable from each
    // other instead of collapsing into one band under a whale.
    expect(magnitudeIntensity(20, ref)).toBeLessThan(
      2 * magnitudeIntensity(10, ref),
    )
  })

  test('is scale-invariant — same shape of book paints the same', () => {
    const btc = computeMagnitudeReference(levels(0.4, 0.5, 0.6))
    const shib = computeMagnitudeReference(levels(4e6, 5e6, 6e6))
    expect(magnitudeIntensity(0.6, btc)).toBeCloseTo(
      magnitudeIntensity(6e6, shib),
      12,
    )
  })

  test('a flat book rests mid-ramp rather than painting everything hot', () => {
    const flat = computeMagnitudeReference(levels(7, 7, 7, 7))
    expect(magnitudeIntensity(7, flat)).toBeLessThan(0.5)
  })

  test('falls back to the resting tone with no usable reference', () => {
    expect(magnitudeIntensity(5, 0)).toBeCloseTo(magnitudeIntensity(10, 60), 12)
  })

  test('an empty level is fully quiet', () => {
    expect(magnitudeIntensity(0, ref)).toBe(0)
  })
})

describe('magnitudeFillColor', () => {
  test('picks the side token', () => {
    expect(magnitudeFillColor('up', 0.5)).toContain('var(--up)')
    expect(magnitudeFillColor('down', 0.5)).toContain('var(--down)')
  })

  test('keeps the resting tone near the flat 13% it replaces', () => {
    const median = magnitudeIntensity(
      10,
      computeMagnitudeReference(levels(10, 10, 10)),
    )
    const pct = pctOf(magnitudeFillColor('up', median))
    expect(pct).toBeGreaterThan(12)
    expect(pct).toBeLessThan(16)
  })

  test('walls are visibly stronger than dust', () => {
    expect(pctOf(magnitudeFillColor('up', 1))).toBeGreaterThan(
      2 * pctOf(magnitudeFillColor('up', 0)),
    )
  })
})

describe('magnitudeTextColor', () => {
  test('never drops below the legibility floor', () => {
    expect(pctOf(magnitudeTextColor(0))).toBeGreaterThanOrEqual(60)
  })

  test('reaches full foreground at a wall', () => {
    expect(pctOf(magnitudeTextColor(1))).toBe(100)
  })
})
