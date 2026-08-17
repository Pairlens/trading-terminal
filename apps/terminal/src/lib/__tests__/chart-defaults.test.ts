// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Prediction charts open as probabilities, and the forward fill that makes
 * that readable must never become the lie the connector refuses to tell.
 *
 * Two halves. The pure helpers are exercised directly. The wiring in
 * `use-chart-terminal-state.ts` is pinned as source invariants, the same way
 * `candle-stream-throttle.test.ts` pins its ordering: the terminal has no
 * React test renderer, and what a later edit can silently undo here is the
 * gating (fill on predictions only) and the class scoping (one storage key per
 * asset class), both of which are visible in the source.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  FALLBACK_CHART_ASSET_CLASS,
  PREDICTION_FILL_MAX_BARS,
  chartBucketMs,
  classScopedChartKey,
  defaultChartTypeForAssetClass,
  defaultCompareModeForAssetClass,
  fillPredictionBars,
  primaryAssetClass,
} from '../chart-defaults'

const MINUTE = 60_000

const bar = (ts: number, close: number, volume = 5) => ({
  ts,
  open: close,
  high: close,
  low: close,
  close,
  volume,
})

describe('asset class resolution', () => {
  test('an undeclared venue falls back to crypto spot', () => {
    expect(primaryAssetClass(undefined)).toBe(FALLBACK_CHART_ASSET_CLASS)
    expect(primaryAssetClass([])).toBe(FALLBACK_CHART_ASSET_CLASS)
  })

  test('prediction wins over anything else the venue declares', () => {
    expect(primaryAssetClass(['prediction'])).toBe('prediction')
    expect(primaryAssetClass(['crypto-spot', 'prediction'])).toBe('prediction')
  })

  test('otherwise the first declared class wins', () => {
    expect(primaryAssetClass(['stocks'])).toBe('stocks')
    expect(primaryAssetClass(['crypto-perp', 'crypto-spot'])).toBe(
      'crypto-perp',
    )
    expect(primaryAssetClass(['dex'])).toBe('dex')
  })
})

describe('class defaults', () => {
  test('predictions open on a step line, everything else on candles', () => {
    expect(defaultChartTypeForAssetClass('prediction')).toBe('stepLine')
    for (const other of [
      'crypto-spot',
      'crypto-perp',
      'stocks',
      'dex',
    ] as const) {
      expect(defaultChartTypeForAssetClass(other)).toBe('candles')
    }
    expect(defaultChartTypeForAssetClass(null)).toBe('candles')
    expect(defaultChartTypeForAssetClass(undefined)).toBe('candles')
  })

  test('predictions compare on their own axis, never a rebased index', () => {
    // Not `price` either: measured live, a spot compare on an outcome hands
    // BTC's range to the cents formatter and the axis reads `5378366¢`.
    expect(defaultCompareModeForAssetClass('prediction')).toBe('dual-axis')
    expect(defaultCompareModeForAssetClass('crypto-spot')).toBe('indexed')
    expect(defaultCompareModeForAssetClass('stocks')).toBe('indexed')
    expect(defaultCompareModeForAssetClass(null)).toBe('indexed')
  })

  test('the storage key carries the class, and the pane scope on top', () => {
    expect(classScopedChartKey('terminal.chartType', 'prediction')).toBe(
      'terminal.chartType.prediction',
    )
    expect(classScopedChartKey('terminal.chartType', 'crypto-spot')).toBe(
      'terminal.chartType.crypto-spot',
    )
    expect(
      classScopedChartKey('terminal.chartType', 'prediction', 'pane-7'),
    ).toBe('terminal.chartType.prediction::pane-7')
    // Two classes never collide, which is the whole point of the scoping.
    expect(classScopedChartKey('terminal.compareMode', 'prediction')).not.toBe(
      classScopedChartKey('terminal.compareMode', 'crypto-spot'),
    )
  })

  test('bucket width comes from the shared table, 0 for anything unknown', () => {
    expect(chartBucketMs('1m')).toBe(MINUTE)
    expect(chartBucketMs('1h')).toBe(60 * MINUTE)
    expect(chartBucketMs('7s')).toBe(0)
    expect(chartBucketMs('')).toBe(0)
  })
})

describe('fillPredictionBars', () => {
  test('carries the last close across an untraded bucket', () => {
    const filled = fillPredictionBars(
      [bar(0, 0.34), bar(3 * MINUTE, 0.41)],
      MINUTE,
    )
    expect(filled.map((b) => b.ts)).toEqual([0, MINUTE, 2 * MINUTE, 3 * MINUTE])
    expect(filled.slice(1, 3)).toEqual([
      { ts: MINUTE, open: 0.34, high: 0.34, low: 0.34, close: 0.34, volume: 0 },
      {
        ts: 2 * MINUTE,
        open: 0.34,
        high: 0.34,
        low: 0.34,
        close: 0.34,
        volume: 0,
      },
    ])
  })

  test('filled buckets carry zero volume so the volume pane stays honest', () => {
    const filled = fillPredictionBars(
      [bar(0, 0.5, 12), bar(4 * MINUTE, 0.5, 9)],
      MINUTE,
    )
    const invented = filled.filter((b) => b.ts % (4 * MINUTE) !== 0)
    expect(invented).toHaveLength(3)
    expect(invented.every((b) => b.volume === 0)).toBe(true)
    // The real prints keep theirs.
    expect(filled[0]?.volume).toBe(12)
    expect(filled[filled.length - 1]?.volume).toBe(9)
  })

  test('never fills past the newest real bar toward now', () => {
    const bars = [bar(0, 0.2), bar(2 * MINUTE, 0.25), bar(5 * MINUTE, 0.3)]
    const filled = fillPredictionBars(bars, MINUTE)
    expect(filled[filled.length - 1]).toEqual(bar(5 * MINUTE, 0.3))
    expect(Math.max(...filled.map((b) => b.ts))).toBe(5 * MINUTE)
    // Every gap between real prints closed, and nothing beyond the last.
    expect(filled).toHaveLength(6)
  })

  test('a contiguous series comes back by reference so memos do not rebuild', () => {
    const bars = [bar(0, 0.1), bar(MINUTE, 0.2), bar(2 * MINUTE, 0.3)]
    expect(fillPredictionBars(bars, MINUTE)).toBe(bars)
  })

  test('too little to interpolate between comes back untouched', () => {
    const one = [bar(0, 0.1)]
    expect(fillPredictionBars(one, MINUTE)).toBe(one)
    const none: Array<ReturnType<typeof bar>> = []
    expect(fillPredictionBars(none, MINUTE)).toBe(none)
  })

  test('an unusable bucket width fills nothing', () => {
    const bars = [bar(0, 0.1), bar(10 * MINUTE, 0.2)]
    expect(fillPredictionBars(bars, 0)).toBe(bars)
    expect(fillPredictionBars(bars, -1)).toBe(bars)
    expect(fillPredictionBars(bars, Number.NaN)).toBe(bars)
  })

  test('past the bucket cap the raw array is left alone', () => {
    const span = (PREDICTION_FILL_MAX_BARS + 10) * MINUTE
    const overCap = [bar(0, 0.1), bar(span, 0.2)]
    expect(fillPredictionBars(overCap, MINUTE)).toBe(overCap)

    // Just inside the cap still fills.
    const underCap = [
      bar(0, 0.1),
      bar((PREDICTION_FILL_MAX_BARS - 2) * MINUTE, 0.2),
    ]
    const filled = fillPredictionBars(underCap, MINUTE)
    expect(filled).toHaveLength(PREDICTION_FILL_MAX_BARS - 1)
  })

  test('refuses a gap that is not a whole number of buckets wide', () => {
    // A venue whose bars do not sit on this interval's grid. Filling would
    // invent timestamps, so the gap survives.
    const bars = [bar(0, 0.1), bar(Math.round(2.5 * MINUTE), 0.2)]
    expect(fillPredictionBars(bars, MINUTE)).toBe(bars)
  })

  test('ignores duplicate and out-of-order timestamps', () => {
    const bars = [bar(MINUTE, 0.1), bar(MINUTE, 0.2), bar(0, 0.3)]
    expect(fillPredictionBars(bars, MINUTE)).toBe(bars)
  })
})

// ── Wiring invariants (see the file header) ──────────────────────────

const hookSource = readFileSync(
  join(import.meta.dir, '..', '..', 'hooks', 'use-chart-terminal-state.ts'),
  'utf8',
)

describe('use-chart-terminal-state wiring', () => {
  test('chart type and compare mode persist per asset class', () => {
    expect(hookSource).toContain(
      "classScopedChartKey('terminal.chartType', assetClass, scope)",
    )
    expect(hookSource).toContain(
      "classScopedChartKey('terminal.compareMode', assetClass, scope)",
    )
    // The old unscoped keys are gone rather than shimmed (greenfield rules).
    expect(hookSource).not.toContain("scopedKey('terminal.chartType')")
    expect(hookSource).not.toContain("scopedKey('terminal.compareMode')")
  })

  test('the defaults come from the shared helpers, not inline literals', () => {
    expect(hookSource).toContain('defaultChartTypeForAssetClass(assetClass)')
    expect(hookSource).toContain('defaultCompareModeForAssetClass(assetClass)')
  })

  test('the forward fill is gated on the prediction class and used once', () => {
    expect(hookSource).toContain(
      'isPredictionInstrument\n      ? fillPredictionBars(rawBars, chartBucketMs(timeframe))\n      : rawBars',
    )
    // One call site: compare series are never densified. They align by ts
    // lookup into the primary, so filling them would double-count the gap.
    expect(hookSource.split('fillPredictionBars(').length - 1).toBe(1)
  })

  test('the duplicate ChartType union is gone in favour of the package type', () => {
    expect(hookSource).not.toContain('export type ChartType =')
    expect(hookSource).toMatch(
      /import type \{[\s\S]*?\bChartType,[\s\S]*?\} from '@pairlens\/fast-financial-charts\/types'/,
    )
  })
})
