// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  aggregateByPrice,
  clusterIntensity,
  clusterPriceBounds,
  dominantSide,
  liquidationTotals,
  peakNotional,
} from '../liquidation-clusters'
import type { LiquidationBucket } from '@pairlens/shared/instrument-types'

function bucket(
  ts: number,
  price: number,
  side: 'long' | 'short',
  notionalUsd: number,
  count = 1,
): LiquidationBucket {
  return { ts, price, side, notionalUsd, count }
}

describe('aggregateByPrice', () => {
  test('collapses the time axis and keeps the two sides apart', () => {
    // The mistake this guards: summing both sides into one "activity" number
    // turns a liquidation map into a volume profile, which says nothing about
    // who was forced out.
    const clusters = aggregateByPrice([
      bucket(0, 64_000, 'long', 100_000, 2),
      bucket(60_000, 64_000, 'long', 50_000, 1),
      bucket(60_000, 64_000, 'short', 20_000, 1),
      bucket(0, 64_200, 'short', 80_000, 3),
    ])

    expect(clusters).toHaveLength(2)
    expect(clusters[0]).toEqual({
      price: 64_000,
      longNotional: 150_000,
      shortNotional: 20_000,
      total: 170_000,
      count: 4,
    })
    expect(clusters[1]?.shortNotional).toBe(80_000)
  })

  test('orders by price ascending, which is the order the strip draws in', () => {
    const clusters = aggregateByPrice([
      bucket(0, 300, 'long', 1),
      bucket(0, 100, 'long', 1),
      bucket(0, 200, 'short', 1),
    ])
    expect(clusters.map((c) => c.price)).toEqual([100, 200, 300])
  })

  test('a bucket a pane could not draw never becomes a column', () => {
    expect(
      aggregateByPrice([
        bucket(0, 0, 'long', 100),
        bucket(0, -5, 'long', 100),
        bucket(0, 100, 'long', 0),
        bucket(0, 100, 'long', Number.NaN),
      ]),
    ).toEqual([])
  })

  test('an empty window is an empty strip, not a zero-height one', () => {
    expect(aggregateByPrice([])).toEqual([])
  })
})

describe('clusterIntensity', () => {
  test('square-root scaling keeps ordinary buckets visible beside a cascade', () => {
    // A cascade minute is routinely a hundred times a normal one. Linear
    // scaling would render the 1% bucket at 1% alpha, which is nothing.
    const peak = 1_000_000
    const ordinary = clusterIntensity(40_000, peak)
    expect(ordinary).toBeCloseTo(0.2, 6)
    // The linear reading would have been 0.04, five times fainter.
    expect(ordinary).toBeGreaterThan(40_000 / peak)
  })

  test('the heaviest cluster is full strength', () => {
    expect(clusterIntensity(500, 500)).toBe(1)
    // Over the peak cannot happen, but must not exceed 1 if it did.
    expect(clusterIntensity(900, 500)).toBe(1)
  })

  test('a bucket that exists is never invisible', () => {
    expect(clusterIntensity(1, 1_000_000_000)).toBeGreaterThan(0.1)
  })

  test('a bucket that does not exist is not drawn at all', () => {
    // The floor must never invent density where there was none.
    expect(clusterIntensity(0, 500)).toBe(0)
    expect(clusterIntensity(100, 0)).toBe(0)
    expect(clusterIntensity(Number.NaN, 500)).toBe(0)
  })
})

describe('dominantSide', () => {
  test('the side that carried the notional colours the column', () => {
    expect(
      dominantSide({
        price: 1,
        longNotional: 10,
        shortNotional: 90,
        total: 100,
        count: 2,
      }),
    ).toBe('short')
    expect(
      dominantSide({
        price: 1,
        longNotional: 90,
        shortNotional: 10,
        total: 100,
        count: 2,
      }),
    ).toBe('long')
  })

  test('an exact tie picks a side rather than inventing a third colour', () => {
    expect(
      dominantSide({
        price: 1,
        longNotional: 50,
        shortNotional: 50,
        total: 100,
        count: 2,
      }),
    ).toBe('long')
  })
})

describe('liquidationTotals', () => {
  test('states what each side actually lost in the window', () => {
    expect(
      liquidationTotals([
        bucket(0, 100, 'long', 1_000, 4),
        bucket(0, 200, 'short', 250, 1),
        bucket(60_000, 100, 'long', 500, 2),
      ]),
    ).toEqual({ long: 1_500, short: 250, total: 1_750, count: 7 })
  })

  test('an empty window totals to nothing, so the legend can hide', () => {
    expect(liquidationTotals([])).toEqual({
      long: 0,
      short: 0,
      total: 0,
      count: 0,
    })
  })
})

describe('clusterPriceBounds', () => {
  test('the top bound is the highest bucket plus its width', () => {
    // A slab clipped at the axis edge would misreport where liquidations
    // stopped, so the axis has to hold the whole top bucket.
    const clusters = aggregateByPrice([
      bucket(0, 64_000, 'long', 1),
      bucket(0, 64_200, 'short', 1),
    ])
    expect(clusterPriceBounds(clusters, 20)).toEqual([64_000, 64_220])
  })

  test('an unusable width still bounds the axis by the buckets themselves', () => {
    const clusters = aggregateByPrice([bucket(0, 500, 'long', 1)])
    expect(clusterPriceBounds(clusters, 0)).toEqual([500, 500])
  })

  test('no clusters widen nothing', () => {
    expect(clusterPriceBounds([], 20)).toEqual([])
  })
})

describe('peakNotional', () => {
  test('is the heaviest cluster, not the heaviest single bucket', () => {
    const clusters = aggregateByPrice([
      bucket(0, 100, 'long', 60),
      bucket(60_000, 100, 'long', 60),
      bucket(0, 200, 'short', 90),
    ])
    expect(peakNotional(clusters)).toBe(120)
  })

  test('an empty strip has no peak to scale against', () => {
    expect(peakNotional([])).toBe(0)
  })
})
