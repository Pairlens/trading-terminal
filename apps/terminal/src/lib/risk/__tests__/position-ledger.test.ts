// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { PositionLedger } from '../position-ledger'

describe('PositionLedger — average-cost realized PnL', () => {
  it('realizes profit on a simple buy-then-sell round trip', () => {
    const l = new PositionLedger()
    expect(l.applyFill('b1', 'BTC-USDT', 'buy', 1, 100)).toBe(0)
    // sell the unit at 120 -> realized (120 - 100) * 1
    expect(l.applyFill('s1', 'BTC-USDT', 'sell', 1, 120)).toBeCloseTo(20, 9)
    expect(l.position('BTC-USDT').qty).toBe(0)
  })

  it('realizes a loss as a negative number (feeds the daily-loss guard)', () => {
    const l = new PositionLedger()
    l.applyFill('b1', 'ETH-USDT', 'buy', 2, 2000)
    expect(l.applyFill('s1', 'ETH-USDT', 'sell', 2, 1900)).toBeCloseTo(-200, 9)
  })

  it('uses a weighted average cost across multiple buys', () => {
    const l = new PositionLedger()
    l.applyFill('b1', 'BTC-USDT', 'buy', 1, 100)
    l.applyFill('b2', 'BTC-USDT', 'buy', 1, 200) // avg cost now 150
    expect(l.position('BTC-USDT').avgCost).toBeCloseTo(150, 9)
    expect(l.applyFill('s1', 'BTC-USDT', 'sell', 2, 160)).toBeCloseTo(20, 9) // (160-150)*2
  })

  it('counts only the new increment from cumulative order updates', () => {
    const l = new PositionLedger()
    l.applyFill('b1', 'BTC-USDT', 'buy', 2, 100)
    // First sell update: cumulative 1 filled at 120
    expect(l.applyFill('s1', 'BTC-USDT', 'sell', 1, 120)).toBeCloseTo(20, 9)
    // Second update for the SAME order: cumulative now 2 — only +1 is new
    expect(l.applyFill('s1', 'BTC-USDT', 'sell', 2, 120)).toBeCloseTo(20, 9)
    // A repeated/stale update with no new fill realizes nothing
    expect(l.applyFill('s1', 'BTC-USDT', 'sell', 2, 120)).toBe(0)
  })

  it('does not fabricate PnL when selling without a known cost basis', () => {
    const l = new PositionLedger()
    // No prior buy this session — selling pre-existing coins realizes 0.
    expect(l.applyFill('s1', 'BTC-USDT', 'sell', 1, 50000)).toBe(0)
  })

  it('realizes PnL only for the portion with a basis when overselling', () => {
    const l = new PositionLedger()
    l.applyFill('b1', 'BTC-USDT', 'buy', 1, 100)
    // Sell 3 but only 1 has a basis -> (150-100)*1 = 50
    expect(l.applyFill('s1', 'BTC-USDT', 'sell', 3, 150)).toBeCloseTo(50, 9)
    expect(l.position('BTC-USDT').qty).toBe(0)
  })

  it('ignores zero/invalid fills', () => {
    const l = new PositionLedger()
    expect(l.applyFill('x', 'BTC-USDT', 'buy', 0, 100)).toBe(0)
    expect(l.applyFill('x', 'BTC-USDT', 'buy', 1, 0)).toBe(0)
  })
})
