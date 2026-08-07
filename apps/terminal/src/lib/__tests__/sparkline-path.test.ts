// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { buildSparkline, skeletonValues } from '../sparkline-path'

const W = 72
const H = 22
const PAD = 1.5

/** Every `x,y` pair in a `M…L…` path. */
function points(path: string): Array<[number, number]> {
  return path
    .slice(1)
    .split(/[ML]/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return [x, y] as [number, number]
    })
}

describe('buildSparkline', () => {
  test('spans the full box and pins the extremes to the padded edges', () => {
    const geo = buildSparkline([10, 20, 30], W, H)!
    const pts = points(geo.line)

    expect(pts).toHaveLength(3)
    expect(pts[0][0]).toBe(0)
    expect(pts[2][0]).toBe(W)
    // Lowest close sits at the bottom edge, highest at the top — y is flipped.
    expect(pts[0][1]).toBe(H - PAD)
    expect(pts[2][1]).toBe(PAD)
  })

  test('closes the area path along the bottom edge', () => {
    const geo = buildSparkline([1, 2], W, H)!
    expect(geo.area).toBe(`${geo.line}L${W},${H}L0,${H}Z`)
  })

  test('reads direction from first vs last close, not the extremes', () => {
    // Spikes up in the middle, still ends below where it opened.
    expect(buildSparkline([10, 99, 9], W, H)!.up).toBe(false)
    expect(buildSparkline([10, 1, 11], W, H)!.up).toBe(true)
    // A flat window is not a loss.
    expect(buildSparkline([5, 5, 5], W, H)!.up).toBe(true)
  })

  test('draws a zero-range window down the middle instead of dividing by zero', () => {
    const geo = buildSparkline([5, 5, 5], W, H)!
    for (const [, y] of points(geo.line)) {
      expect(y).toBe(H / 2)
    }
  })

  test('reports the last point so callers can cap the line', () => {
    const geo = buildSparkline([1, 4, 2], W, H)!
    const pts = points(geo.line)
    expect([geo.lastX, geo.lastY]).toEqual(pts[pts.length - 1])
  })

  test('returns null when there is nothing honest to draw', () => {
    expect(buildSparkline([], W, H)).toBeNull()
    expect(buildSparkline([42], W, H)).toBeNull()
    expect(buildSparkline([1, 2], 0, H)).toBeNull()
    expect(buildSparkline([1, 2], W, 0)).toBeNull()
  })
})

describe('skeletonValues', () => {
  // The two properties the loading placeholder depends on. Break the first
  // and it reshuffles on every render, which reads as data arriving; break
  // the second and a list becomes a column of identical squiggles.
  test('is stable for a given pair', () => {
    expect(skeletonValues('BTC-USDT')).toEqual(skeletonValues('BTC-USDT'))
  })

  test('differs between pairs, including near-identical ones', () => {
    expect(skeletonValues('BTC-USDT')).not.toEqual(skeletonValues('ETH-USDT'))
    expect(skeletonValues('BTC-USDT')).not.toEqual(skeletonValues('BTC-USDC'))
  })

  test('produces a drawable line, never a flat one', () => {
    for (const seed of ['BTC-USDT', 'AAPL', 'WIF-SOL', '', 'x']) {
      const values = skeletonValues(seed)
      expect(values.length).toBeGreaterThanOrEqual(2)
      expect(values.every(Number.isFinite)).toBe(true)
      expect(new Set(values).size).toBeGreaterThan(1)
      expect(buildSparkline(values, W, H)).not.toBeNull()
    }
  })
})
