// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { computeSignals, scanSignals } from '../compute'
import type { Candle } from '@pairlens/shared/types'

const MINUTE = 60000

function makeRangeCandles(count: number, base = 100): Array<Candle> {
  return Array.from({ length: count }, (_, i) => ({
    ts: (i + 1) * MINUTE,
    open: base,
    high: base + 2,
    low: base - 2,
    close: base + (i % 2 === 0 ? 1 : -1),
    volume: 100,
  }))
}

/** Range candles, then a high-volume breakout bar, then quiet drift back. */
function makeBreakoutSeries(): Array<Candle> {
  const candles = makeRangeCandles(45, 100)
  candles.push({
    ts: 46 * MINUTE,
    open: 101,
    high: 115,
    low: 101,
    close: 110,
    volume: 600,
  })
  // Quiet bars after the breakout so the run ends.
  for (let i = 0; i < 10; i++) {
    candles.push({
      ts: (47 + i) * MINUTE,
      open: 110,
      high: 111,
      low: 109,
      close: 110 + (i % 2 === 0 ? 0.5 : -0.5),
      volume: 100,
    })
  }
  return candles
}

describe('scanSignals', () => {
  it('returns empty scan below the minimum bar count', () => {
    const scan = scanSignals(makeRangeCandles(30), 50)
    expect(scan.scannedBars).toBe(0)
    expect(scan.signals).toEqual([])
  })

  it('finds a historical signal that no longer fires on the last bar', () => {
    const candles = makeBreakoutSeries()
    // Sanity: the newest bar itself has no signal.
    expect(computeSignals(candles)).toBeNull()

    const scan = scanSignals(candles, candles.length)
    expect(scan.signals.length).toBeGreaterThan(0)
    const breakout = scan.signals.find((s) => s.signal.strategy === 'breakout')
    expect(breakout).toBeDefined()
    expect(breakout!.signal.direction).toBe('long')
    expect(breakout!.firstTs).toBe(46 * MINUTE)
    expect(breakout!.active).toBe(false)
  })

  it('collapses consecutive bars of the same signal into one run', () => {
    const candles = makeBreakoutSeries()
    const scan = scanSignals(candles, candles.length)
    const breakouts = scan.signals.filter(
      (s) => s.signal.strategy === 'breakout' && s.signal.direction === 'long',
    )
    expect(breakouts.length).toBe(1)
    expect(breakouts[0].lastTs).toBeGreaterThanOrEqual(breakouts[0].firstTs)
  })

  it('marks a signal active when it fires on the newest bar', () => {
    const candles = makeRangeCandles(45, 100)
    candles.push({
      ts: 46 * MINUTE,
      open: 101,
      high: 115,
      low: 101,
      close: 110,
      volume: 600,
    })
    const scan = scanSignals(candles, candles.length)
    expect(scan.signals.length).toBeGreaterThan(0)
    expect(scan.signals[0].active).toBe(true)
    expect(scan.signals[0].lastTs).toBe(46 * MINUTE)
  })

  it('respects the lookback window', () => {
    const candles = makeBreakoutSeries()
    // Breakout fired at bar index 45; scan only the last 5 bars.
    const scan = scanSignals(candles, 5)
    expect(scan.scannedBars).toBe(5)
    expect(
      scan.signals.find((s) => s.signal.strategy === 'breakout'),
    ).toBeUndefined()
  })

  it('orders runs newest-first', () => {
    const candles = makeBreakoutSeries()
    const scan = scanSignals(candles, candles.length)
    for (let i = 1; i < scan.signals.length; i++) {
      expect(scan.signals[i - 1].firstTs).toBeGreaterThanOrEqual(
        scan.signals[i].lastTs,
      )
    }
  })
})
