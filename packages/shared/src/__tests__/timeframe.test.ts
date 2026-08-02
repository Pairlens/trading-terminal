// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  expectedLatestClosedTs,
  isContiguousSeries,
  latestTs,
  timeframeToMs,
} from '../timeframe'
import type { Candle } from '../types'

const makeCandle = (ts: number): Candle => ({
  ts,
  open: 1,
  high: 2,
  low: 0.5,
  close: 1.2,
  volume: 10,
})

describe('timeframe utilities', () => {
  it('maps supported timeframes to milliseconds', () => {
    expect(timeframeToMs('1m')).toBe(60_000)
    expect(timeframeToMs('5m')).toBe(300_000)
    expect(timeframeToMs('15m')).toBe(900_000)
    expect(timeframeToMs('30m')).toBe(1_800_000)
    expect(timeframeToMs('1h')).toBe(3_600_000)
    expect(timeframeToMs('2h')).toBe(7_200_000)
    expect(timeframeToMs('4h')).toBe(14_400_000)
    expect(timeframeToMs('1d')).toBe(86_400_000)
    expect(timeframeToMs('1w')).toBe(604_800_000)
  })

  it('calculates the expected latest closed candle timestamp', () => {
    expect(expectedLatestClosedTs(3_600_000, 60_000)).toBe(3_540_000)
    expect(expectedLatestClosedTs(3_659_000, 60_000)).toBe(3_540_000)
    expect(expectedLatestClosedTs(1_000, 3_600_000)).toBe(0)
  })

  it('reports whether a series is contiguous for a timeframe', () => {
    const tfMs = 60_000
    expect(
      isContiguousSeries(
        [makeCandle(60_000), makeCandle(120_000), makeCandle(180_000)],
        tfMs,
      ),
    ).toBeTrue()
    expect(
      isContiguousSeries([makeCandle(60_000), makeCandle(180_000)], tfMs),
    ).toBeFalse()
    expect(
      isContiguousSeries([makeCandle(60_000), makeCandle(60_000)], tfMs),
    ).toBeFalse()
  })

  it('returns the latest timestamp from a candle set', () => {
    expect(latestTs([])).toBeNull()
    expect(
      latestTs([makeCandle(120_000), makeCandle(60_000), makeCandle(180_000)]),
    ).toBe(180_000)
  })
})
