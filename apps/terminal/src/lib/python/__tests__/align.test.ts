// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { alignOutputs, alignSeries } from '../align'

describe('alignSeries', () => {
  it('broadcasts scalars to every bar', () => {
    expect(Array.from(alignSeries(1.5, 4))).toEqual([1.5, 1.5, 1.5, 1.5])
  })

  it('returns equal-length arrays as-is', () => {
    const input = new Float64Array([1, 2, 3])
    expect(alignSeries(input, 3)).toBe(input)
  })

  it('right-aligns shorter arrays with NaN left-padding', () => {
    const out = alignSeries(new Float64Array([7, 8]), 5)
    expect(out).toHaveLength(5)
    expect(Number.isNaN(out[0])).toBe(true)
    expect(Number.isNaN(out[1])).toBe(true)
    expect(Number.isNaN(out[2])).toBe(true)
    expect(out[3]).toBe(7)
    expect(out[4]).toBe(8)
  })

  it('keeps the trailing window of longer arrays', () => {
    const out = alignSeries(new Float64Array([1, 2, 3, 4, 5]), 3)
    expect(Array.from(out)).toEqual([3, 4, 5])
  })

  it('handles zero-length windows', () => {
    expect(alignSeries(new Float64Array([1, 2]), 0)).toHaveLength(0)
    expect(alignSeries(3, 0)).toHaveLength(0)
  })
})

describe('alignOutputs', () => {
  it('aligns every series and preserves keys', () => {
    const out = alignOutputs({ a: 2, b: new Float64Array([1]) }, 2)
    expect(Object.keys(out).sort()).toEqual(['a', 'b'])
    expect(Array.from(out.a)).toEqual([2, 2])
    expect(Number.isNaN(out.b[0])).toBe(true)
    expect(out.b[1]).toBe(1)
  })
})
