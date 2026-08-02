// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * These series are what a user judges a strategy by, so the arithmetic gets
 * pinned down here rather than eyeballed on a chart.
 */
import { describe, expect, test } from 'bun:test'

import {
  bucketBotDays,
  buildBotSeries,
  summarizeBotTrades,
} from '../bot-series'
import type { BotTrade } from '@/stores/bot-runs-store'

const DAY = 24 * 60 * 60 * 1000

function trade(over: Partial<BotTrade> = {}): BotTrade {
  return {
    id: crypto.randomUUID(),
    direction: 'long',
    entryTs: DAY,
    entryPrice: 100,
    exitTs: DAY + 1000,
    exitPrice: 110,
    quantity: 2,
    pnl: 20,
    pnlPercent: 0.1,
    exitReason: 'signal',
    mode: 'paper',
    ...over,
  }
}

describe('buildBotSeries', () => {
  test('an empty ledger plots nothing, not a flat zero', () => {
    // "It traded and made nothing" and "it has not traded" are different
    // claims; a lone point at zero would assert the first.
    expect(buildBotSeries([])).toEqual([])
  })

  test('counts both legs of a round trip, at the times they happened', () => {
    const points = buildBotSeries([trade()])
    expect(points).toHaveLength(2)
    // Entry: 2 @ 100 moved, nothing realized yet.
    expect(points[0]).toEqual({ ts: DAY, pnl: 0, volume: 200, trades: 0 })
    // Exit: 2 @ 110 more moved, and now the P&L exists.
    expect(points[1]).toEqual({
      ts: DAY + 1000,
      pnl: 20,
      volume: 420,
      trades: 1,
    })
  })

  test('an open position moves volume but never P&L', () => {
    const points = buildBotSeries([
      trade({ exitTs: null, exitPrice: null, pnl: null }),
    ])
    expect(points).toEqual([{ ts: DAY, pnl: 0, volume: 200, trades: 0 }])
  })

  test('accumulates across trades in time order, not store order', () => {
    // The store keeps trades newest-first — the series must not inherit that.
    const older = trade({ entryTs: DAY, exitTs: DAY + 100, pnl: 10 })
    const newer = trade({ entryTs: 2 * DAY, exitTs: 2 * DAY + 100, pnl: -4 })
    const points = buildBotSeries([newer, older])
    expect(points.map((p) => p.ts)).toEqual([
      DAY,
      DAY + 100,
      2 * DAY,
      2 * DAY + 100,
    ])
    expect(points.map((p) => p.pnl)).toEqual([0, 10, 10, 6])
    expect(points.map((p) => p.trades)).toEqual([0, 1, 1, 2])
  })

  test('collapses fills that land on the same millisecond', () => {
    // A flip closes and opens at one price and one instant; two x-values at
    // the same time would draw a meaningless vertical spike.
    const points = buildBotSeries([
      trade({ entryTs: DAY, exitTs: 2 * DAY, pnl: 5 }),
      trade({ entryTs: 2 * DAY, exitTs: 3 * DAY, pnl: 7 }),
    ])
    expect(points.map((p) => p.ts)).toEqual([DAY, 2 * DAY, 3 * DAY])
    // The 2*DAY point carries the exit of one and the entry of the other.
    expect(points[1]).toEqual({
      ts: 2 * DAY,
      pnl: 5,
      volume: 200 + 220 + 200,
      trades: 1,
    })
  })

  test('a malformed record degrades to zero instead of NaN', () => {
    const points = buildBotSeries([
      trade({ quantity: Number.NaN, pnl: Number.NaN }),
    ])
    for (const point of points) {
      expect(Number.isFinite(point.pnl)).toBe(true)
      expect(Number.isFinite(point.volume)).toBe(true)
    }
  })
})

describe('bucketBotDays', () => {
  test('fills the quiet days rather than omitting them', () => {
    // Skipping empty days would make a quiet week look like a busy one.
    const days = bucketBotDays([
      trade({ entryTs: DAY, exitTs: DAY + 10, pnl: 3 }),
      trade({ entryTs: 4 * DAY, exitTs: 4 * DAY + 10, pnl: -1 }),
    ])
    expect(days).toHaveLength(4)
    expect(days.map((d) => d.trades)).toEqual([1, 0, 0, 1])
    expect(days[1].volume).toBe(0)
  })

  test('sums a day that saw several trades', () => {
    const days = bucketBotDays([
      trade({ entryTs: DAY, exitTs: DAY + 10, pnl: 3 }),
      trade({ entryTs: DAY + 20, exitTs: DAY + 30, pnl: 4 }),
    ])
    expect(days).toHaveLength(1)
    expect(days[0].trades).toBe(2)
    expect(days[0].pnl).toBe(7)
  })

  test('an empty ledger buckets to nothing', () => {
    expect(bucketBotDays([])).toEqual([])
  })
})

describe('summarizeBotTrades', () => {
  test('separates closed from open and counts only realized outcomes', () => {
    const summary = summarizeBotTrades([
      trade({ pnl: 10 }),
      trade({ pnl: -4 }),
      trade({ exitTs: null, exitPrice: null, pnl: null }),
    ])
    expect(summary.closed).toBe(2)
    expect(summary.open).toBe(1)
    expect(summary.wins).toBe(1)
    expect(summary.losses).toBe(1)
    expect(summary.winRate).toBe(0.5)
    expect(summary.bestPnl).toBe(10)
    expect(summary.worstPnl).toBe(-4)
    expect(summary.averagePnl).toBe(3)
  })

  test('a breakeven is neither a win nor a loss, but still a trade', () => {
    const summary = summarizeBotTrades([trade({ pnl: 0 })])
    expect(summary.closed).toBe(1)
    expect(summary.wins).toBe(0)
    expect(summary.losses).toBe(0)
    // Counted in the base, so a breakeven drags the rate down rather than
    // vanishing from it.
    expect(summary.winRate).toBe(0)
  })

  test('volume includes an open position’s entry leg only', () => {
    const summary = summarizeBotTrades([
      trade({ exitTs: null, exitPrice: null, pnl: null }),
    ])
    expect(summary.volume).toBe(200)
  })

  test('an empty ledger summarizes to zeroes, not NaN', () => {
    const summary = summarizeBotTrades([])
    expect(summary.winRate).toBe(0)
    expect(summary.averagePnl).toBe(0)
  })
})
