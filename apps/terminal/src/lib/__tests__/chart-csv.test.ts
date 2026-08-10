// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  barsInViewport,
  buildChartCsv,
  chartCsvFileName,
  formatCsvNumber,
  formatCsvTime,
} from '../chart-csv'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 7, 10, 0, 0, 0)

function bar(index: number, close: number): ChartBar {
  return {
    ts: T0 + index * HOUR,
    open: close - 1,
    high: close + 2,
    low: close - 3,
    close,
    volume: 10 + index,
  }
}

const BARS = [bar(0, 100), bar(1, 101), bar(2, 102)]

function rows(csv: string): Array<string> {
  return csv.trimEnd().split('\n')
}

describe('formatCsvNumber', () => {
  test('leaves ordinary numbers alone', () => {
    expect(formatCsvNumber(64_123.5)).toBe('64123.5')
    expect(formatCsvNumber(0)).toBe('0')
    expect(formatCsvNumber(-1.25)).toBe('-1.25')
  })

  test('expands the exponent notation spreadsheets import as text', () => {
    expect(formatCsvNumber(1e-7)).toBe('0.0000001')
    expect(formatCsvNumber(0.0000000123)).toBe('0.0000000123')
    expect(formatCsvNumber(-1.25e-8)).toBe('-0.0000000125')
    expect(formatCsvNumber(1e21)).toBe('1000000000000000000000')
  })

  test('does not spill the binary tail of a plain decimal', () => {
    expect(formatCsvNumber(0.1)).toBe('0.1')
  })

  test('non-finite values export as empty, not NaN', () => {
    expect(formatCsvNumber(Number.NaN)).toBe('')
    expect(formatCsvNumber(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('formatCsvTime', () => {
  test('renders each format from the same millisecond timestamp', () => {
    expect(formatCsvTime(T0, 'iso')).toBe('2026-08-10T00:00:00.000Z')
    expect(formatCsvTime(T0, 'utc')).toBe('2026-08-10 00:00:00')
    expect(formatCsvTime(T0, 'unixSeconds')).toBe(String(T0 / 1000))
    expect(formatCsvTime(T0, 'unixMillis')).toBe(String(T0))
  })
})

describe('buildChartCsv', () => {
  test('writes an OHLCV row per bar under a header', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: BARS },
      timeFormat: 'iso',
    })
    const lines = rows(csv)

    expect(lines[0]).toBe('time,open,high,low,close,volume')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toBe('2026-08-10T00:00:00.000Z,99,102,97,100,10')
    expect(csv.endsWith('\n')).toBe(true)
  })

  test('a compare symbol joins on timestamp and leaves gaps empty', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: BARS },
      // Listed later than the base pair: no value for the first two rows.
      compares: [{ label: 'ETH-USDT', bars: [bar(2, 3_000)] }],
      timeFormat: 'unixMillis',
    })
    const lines = rows(csv)

    expect(lines[0]).toBe('time,open,high,low,close,volume,ETH-USDT close')
    expect(lines[1].endsWith(',')).toBe(true)
    expect(lines[2].endsWith(',')).toBe(true)
    expect(lines[3].endsWith(',3000')).toBe(true)
  })

  test('a single-plot indicator gets one column named after itself', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: BARS },
      indicators: [
        {
          label: 'ema (21)',
          values: [
            { ts: BARS[1].ts, value: 100.5 },
            { ts: BARS[2].ts, value: 101.5 },
          ],
        },
      ],
      timeFormat: 'unixSeconds',
    })
    const lines = rows(csv)

    expect(lines[0]).toBe('time,open,high,low,close,volume,ema (21)')
    // Warm-up bars produce no value — the cell stays empty rather than
    // borrowing the next bar's.
    expect(lines[1].endsWith(',')).toBe(true)
    expect(lines[2].endsWith(',100.5')).toBe(true)
  })

  test('a multi-plot indicator gets a column per key, in first-seen order', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: BARS },
      indicators: [
        {
          label: 'MACD',
          values: BARS.map((b, i) => ({
            ts: b.ts,
            macd: i,
            signal: i / 2,
            histogram: i / 4,
          })),
        },
      ],
      timeFormat: 'unixMillis',
    })

    // The plot keyed after the indicator itself drops the suffix: `MACD macd`
    // reads like a typo.
    expect(rows(csv)[0]).toBe(
      'time,open,high,low,close,volume,MACD,MACD signal,MACD histogram',
    )
    expect(rows(csv)[3].endsWith(',2,1,0.5')).toBe(true)
  })

  test('keys that only appear on later points still get a column', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: BARS },
      indicators: [
        {
          label: 'supertrend',
          values: [
            { ts: BARS[0].ts, value: 1 },
            { ts: BARS[1].ts, value: 2, flipped: true },
          ],
        },
      ],
      timeFormat: 'unixMillis',
    })
    const lines = rows(csv)

    expect(lines[0]).toBe(
      'time,open,high,low,close,volume,supertrend value,supertrend flipped',
    )
    expect(lines[1].endsWith(',1,')).toBe(true)
    expect(lines[2].endsWith(',2,true')).toBe(true)
  })

  test('two identical indicators do not collide on one header', () => {
    const values = [{ ts: BARS[0].ts, value: 1 }]
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: BARS },
      indicators: [
        { label: 'ema (21)', values },
        { label: 'ema (21)', values },
      ],
      timeFormat: 'unixMillis',
    })

    expect(rows(csv)[0]).toBe(
      'time,open,high,low,close,volume,ema (21),ema (21) (2)',
    )
  })

  test('quotes a label carrying a comma or a quote', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: [] },
      indicators: [
        { label: 'my "best", indicator', values: [{ ts: 1, value: 1 }] },
      ],
      timeFormat: 'iso',
    })

    expect(rows(csv)[0]).toBe(
      'time,open,high,low,close,volume,"my ""best"", indicator"',
    )
  })

  test('defuses a label a spreadsheet would run as a formula', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: [] },
      indicators: [{ label: '=1+1', values: [{ ts: 1, value: 1 }] }],
      timeFormat: 'iso',
    })

    expect(rows(csv)[0]).toBe("time,open,high,low,close,volume,'=1+1")
  })

  test('negative values keep their sign', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: BARS.slice(0, 1) },
      indicators: [
        { label: 'macd', values: [{ ts: BARS[0].ts, value: -3.5 }] },
      ],
      timeFormat: 'unixMillis',
    })

    expect(rows(csv)[1].endsWith(',-3.5')).toBe(true)
  })

  test('an empty chart still exports its header', () => {
    const csv = buildChartCsv({
      main: { label: 'BTC-USDT', bars: [] },
      timeFormat: 'iso',
    })

    expect(csv).toBe('time,open,high,low,close,volume\n')
  })
})

describe('barsInViewport', () => {
  test('takes both ends inclusively', () => {
    expect(barsInViewport(BARS, { startIndex: 1, endIndex: 2 })).toEqual([
      BARS[1],
      BARS[2],
    ])
  })

  test('clamps a viewport scrolled past the last bar', () => {
    // The right margin scrolls into empty space, so endIndex outruns the data.
    expect(barsInViewport(BARS, { startIndex: -4, endIndex: 40 })).toEqual(BARS)
  })

  test('fractional indices widen to whole bars', () => {
    expect(barsInViewport(BARS, { startIndex: 0.7, endIndex: 1.2 })).toEqual([
      BARS[0],
      BARS[1],
      BARS[2],
    ])
  })

  test('a viewport entirely past the data exports nothing', () => {
    expect(barsInViewport(BARS, { startIndex: 8, endIndex: 12 })).toEqual([])
  })
})

describe('chartCsvFileName', () => {
  test('names the file after the chart and the day', () => {
    expect(
      chartCsvFileName({
        pairKey: 'BTC-USDT',
        market: 'okx',
        timeframe: '1h',
        now: new Date(T0),
      }),
    ).toBe('BTC-USDT_okx_1h_2026-08-10.csv')
  })

  test('strips characters a filesystem would reject', () => {
    expect(
      chartCsvFileName({
        pairKey: 'SOL/USDC:raydium',
        market: 'jupiter',
        timeframe: '15m',
        now: new Date(T0),
      }),
    ).toBe('SOL_USDC_raydium_jupiter_15m_2026-08-10.csv')
  })
})
