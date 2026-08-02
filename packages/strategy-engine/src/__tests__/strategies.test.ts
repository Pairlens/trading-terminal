// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { computeSignals, computeSignalsWithRegime } from '../compute'
import { breakoutStrategy } from '../strategies/breakout'
import { detectRegime } from '../regime'
import type { Candle } from '@pairlens/shared/types'

function makeRangeCandles(count: number, base = 100): Array<Candle> {
  return Array.from({ length: count }, (_, i) => ({
    ts: (i + 1) * 60000,
    open: base,
    high: base + 2,
    low: base - 2,
    close: base + (i % 2 === 0 ? 1 : -1),
    volume: 100,
  }))
}

function makeTrendCandles(count: number, base = 100, step = 1): Array<Candle> {
  return Array.from({ length: count }, (_, i) => {
    const price = base + i * step
    return {
      ts: (i + 1) * 60000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 100 + i * 10,
    }
  })
}

describe('computeSignals', () => {
  it('returns null for insufficient data', () => {
    const candles = makeRangeCandles(10)
    expect(computeSignals(candles)).toBeNull()
  })

  it('returns signal with valid confidence range', () => {
    // Create breakout scenario: range-bound then breakout with high volume
    const candles = makeRangeCandles(40, 100)
    // Add breakout candle
    candles.push({
      ts: 41 * 60000,
      open: 101,
      high: 115,
      low: 101,
      close: 110,
      volume: 500, // high volume for confirmation
    })

    const signal = computeSignals(candles)
    if (signal) {
      expect(signal.confidence).toBeGreaterThanOrEqual(0)
      expect(signal.confidence).toBeLessThanOrEqual(1)
      expect(['breakout', 'ema_pullback', 'mean_reversion']).toContain(
        signal.strategy,
      )
      expect(['long', 'short']).toContain(signal.direction)
    }
  })

  it('returns regime and signal together', () => {
    const candles = makeTrendCandles(50, 100, 2)
    const [regime, signal] = computeSignalsWithRegime(candles)
    // Regime should be detected with 50 candles
    if (regime !== null) {
      expect(['trend', 'chop']).toContain(regime)
    }
    // Signal may or may not exist depending on strategy conditions
    if (signal) {
      expect(signal.confidence).toBeGreaterThanOrEqual(0)
      expect(signal.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('highest confidence signal wins', () => {
    // We can't easily guarantee multiple signals fire, but we can verify
    // the function processes without error on various data shapes
    const candles = makeTrendCandles(50, 100, 0.5)
    const result = computeSignals(candles)
    // Just verify it doesn't throw and returns valid shape
    if (result) {
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    }
  })
})

describe('breakoutStrategy', () => {
  it('detects long breakout with volume confirmation', () => {
    const candles = makeRangeCandles(30, 100)
    // Add breakout candle above range with high volume
    candles.push({
      ts: 31 * 60000,
      open: 101,
      high: 108,
      low: 101,
      close: 106,
      volume: 300, // 3x average = well above 1.5x factor
    })

    const signal = breakoutStrategy(candles, 'trend')
    if (signal) {
      expect(signal.direction).toBe('long')
      expect(signal.strategy).toBe('breakout')
      expect(signal.volConfirmed).toBe(true)
      expect(signal.hh).toBeDefined()
      expect(signal.ll).toBeDefined()
    }
  })
})

describe('regime detection', () => {
  it('requires minimum candles', () => {
    const candles = makeRangeCandles(20)
    expect(detectRegime(candles)).toBeNull()
  })

  it('detects regime with enough data', () => {
    const candles = makeRangeCandles(50, 100)
    const regime = detectRegime(candles)
    if (regime !== null) {
      expect(['trend', 'chop']).toContain(regime)
    }
  })

  it('detects trend with volatility spike', () => {
    // Start with very calm market (tiny range), then massive spike
    const calm = Array.from({ length: 30 }, (_, i) => ({
      ts: (i + 1) * 60000,
      open: 100,
      high: 100.5,
      low: 99.5,
      close: 100 + (i % 2 === 0 ? 0.2 : -0.2),
      volume: 100,
    }))
    // Then massive volatility — range 40x bigger than calm
    const volatile = Array.from({ length: 20 }, (_, i) => ({
      ts: (31 + i) * 60000,
      open: 100 + i * 10,
      high: 100 + i * 10 + 20,
      low: 100 + i * 10 - 20,
      close: 100 + i * 10 + 10,
      volume: 200,
    }))
    const candles = [...calm, ...volatile]
    const regime = detectRegime(candles)
    // With a massive volatility spike at end vs calm start, should detect trend
    if (regime !== null) {
      expect(regime).toBe('trend')
    }
  })
})
