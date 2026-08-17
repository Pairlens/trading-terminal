// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { TIMEFRAME_TO_MS } from '@pairlens/shared/timeframe'

import {
  LIQUIDATION_WINDOWS,
  LIQUIDATION_WINDOW_TIMEFRAME,
  aggregateByPrice,
  barsForWindow,
  buildHeatmapGrid,
  clusterIntensity,
  clusterPriceBounds,
  collectedLiquidationVenues,
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

// ── Time-by-price grid ───────────────────────────────────────────────

const MIN = 60_000
const FIFTEEN_MIN = 15 * MIN
/** 2026-08-17T00:00:00Z, an exact 15m and 1h boundary. */
const T0 = 1_786_924_800_000

describe('buildHeatmapGrid', () => {
  test('minute buckets fold onto the candle column that contains them', () => {
    // The whole reason the grid exists: the wire is minute-resolution and the
    // chart is not, so fourteen minutes of prints inside one 15m bar have to
    // arrive as ONE cell rather than fourteen sub-pixel slivers.
    const grid = buildHeatmapGrid(
      [
        bucket(T0, 64_000, 'long', 100_000, 2),
        bucket(T0 + MIN, 64_000, 'long', 50_000, 1),
        bucket(T0 + 14 * MIN, 64_000, 'long', 25_000, 3),
        bucket(T0 + FIFTEEN_MIN, 64_000, 'long', 10_000, 1),
      ],
      FIFTEEN_MIN,
    )

    expect(grid.cellCount).toBe(2)
    expect(grid.barMs).toBe(FIFTEEN_MIN)
    const first = grid.columns.get(T0)
    expect(first).toHaveLength(1)
    expect(first?.[0]).toEqual({
      barTs: T0,
      price: 64_000,
      longNotional: 175_000,
      shortNotional: 0,
      total: 175_000,
      count: 6,
    })
    expect(grid.columns.get(T0 + FIFTEEN_MIN)?.[0].total).toBe(10_000)
  })

  test('one column carries one cell per price bucket, keyed by column start', () => {
    const grid = buildHeatmapGrid(
      [
        bucket(T0 + MIN, 64_000, 'long', 10),
        bucket(T0 + 2 * MIN, 64_100, 'short', 20),
        bucket(T0 + 3 * MIN, 64_200, 'short', 30),
      ],
      FIFTEEN_MIN,
    )

    expect(grid.columns.size).toBe(1)
    const column = grid.columns.get(T0)
    expect(column?.map((cell) => cell.price)).toEqual([64_000, 64_100, 64_200])
    // Every cell in a column reports the column it belongs to, so the paint
    // loop never has to reconstruct it from the map key.
    expect(column?.every((cell) => cell.barTs === T0)).toBe(true)
  })

  test('sides stay apart inside a cell, and the heavier one colours it', () => {
    const grid = buildHeatmapGrid(
      [
        bucket(T0, 64_000, 'long', 30_000, 1),
        bucket(T0 + MIN, 64_000, 'short', 70_000, 2),
      ],
      FIFTEEN_MIN,
    )

    const cell = grid.columns.get(T0)![0]
    expect(cell.longNotional).toBe(30_000)
    expect(cell.shortNotional).toBe(70_000)
    // Painted as one rectangle at the COMBINED intensity: splitting it would
    // put a colour boundary where there is no price boundary.
    expect(cell.total).toBe(100_000)
    expect(dominantSide(cell)).toBe('short')
  })

  test('intensity is scaled against the heaviest CELL, not the heaviest column', () => {
    // A column holding four ordinary cells must not make each of them look
    // like a quarter of a cascade.
    const grid = buildHeatmapGrid(
      [
        bucket(T0, 100, 'long', 25),
        bucket(T0, 101, 'long', 25),
        bucket(T0, 102, 'long', 25),
        bucket(T0, 103, 'long', 25),
        bucket(T0 + FIFTEEN_MIN, 200, 'short', 100),
      ],
      FIFTEEN_MIN,
    )

    expect(grid.peak).toBe(100)
    expect(clusterIntensity(grid.columns.get(T0)![0].total, grid.peak)).toBe(
      0.5,
    )
    expect(
      clusterIntensity(grid.columns.get(T0 + FIFTEEN_MIN)![0].total, grid.peak),
    ).toBe(1)
  })

  test('a window with nothing in it builds no cells at all', () => {
    // What lets the pane say "nothing was liquidated" instead of drawing a
    // grid of zero-intensity rectangles that read as a loading state.
    const grid = buildHeatmapGrid([], FIFTEEN_MIN)
    expect(grid.cellCount).toBe(0)
    expect(grid.peak).toBe(0)
    expect(grid.columns.size).toBe(0)
  })

  test('a bucket the map could not place is never given a cell', () => {
    const grid = buildHeatmapGrid(
      [
        bucket(T0, 0, 'long', 100),
        bucket(T0, -5, 'long', 100),
        bucket(T0, 64_000, 'long', 0),
        bucket(T0, 64_000, 'long', Number.NaN),
        bucket(Number.NaN, 64_000, 'long', 100),
        bucket(T0, 64_000, 'long', 100),
      ],
      FIFTEEN_MIN,
    )
    expect(grid.cellCount).toBe(1)
    expect(grid.columns.get(T0)![0].total).toBe(100)
  })

  test('an unusable column width builds nothing rather than a wrong grid', () => {
    // Guards the path where a venue returned a single bar and the spacing
    // could not be measured: a grid at width 0 would divide by zero and place
    // every print in one column.
    for (const barMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const grid = buildHeatmapGrid([bucket(T0, 64_000, 'long', 100)], barMs)
      expect(grid.cellCount).toBe(0)
      expect(grid.columns.size).toBe(0)
    }
  })

  test('a count that is not a number never poisons the cell total', () => {
    const grid = buildHeatmapGrid(
      [
        {
          ts: T0,
          price: 100,
          side: 'long',
          notionalUsd: 10,
          count: Number.NaN,
        },
        bucket(T0, 100, 'long', 10, 4),
      ],
      FIFTEEN_MIN,
    )
    expect(grid.columns.get(T0)![0].count).toBe(4)
    expect(grid.columns.get(T0)![0].total).toBe(20)
  })
})

describe('LIQUIDATION_WINDOW_TIMEFRAME', () => {
  test('every window has a column width, and every width divides a minute evenly', () => {
    // The wire is minute-resolution: a column narrower than a minute, or one
    // that is not a whole number of minutes, would split a wire bucket.
    for (const hours of LIQUIDATION_WINDOWS) {
      const timeframe = LIQUIDATION_WINDOW_TIMEFRAME[hours]
      const barMs = TIMEFRAME_TO_MS[timeframe]
      expect(barMs).toBeGreaterThanOrEqual(MIN)
      expect(barMs % MIN).toBe(0)
    }
  })

  test('every window lands under a few hundred columns', () => {
    // The perf bar: 72h at the wire's own resolution is 4,320 columns, which
    // is a texture rather than a map.
    for (const hours of LIQUIDATION_WINDOWS) {
      const barMs = TIMEFRAME_TO_MS[LIQUIDATION_WINDOW_TIMEFRAME[hours]]
      expect((hours * 3_600_000) / barMs).toBeLessThanOrEqual(300)
    }
  })
})

describe('barsForWindow', () => {
  test('covers the whole window with lead-in to spare', () => {
    expect(barsForWindow(24, FIFTEEN_MIN)).toBe(96 + 12)
    expect(barsForWindow(1, MIN)).toBe(60 + 12)
    expect(barsForWindow(72, 3_600_000)).toBe(72 + 12)
  })

  test('an unusable column width asks for nothing', () => {
    expect(barsForWindow(24, 0)).toBe(0)
    expect(barsForWindow(24, Number.NaN)).toBe(0)
  })
})

// ── Data sources ─────────────────────────────────────────────────────

function carrier(...markets: Array<Array<string>>) {
  return {
    capabilities: markets.map((m) => ({
      id: 'market-data:liquidations',
      markets: m,
    })),
  }
}

describe('collectedLiquidationVenues', () => {
  test('offers the focused venue first, then the other collectors', () => {
    // Whose prints sit under whose candles matters: only the focused venue's
    // source is the same exchange as the chart, so it leads.
    expect(
      collectedLiquidationVenues(
        [carrier(['binance-futures', 'bybit-futures'])],
        'bybit-futures',
      ),
    ).toEqual(['bybit-futures', 'binance-futures'])
  })

  test('an uncovered venue leads with nothing, and the alternates remain on offer', () => {
    // KuCoin Futures publishes no print stream. The pane must not silently
    // answer with Binance, and must not pretend there is nothing to show.
    expect(
      collectedLiquidationVenues(
        [carrier(['binance-futures', 'bybit-futures'])],
        'kucoin-futures',
      ),
    ).toEqual(['binance-futures', 'bybit-futures'])
  })

  test('a wildcard declaration is not a collector and is dropped', () => {
    // The trap: a plugin claiming '*' would light every venue's picker with a
    // source that answers "not tracked" for all of them.
    expect(
      collectedLiquidationVenues([carrier(['*'])], 'binance-futures'),
    ).toEqual([])
  })

  test('the same venue declared twice is one source', () => {
    expect(
      collectedLiquidationVenues(
        [
          carrier(['binance-futures']),
          carrier(['binance-futures', 'bybit-futures']),
        ],
        'binance-futures',
      ),
    ).toEqual(['binance-futures', 'bybit-futures'])
  })

  test('other capabilities never contribute a source', () => {
    const mixed = {
      capabilities: [
        { id: 'market-data:candles', markets: ['okx', 'kraken'] },
        { id: 'market-data:liquidations', markets: ['binance-futures'] },
      ],
    }
    expect(collectedLiquidationVenues([mixed], 'okx')).toEqual([
      'binance-futures',
    ])
  })

  test('no plugin declaring the capability is no source at all', () => {
    expect(collectedLiquidationVenues([], 'binance-futures')).toEqual([])
  })
})
