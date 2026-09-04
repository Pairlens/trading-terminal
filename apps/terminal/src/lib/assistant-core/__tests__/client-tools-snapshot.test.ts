// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// get_chart_indicators must hand the model computed values, not just the
// indicator's type and params. The engine already holds those values; the
// snapshot used to drop them by asking for the lite payload and mapping
// only id/type/params.
import { describe, expect, it } from 'bun:test'

import type { FastFinancialChartRef } from '@pairlens/fast-financial-charts/types'
import { buildChartSnapshot } from '@/lib/assistant-core/client-tools'

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 8, 4, 0, 0, 0)

type EngineSnapshotOptions = {
  includeSeries?: boolean
  includeIndicatorValues?: boolean
}

type IndicatorRow = {
  id: string
  type: string
  params?: Record<string, unknown>
}

type ValuePoint = {
  ts: number
  value?: number
  [key: string]: boolean | number | string | undefined
}

function fakeChart(opts: {
  indicators: Array<IndicatorRow>
  results: Array<{ id: string; values: Array<ValuePoint> }>
  timeframe?: string
}): FastFinancialChartRef {
  const lite = {
    timeframe: opts.timeframe ?? '1h',
    indicators: opts.indicators,
    drawings: [],
    viewport: { startIndex: 0, endIndex: 10 },
  }
  return {
    getSnapshot: (options?: EngineSnapshotOptions) => {
      if (!options?.includeIndicatorValues) return lite
      return {
        ...lite,
        series: [],
        indicatorResults: opts.results.map((result) => ({
          indicator: opts.indicators.find((row) => row.id === result.id) ?? {
            id: result.id,
            type: 'EMA',
          },
          values: result.values,
          computedAt: T0,
        })),
      }
    },
    data: () => Array.from({ length: 80 }, (_, i) => ({ ts: T0 + i * HOUR })),
    seriesOrder: () => ['BTC-USDT'],
  } as unknown as FastFinancialChartRef
}

describe('buildChartSnapshot indicators', () => {
  it('includes the last computed point and a recent window of values', () => {
    const values = [
      { ts: T0, value: 40 },
      { ts: T0 + HOUR, value: 55.2 },
    ]
    const snap = buildChartSnapshot(
      fakeChart({
        indicators: [{ id: 'rsi-1', type: 'RSI', params: { period: 14 } }],
        results: [{ id: 'rsi-1', values }],
      }),
    )

    expect(snap?.indicators).toEqual([
      {
        id: 'rsi-1',
        type: 'RSI',
        params: { period: 14 },
        latest: { ts: T0 + HOUR, value: 55.2 },
        values,
      },
    ])
  })

  it('keeps multi-plot keys so StochRSI and EMACross are readable', () => {
    const snap = buildChartSnapshot(
      fakeChart({
        indicators: [
          {
            id: 'stoch-1',
            type: 'StochRSI',
            params: { rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dSmooth: 3 },
          },
          {
            id: 'cross-1',
            type: 'EMACross',
            params: { fastPeriod: 12, slowPeriod: 26 },
          },
        ],
        results: [
          {
            id: 'stoch-1',
            values: [
              { ts: T0, k: 22, d: 18 },
              { ts: T0 + HOUR, k: 81.4, d: 74.1 },
            ],
          },
          {
            id: 'cross-1',
            values: [
              { ts: T0, fast: 100, slow: 101 },
              { ts: T0 + HOUR, fast: 102.5, slow: 101.2 },
            ],
          },
        ],
      }),
    )

    expect(snap?.indicators?.[0]?.latest).toEqual({
      ts: T0 + HOUR,
      k: 81.4,
      d: 74.1,
    })
    expect(snap?.indicators?.[1]?.latest).toEqual({
      ts: T0 + HOUR,
      fast: 102.5,
      slow: 101.2,
    })
    expect(snap?.indicators?.[0]?.values).toHaveLength(2)
    expect(snap?.indicators?.[1]?.values).toHaveLength(2)
  })

  it('caps the value window so a long series does not flood the model', () => {
    const values = Array.from({ length: 80 }, (_, i) => ({
      ts: T0 + i * HOUR,
      value: i,
    }))
    const snap = buildChartSnapshot(
      fakeChart({
        indicators: [{ id: 'ema-1', type: 'EMA', params: { period: 21 } }],
        results: [{ id: 'ema-1', values }],
      }),
    )

    expect(snap?.indicators?.[0]?.values).toEqual(values.slice(-30))
    expect(snap?.indicators?.[0]?.latest).toEqual({
      ts: T0 + 79 * HOUR,
      value: 79,
    })
  })

  it('still returns config when the engine has not computed yet', () => {
    const snap = buildChartSnapshot(
      fakeChart({
        indicators: [
          {
            id: 'macd-1',
            type: 'MACD',
            params: { fast: 12, slow: 26, signal: 9 },
          },
        ],
        results: [],
      }),
    )

    expect(snap?.indicators).toEqual([
      {
        id: 'macd-1',
        type: 'MACD',
        params: { fast: 12, slow: 26, signal: 9 },
        latest: null,
        values: [],
      },
    ])
  })
})
