// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { ema, emaLast, emaScalar } from '../indicators/ema'
import { atr, atrLast, atrLastN } from '../indicators/atr'
import { volumeMa, volumeMaLast } from '../indicators/volume-ma'
import {
  highestHigh,
  highestHighLast,
  lowestLow,
  lowestLowLast,
} from '../indicators/extremes'
import type { Candle } from '@pairlens/shared/types'

function makeCandles(
  data: Array<{ close: number; high?: number; low?: number; volume?: number }>,
): Array<Candle> {
  return data.map((d, i) => ({
    ts: (i + 1) * 60000,
    open: d.close - 0.5,
    high: d.high ?? d.close + 1,
    low: d.low ?? d.close - 1,
    close: d.close,
    volume: d.volume ?? 100,
  }))
}

describe('EMA', () => {
  it('computes basic EMA', () => {
    const candles = makeCandles([
      { close: 10 },
      { close: 11 },
      { close: 12 },
      { close: 11 },
      { close: 13 },
    ])
    const result = ema(candles, 3)
    expect(result.length).toBe(5)
    expect(Number.isNaN(result[0])).toBe(true)
    expect(Number.isNaN(result[1])).toBe(true)
    // SMA seed = (10+11+12)/3 = 11
    expect(result[2]).toBe(11)
    // EMA(3): mult = 2/(3+1) = 0.5
    // result[3] = (11 - 11) * 0.5 + 11 = 11
    expect(result[3]).toBe(11)
    // result[4] = (13 - 11) * 0.5 + 11 = 12
    expect(result[4]).toBe(12)
  })

  it('returns empty for empty input', () => {
    expect(ema([], 3)).toEqual([])
  })

  it('returns all NaN for insufficient data', () => {
    const candles = makeCandles([{ close: 10 }, { close: 11 }])
    const result = ema(candles, 5)
    expect(result.every((v) => Number.isNaN(v))).toBe(true)
  })

  it('emaLast matches tail of full ema', () => {
    const candles = makeCandles(
      Array.from({ length: 20 }, (_, i) => ({ close: 100 + i })),
    )
    const full = ema(candles, 5)
    const last3 = emaLast(candles, 5, 3)
    expect(last3).toEqual(full.slice(-3))
  })

  it('emaScalar matches last value of full ema', () => {
    const candles = makeCandles(
      Array.from({ length: 20 }, (_, i) => ({ close: 100 + i })),
    )
    const full = ema(candles, 5)
    const scalar = emaScalar(candles, 5)
    expect(scalar).toBe(full[full.length - 1])
  })
})

describe('ATR', () => {
  it('computes basic ATR with Wilder smoothing', () => {
    const candles = makeCandles(
      Array.from({ length: 20 }, (_, i) => ({
        close: 100 + i,
        high: 102 + i,
        low: 98 + i,
      })),
    )
    const result = atr(candles, 5)
    expect(result.length).toBe(20)
    // First 5 should be NaN
    for (let i = 0; i < 5; i++) {
      expect(Number.isNaN(result[i])).toBe(true)
    }
    // ATR at index 5 should be a valid number
    expect(Number.isNaN(result[5])).toBe(false)
    expect(result[5]).toBeGreaterThan(0)
  })

  it('atrLast matches last valid value', () => {
    const candles = makeCandles(
      Array.from({ length: 20 }, (_, i) => ({
        close: 100 + i,
        high: 102 + i,
        low: 98 + i,
      })),
    )
    const full = atr(candles, 5)
    const last = atrLast(candles, 5)
    expect(last).toBe(full[full.length - 1])
  })

  it('atrLastN matches tail of full atr', () => {
    const candles = makeCandles(
      Array.from({ length: 20 }, (_, i) => ({
        close: 100 + i,
        high: 102 + i,
        low: 98 + i,
      })),
    )
    const full = atr(candles, 5)
    const last3 = atrLastN(candles, 5, 3)
    expect(last3).toEqual(full.slice(-3))
  })
})

describe('Volume MA', () => {
  it('computes SMA of volume', () => {
    const candles = makeCandles([
      { close: 10, volume: 100 },
      { close: 11, volume: 200 },
      { close: 12, volume: 300 },
      { close: 13, volume: 400 },
    ])
    const result = volumeMa(candles, 3)
    expect(result.length).toBe(4)
    expect(Number.isNaN(result[0])).toBe(true)
    expect(Number.isNaN(result[1])).toBe(true)
    expect(result[2]).toBe(200) // (100+200+300)/3
    expect(result[3]).toBe(300) // (200+300+400)/3
  })

  it('volumeMaLast matches last value', () => {
    const candles = makeCandles([
      { close: 10, volume: 100 },
      { close: 11, volume: 200 },
      { close: 12, volume: 300 },
      { close: 13, volume: 400 },
    ])
    const full = volumeMa(candles, 3)
    const last = volumeMaLast(candles, 3)
    expect(last).toBe(full[full.length - 1])
  })
})

describe('Highest/Lowest', () => {
  it('computes rolling highest high', () => {
    const candles = makeCandles([
      { close: 10, high: 12 },
      { close: 8, high: 9 },
      { close: 15, high: 17 },
      { close: 11, high: 13 },
    ])
    const result = highestHigh(candles, 3)
    expect(Number.isNaN(result[0])).toBe(true)
    expect(Number.isNaN(result[1])).toBe(true)
    expect(result[2]).toBe(17) // max(12, 9, 17)
    expect(result[3]).toBe(17) // max(9, 17, 13)
  })

  it('highestHighLast matches last value', () => {
    const candles = makeCandles([
      { close: 10, high: 12 },
      { close: 8, high: 9 },
      { close: 15, high: 17 },
      { close: 11, high: 13 },
    ])
    expect(highestHighLast(candles, 3)).toBe(17)
  })

  it('computes rolling lowest low', () => {
    const candles = makeCandles([
      { close: 10, low: 8 },
      { close: 15, low: 13 },
      { close: 7, low: 5 },
      { close: 12, low: 10 },
    ])
    const result = lowestLow(candles, 3)
    expect(Number.isNaN(result[0])).toBe(true)
    expect(Number.isNaN(result[1])).toBe(true)
    expect(result[2]).toBe(5) // min(8, 13, 5)
    expect(result[3]).toBe(5) // min(13, 5, 10)
  })

  it('lowestLowLast matches last value', () => {
    const candles = makeCandles([
      { close: 10, low: 8 },
      { close: 15, low: 13 },
      { close: 7, low: 5 },
      { close: 12, low: 10 },
    ])
    expect(lowestLowLast(candles, 3)).toBe(5)
  })
})
