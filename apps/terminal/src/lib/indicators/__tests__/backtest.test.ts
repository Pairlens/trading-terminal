// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { resolveTargets, runBacktest } from '../backtest'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type { CustomIndicatorStrategySpec } from '@pairlens/shared/plugin-types'

const START = 1_700_000_000_000
const MINUTE = 60_000

/** Bars on a 1m grid; closes default to opens so trade maths stays hand-checkable. */
const makeBars = (
  opens: Array<number>,
  closes: Array<number> = opens,
): Array<ChartBar> =>
  opens.map((open, i) => ({
    ts: START + i * MINUTE,
    open,
    high: Math.max(open, closes[i]),
    low: Math.min(open, closes[i]),
    close: closes[i],
    volume: 1,
  }))

const f64 = (values: Array<number>): Float64Array => Float64Array.from(values)

const makeSpec = (
  over: Partial<CustomIndicatorStrategySpec> = {},
): CustomIndicatorStrategySpec => ({
  initialCapital: 10_000,
  positionSize: 1,
  fee: 0,
  slippage: 0,
  allowShort: true,
  ...over,
})

describe('runBacktest — single long trade', () => {
  // Signal on bar 1 -> fill at bars[2].open (106); signal off on bar 3 ->
  // fill at bars[4].open (112).
  const bars = makeBars([100, 100, 106, 110, 112], [100, 105, 110, 112, 115])
  const spec = makeSpec({ fee: 0.001, slippage: 0.001 })
  const result = runBacktest(bars, { long: f64([0, 1, 1, 0, 0]) }, spec)

  const entryPrice = 106 * 1.001
  const exitPrice = 112 * 0.999
  // The notional and its fee share the same budget, so a full-size entry
  // spends exactly the equity available: committed * (1 + fee) === 10_000.
  const committed = 10_000 / 1.001
  const quantity = committed / entryPrice
  const entryFee = committed * 0.001
  const exitFee = quantity * exitPrice * 0.001
  const expectedPnl = (exitPrice - entryPrice) * quantity - entryFee - exitFee

  it('fills at the next open, slipped against the trade direction', () => {
    expect(result.trades).toHaveLength(1)
    const trade = result.trades[0]
    expect(trade.direction).toBe('long')
    expect(trade.entryIndex).toBe(2)
    expect(trade.exitIndex).toBe(4)
    expect(trade.entryTs).toBe(bars[2].ts)
    expect(trade.exitTs).toBe(bars[4].ts)
    expect(trade.entryPrice).toBeCloseTo(106.106, 9)
    expect(trade.exitPrice).toBeCloseTo(111.888, 9)
    expect(trade.quantity).toBeCloseTo(quantity, 9)
    expect(trade.bars).toBe(2)
  })

  it('nets both fees and both slippage legs out of the P&L', () => {
    expect(result.trades[0].pnl).toBeCloseTo(expectedPnl, 9)
    expect(result.trades[0].pnlPercent).toBeCloseTo(
      expectedPnl / (quantity * entryPrice),
      9,
    )
    expect(result.stats.totalFees).toBeCloseTo(entryFee + exitFee, 9)
    expect(result.stats.finalEquity).toBeCloseTo(10_000 + expectedPnl, 9)
    expect(result.stats.netProfit).toBeCloseTo(expectedPnl, 9)
    expect(result.stats.netProfitPercent).toBeCloseTo(expectedPnl / 10_000, 12)
  })

  it('compares against buy-and-hold over the same window', () => {
    expect(result.stats.buyHoldPercent).toBeCloseTo((115 - 100) / 100, 12)
  })
})

describe('runBacktest — next-bar fill discipline', () => {
  it('fills a bar-2 signal at bars[3].open', () => {
    const bars = makeBars([10, 11, 12, 13, 14, 15])
    const result = runBacktest(
      bars,
      { long: f64([0, 0, 1, 1, 0, 0]) },
      makeSpec(),
    )
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].entryIndex).toBe(3)
    expect(result.trades[0].entryPrice).toBe(13)
    expect(result.trades[0].exitIndex).toBe(5)
    expect(result.trades[0].exitPrice).toBe(15)
  })

  it('never fills a signal on the final bar', () => {
    const bars = makeBars([10, 11, 12, 13, 14])
    const result = runBacktest(bars, { long: f64([0, 0, 0, 0, 1]) }, makeSpec())
    expect(result.trades).toHaveLength(0)
    expect(result.stats.totalTrades).toBe(0)
    expect(result.stats.timeInMarket).toBe(0)
    expect(Array.from(result.position)).toEqual([0, 0, 0, 0, 0])
  })

  it('leaves a position open when data ends before an exit', () => {
    const bars = makeBars([10, 10, 10, 10], [10, 10, 10, 12])
    const result = runBacktest(bars, { long: f64([0, 1, 1, 1]) }, makeSpec())
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exitIndex).toBeNull()
    expect(result.trades[0].exitTs).toBeNull()
    expect(result.trades[0].exitPrice).toBeNull()
    // Marked to the final close: 1000 qty at 10 -> +2 per unit.
    expect(result.trades[0].pnl).toBeCloseTo(2_000, 9)
    // Open trades stay out of the closed-trade aggregates.
    expect(result.stats.totalTrades).toBe(0)
    expect(result.stats.finalEquity).toBeCloseTo(12_000, 9)
  })
})

describe('runBacktest — direction flips', () => {
  // Long from bars[2].open, flip short at bars[3].open, flat at bars[5].open.
  const bars = makeBars([100, 100, 100, 120, 120, 110])
  const spec = makeSpec({ fee: 0.001 })
  const result = runBacktest(
    bars,
    {
      long: f64([0, 1, 0, 0, 0, 0]),
      short: f64([0, 0, 1, 1, 0, 0]),
    },
    spec,
  )

  it('books an exit and an entry at the same fill price', () => {
    expect(result.trades).toHaveLength(2)
    expect(result.trades[0].direction).toBe('long')
    expect(result.trades[1].direction).toBe('short')
    expect(result.trades[0].exitIndex).toBe(3)
    expect(result.trades[1].entryIndex).toBe(3)
    expect(result.trades[0].exitPrice).toBe(result.trades[1].entryPrice)
    expect(result.trades[1].entryPrice).toBe(120)
  })

  it('pays a fee on both legs of the flip', () => {
    // Sizing commits positionSize of the equity available at the fill, with
    // the entry fee taken out of that same budget.
    const longCommitted = 10_000 / 1.001
    const longEntryFee = longCommitted * 0.001
    const longQty = longCommitted / 100
    const longExitFee = longQty * 120 * 0.001
    const cashAfterLong =
      10_000 - longEntryFee + (120 - 100) * longQty - longExitFee
    const shortCommitted = cashAfterLong / 1.001
    const shortEntryFee = shortCommitted * 0.001
    const shortQty = shortCommitted / 120
    const shortExitFee = shortQty * 110 * 0.001

    expect(result.stats.totalFees).toBeCloseTo(
      longEntryFee + longExitFee + shortEntryFee + shortExitFee,
      9,
    )
    // The two flip-bar legs are both charged, and both are nonzero.
    expect(longExitFee).toBeGreaterThan(0)
    expect(shortEntryFee).toBeGreaterThan(0)
    expect(result.trades[1].quantity).toBeCloseTo(shortQty, 9)
  })

  it('profits on the short leg when price falls', () => {
    expect(result.trades[1].pnl).toBeGreaterThan(0)
    expect(result.stats.totalTrades).toBe(2)
    expect(result.stats.winningTrades).toBe(2)
  })
})

describe('runBacktest — allowShort', () => {
  const bars = makeBars([100, 100, 100, 120, 120, 110])
  const signals = {
    long: f64([0, 1, 0, 0, 0, 0]),
    short: f64([0, 0, 1, 1, 0, 0]),
  }

  it('flattens instead of shorting when shorts are disallowed', () => {
    const result = runBacktest(bars, signals, makeSpec({ allowShort: false }))
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].direction).toBe('long')
    expect(result.trades[0].exitIndex).toBe(3)
    expect(Array.from(result.position)).toEqual([0, 0, 1, 0, 0, 0])
  })

  it('takes the short when they are allowed', () => {
    const result = runBacktest(bars, signals, makeSpec())
    expect(Array.from(result.position)).toEqual([0, 0, 1, -1, -1, 0])
  })
})

describe('runBacktest — equity curve', () => {
  const bars = makeBars(
    [100, 100, 100, 120, 90, 100],
    [100, 100, 120, 90, 100, 100],
  )
  const result = runBacktest(
    bars,
    { long: f64([0, 1, 1, 1, 1, 1]) },
    makeSpec({ initialCapital: 1_000 }),
  )

  it('has one point per bar and stays flat out of the market', () => {
    expect(result.equity).toHaveLength(bars.length)
    expect(result.drawdown).toHaveLength(bars.length)
    expect(result.position).toHaveLength(bars.length)
    // Bars 0 and 1 precede the first possible fill.
    expect(result.equity[0]).toBe(1_000)
    expect(result.equity[1]).toBe(1_000)
    expect(result.drawdown[0]).toBe(0)
  })

  it('marks to market on every bar', () => {
    // Entry at bars[2].open = 100 with 10 units.
    expect(Array.from(result.equity.subarray(2, 5))).toEqual([
      1_200, 900, 1_000,
    ])
  })

  it('measures drawdown from the running peak', () => {
    expect(result.stats.maxDrawdown).toBeCloseTo(300, 9)
    expect(result.stats.maxDrawdownPercent).toBeCloseTo(0.25, 9)
    expect(result.drawdown[3]).toBeCloseTo(0.25, 9)
    expect(result.stats.timeInMarket).toBeCloseTo(4 / 6, 9)
  })
})

describe('runBacktest — win rate and profit factor', () => {
  //           idx 0    1    2    3    4    5    6    7    8    9   10   11   12
  const opens = [100, 100, 100, 100, 110, 110, 100, 100, 120, 120, 100, 100, 90]
  const bars = makeBars(opens)
  const result = runBacktest(
    bars,
    { position: f64([0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]) },
    makeSpec({ initialCapital: 1_000 }),
  )

  it('compounds each trade onto the running equity', () => {
    expect(result.trades).toHaveLength(3)
    expect(result.trades.map((t) => t.pnl)).toEqual([100, 220, -132])
    expect(result.stats.finalEquity).toBeCloseTo(1_188, 9)
  })

  it('summarizes 2 wins and 1 loss', () => {
    const stats = result.stats
    expect(stats.totalTrades).toBe(3)
    expect(stats.winningTrades).toBe(2)
    expect(stats.losingTrades).toBe(1)
    expect(stats.winRate).toBeCloseTo(2 / 3, 12)
    expect(stats.profitFactor).toBeCloseTo(320 / 132, 12)
    expect(stats.averageWin).toBeCloseTo(160, 9)
    expect(stats.averageLoss).toBeCloseTo(-132, 9)
    expect(stats.largestWin).toBeCloseTo(220, 9)
    expect(stats.largestLoss).toBeCloseTo(-132, 9)
    expect(stats.maxConsecutiveLosses).toBe(1)
    expect(stats.averageBarsHeld).toBeCloseTo(2, 12)
    expect(stats.maxDrawdown).toBeCloseTo(132, 9)
    expect(stats.maxDrawdownPercent).toBeCloseTo(0.1, 12)
  })

  it('reports Infinity as the profit factor when nothing loses', () => {
    const winners = runBacktest(
      makeBars([10, 10, 10, 20, 20]),
      { position: f64([0, 1, 1, 0, 0]) },
      makeSpec(),
    )
    expect(winners.stats.losingTrades).toBe(0)
    expect(winners.stats.profitFactor).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('runBacktest — signal resolution', () => {
  it('rounds and clamps an arbitrary position array to -1/0/+1', () => {
    const bars = makeBars([10, 10, 10, 10, 10])
    const result = runBacktest(
      bars,
      { position: f64([0.4, 3.2, 0.6, -7, 0]) },
      makeSpec(),
    )
    expect(Array.from(result.position)).toEqual([0, 0, 1, 1, -1])
  })

  it('holds the last entry direction until an exit flattens it', () => {
    const bars = makeBars([10, 10, 10, 10, 10, 10])
    const result = runBacktest(
      bars,
      {
        entries: f64([0, 1, 0, 0, 0, 0]),
        exits: f64([0, 0, 0, 1, 0, 0]),
      },
      makeSpec(),
    )
    expect(Array.from(result.position)).toEqual([0, 0, 1, 1, 0, 0])
  })

  it('takes an entry direction from the long/short arrays', () => {
    const bars = makeBars([10, 10, 10, 10, 10])
    const result = runBacktest(
      bars,
      {
        entries: f64([0, 1, 0, 0, 0]),
        short: f64([0, 1, 0, 0, 0]),
        exits: f64([0, 0, 0, 1, 0]),
      },
      makeSpec(),
    )
    expect(Array.from(result.position)).toEqual([0, 0, -1, -1, 0])
  })

  it('treats a bar that is both long and short as flat', () => {
    const bars = makeBars([10, 10, 10, 10])
    const result = runBacktest(
      bars,
      { long: f64([1, 1, 1, 1]), short: f64([0, 1, 1, 1]) },
      makeSpec(),
    )
    expect(Array.from(result.position)).toEqual([0, 1, 0, 0])
  })
})

describe('resolveTargets — shared with the live bot runtime', () => {
  it('agrees with the position the tester actually holds, one bar later', () => {
    // The contract the live runtime depends on: the target resolved for the
    // last CLOSED bar is the position the tester takes on the NEXT bar. If
    // these ever drift, the backtest and the live bot disagree about the same
    // script.
    const bars = makeBars([10, 10, 10, 10, 10, 10, 10])
    const signals = {
      entries: f64([0, 1, 0, 0, 0, 1, 0]),
      exits: f64([0, 0, 0, 1, 0, 0, 0]),
    }
    const targets = resolveTargets(bars.length, signals, true)
    const held = runBacktest(bars, signals, makeSpec()).position
    for (let i = 1; i < bars.length; i += 1) {
      expect(held[i]).toBe(targets[i - 1])
    }
  })

  it('applies the allowShort clamp itself', () => {
    const signals = { position: f64([1, -1, -1, 0]) }
    expect(Array.from(resolveTargets(4, signals, true))).toEqual([1, -1, -1, 0])
    expect(Array.from(resolveTargets(4, signals, false))).toEqual([1, 0, 0, 0])
  })

  it('returns one target per bar regardless of signal length', () => {
    expect(resolveTargets(5, { long: f64([1, 1]) }, true)).toHaveLength(5)
    expect(resolveTargets(0, { long: f64([1, 1]) }, true)).toHaveLength(0)
    expect(Array.from(resolveTargets(4, {}, true))).toEqual([0, 0, 0, 0])
  })
})

describe('runBacktest — degenerate inputs', () => {
  it('handles empty bars', () => {
    const result = runBacktest([], {}, makeSpec())
    expect(result.trades).toHaveLength(0)
    expect(result.equity).toHaveLength(0)
    expect(result.drawdown).toHaveLength(0)
    expect(result.position).toHaveLength(0)
    expect(result.stats.initialCapital).toBe(10_000)
    expect(result.stats.finalEquity).toBe(10_000)
    expect(result.stats.netProfit).toBe(0)
    expect(result.stats.winRate).toBe(0)
    expect(result.stats.profitFactor).toBe(0)
    expect(result.stats.sharpeRatio).toBe(0)
    expect(result.stats.timeInMarket).toBe(0)
  })

  it('handles all-zero signals', () => {
    const bars = makeBars([10, 11, 12, 13])
    const result = runBacktest(bars, { long: f64([0, 0, 0, 0]) }, makeSpec())
    expect(result.trades).toHaveLength(0)
    expect(Array.from(result.equity)).toEqual([10_000, 10_000, 10_000, 10_000])
    expect(result.stats.maxDrawdown).toBe(0)
    expect(result.stats.buyHoldPercent).toBeCloseTo(0.3, 12)
  })

  it('handles no signal arrays at all', () => {
    const bars = makeBars([10, 11, 12])
    const result = runBacktest(bars, {}, makeSpec())
    expect(result.trades).toHaveLength(0)
    expect(result.stats.finalEquity).toBe(10_000)
  })

  it('treats signals shorter than bars as zero past their end', () => {
    const bars = makeBars([10, 10, 10, 10, 10, 10])
    const result = runBacktest(bars, { long: f64([0, 1, 1]) }, makeSpec())
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].entryIndex).toBe(2)
    expect(result.trades[0].exitIndex).toBe(4)
    expect(result.equity).toHaveLength(bars.length)
  })

  it('survives a non-finite spec without producing NaN stats', () => {
    const bars = makeBars([10, 11, 12, 13])
    const result = runBacktest(
      bars,
      { long: f64([0, 1, 1, 0]) },
      {
        initialCapital: Number.NaN,
        positionSize: 5,
        fee: Number.NaN,
        slippage: -1,
        allowShort: true,
      },
    )
    for (const value of Object.values(result.stats)) {
      if (typeof value === 'number') {
        expect(Number.isNaN(value)).toBe(false)
      }
    }
    expect(result.stats.initialCapital).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Protective exits. These come from @pairlens/bot-engine/risk, so what is being
// checked here is the wiring — that the tester asks at the right moment, fills
// at the trigger, charges the same fees a signal exit does, and refuses to hand
// the position straight back on the bar it was just taken off.
// ---------------------------------------------------------------------------

type Ohlc = [open: number, high: number, low: number, close: number]

/** Bars with explicit ranges: protective exits are decided by high and low. */
const makeOhlc = (rows: Array<Ohlc>): Array<ChartBar> =>
  rows.map(([open, high, low, close], i) => ({
    ts: START + i * MINUTE,
    open,
    high,
    low,
    close,
    volume: 1,
  }))

/** Long from bar 2 onwards, for a window of `count` bars. */
const holdLong = (count: number): { long: Float64Array } => ({
  long: f64(Array.from({ length: count }, (_, i) => (i === 0 ? 0 : 1))),
})

describe('runBacktest — stop loss', () => {
  // Entry at bars[2].open = 100, so the 5% stop sits at 95. Bar 4 wicks to 94.
  const bars = makeOhlc([
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 101, 99, 100],
    [100, 102, 98, 100],
    [100, 100, 94, 95],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
  ])
  const result = runBacktest(
    bars,
    holdLong(7),
    makeSpec({ initialCapital: 1_000, risk: { stopLoss: 0.05 } }),
  )

  it('exits mid-window at the trigger, not at the close', () => {
    const stopped = result.trades[0]
    expect(stopped.exitReason).toBe('stop-loss')
    expect(stopped.exitIndex).toBe(4)
    // 95 is the level; 95.0 the bar's close is a coincidence of this fixture,
    // so check the wick low was NOT used and neither was the open.
    expect(stopped.exitPrice).toBeCloseTo(95, 9)
    expect(stopped.bars).toBe(2)
    // 10 units bought at 100, sold at 95.
    expect(stopped.pnl).toBeCloseTo(-50, 9)
    expect(result.stats.losingTrades).toBe(1)
  })

  it('does not check the entry bar, whose position did not exist yet', () => {
    // bars[2] dips to 99 — well inside the eventual stop's reach had the
    // position been checked before it was opened.
    const early = runBacktest(
      makeOhlc([
        [100, 100, 100, 100],
        [100, 100, 100, 100],
        [100, 100, 50, 100],
        [100, 100, 100, 100],
      ]),
      holdLong(4),
      makeSpec({ initialCapital: 1_000, risk: { stopLoss: 0.05 } }),
    )
    expect(early.trades).toHaveLength(1)
    expect(early.trades[0].exitReason).toBe('open')
  })

  it('charges slippage on the protective fill', () => {
    const slipped = runBacktest(
      bars,
      holdLong(7),
      makeSpec({
        initialCapital: 1_000,
        slippage: 0.001,
        risk: { stopLoss: 0.05 },
      }),
    )
    // The stop is measured from the price actually paid (100.1, slipped), not
    // from the price the strategy saw, and closing a long is a sell, so the
    // fill then lands below that trigger.
    expect(slipped.trades[0].exitPrice).toBeCloseTo(100.1 * 0.95 * 0.999, 9)
  })

  it('charges the exit fee like any other exit', () => {
    const fees = runBacktest(
      bars,
      holdLong(7),
      makeSpec({ initialCapital: 1_000, fee: 0.001, risk: { stopLoss: 0.05 } }),
    )
    const committed = 1_000 / 1.001
    const entryFee = committed * 0.001
    const quantity = committed / 100
    const exitFee = quantity * 95 * 0.001
    expect(fees.trades[0].pnl).toBeCloseTo(
      (95 - 100) * quantity - entryFee - exitFee,
      9,
    )
  })
})

describe('runBacktest — take profit', () => {
  // Entry at 100; the 10% target sits at 110 and bar 4 trades through it.
  const bars = makeOhlc([
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 105, 100, 105],
    [100, 115, 100, 110],
  ])
  const result = runBacktest(
    bars,
    holdLong(5),
    makeSpec({ initialCapital: 1_000, risk: { takeProfit: 0.1 } }),
  )

  it('fills at the target rather than the bar it was reached on', () => {
    expect(result.trades).toHaveLength(1)
    const trade = result.trades[0]
    expect(trade.exitReason).toBe('take-profit')
    expect(trade.exitIndex).toBe(4)
    // 110, not the 115 high and not the 110 close by accident of this fixture.
    expect(trade.exitPrice).toBeCloseTo(110, 9)
    expect(trade.pnl).toBeCloseTo(100, 9)
    expect(result.stats.winningTrades).toBe(1)
  })
})

describe('runBacktest — trailing stop', () => {
  // Entry at 100 with a 10% trail. The trail starts at 90 and ratchets up as
  // the position runs to 130, so the exit lands ABOVE the entry — something a
  // stop measured from the entry price could never do.
  const bars = makeOhlc([
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 120, 100, 120],
    [120, 130, 115, 130],
    [130, 130, 110, 110],
  ])
  const result = runBacktest(
    bars,
    holdLong(6),
    makeSpec({ initialCapital: 1_000, risk: { trailingStop: 0.1 } }),
  )

  it('ratchets the stop up behind the high-water mark', () => {
    expect(result.trades).toHaveLength(1)
    const trade = result.trades[0]
    expect(trade.exitReason).toBe('trailing-stop')
    expect(trade.exitIndex).toBe(5)
    // 10% under the 130 extreme set on bar 4.
    expect(trade.exitPrice).toBeCloseTo(117, 9)
    expect(trade.exitPrice).toBeGreaterThan(trade.entryPrice)
    expect(trade.pnl).toBeCloseTo(170, 9)
  })

  it('survives the bar that set the extreme', () => {
    // Bar 4 fell to 115, under 10% of its own 130 high (117) but above 10% of
    // the 120 extreme it inherited. Letting a bar lift the trail it is then
    // measured against would have closed the trade there, for +8 instead of +170.
    expect(result.trades[0].exitIndex).not.toBe(4)
  })
})

describe('runBacktest — max bars', () => {
  const bars = makeOhlc([
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 110, 100, 108],
  ])
  const result = runBacktest(
    bars,
    holdLong(6),
    makeSpec({ initialCapital: 1_000, risk: { maxBars: 3 } }),
  )

  it('closes at the close once the position has aged out', () => {
    expect(result.trades).toHaveLength(1)
    const trade = result.trades[0]
    expect(trade.exitReason).toBe('max-bars')
    expect(trade.exitIndex).toBe(5)
    // Time is up only once the bar ends, so this one exit fills at the close.
    expect(trade.exitPrice).toBeCloseTo(108, 9)
    // `maxBars: 3` means three bars held, and the ledger agrees.
    expect(trade.bars).toBe(3)
    expect(trade.pnl).toBeCloseTo(80, 9)
  })
})

describe('runBacktest — short side', () => {
  // Short from bars[2].open = 100; the 5% stop sits at 105 and bar 4 spikes
  // through it.
  const bars = makeOhlc([
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 101, 100, 100],
    [100, 103, 100, 100],
    [100, 107, 100, 106],
  ])
  const result = runBacktest(
    bars,
    { short: f64([0, 1, 1, 1, 1]) },
    makeSpec({ initialCapital: 1_000, risk: { stopLoss: 0.05 } }),
  )

  it('stops a short out on the high, mirrored', () => {
    expect(result.trades).toHaveLength(1)
    const trade = result.trades[0]
    expect(trade.direction).toBe('short')
    expect(trade.exitReason).toBe('stop-loss')
    expect(trade.exitPrice).toBeCloseTo(105, 9)
    expect(trade.pnl).toBeCloseTo(-50, 9)
  })

  it('slips a short exit upwards, because closing it is a buy', () => {
    const slipped = runBacktest(
      bars,
      { short: f64([0, 1, 1, 1, 1]) },
      makeSpec({
        initialCapital: 1_000,
        slippage: 0.001,
        risk: { stopLoss: 0.05 },
      }),
    )
    // Entry slipped down to 99.9, so the stop sits at 104.895 and buying it
    // back costs a little more again.
    expect(slipped.trades[0].exitPrice).toBeCloseTo(99.9 * 1.05 * 1.001, 9)
  })
})

describe('runBacktest — re-entry after a protective exit', () => {
  // The strategy's target never changes: it holds long through the whole
  // window and has no idea it was stopped out on bar 4.
  const bars = makeOhlc([
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 101, 99, 100],
    [100, 102, 98, 100],
    [100, 100, 94, 95],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
  ])
  const result = runBacktest(
    bars,
    holdLong(7),
    makeSpec({ initialCapital: 1_000, risk: { stopLoss: 0.05 } }),
  )

  it('refuses to re-enter on the bar the stop fired', () => {
    // Without this rule the position goes straight back on at bars[4].open and
    // the stop costs a fee while changing nothing.
    expect(result.trades.some((t) => t.entryIndex === 4)).toBe(false)
    expect(result.position[4]).toBe(0)
  })

  it('re-enters on the next bar the target still asks for', () => {
    expect(result.trades).toHaveLength(2)
    expect(result.trades[1].entryIndex).toBe(5)
    expect(result.trades[1].exitReason).toBe('open')
    expect(Array.from(result.position)).toEqual([0, 0, 1, 1, 0, 1, 1])
    // Sizing compounds off the post-stop equity, not the starting capital.
    expect(result.trades[1].quantity).toBeCloseTo(9.5, 9)
  })

  it('holds the flat bar out of time-in-market', () => {
    expect(result.stats.timeInMarket).toBeCloseTo(4 / 7, 12)
  })
})

describe('runBacktest — no risk spec', () => {
  //           idx 0    1    2    3    4    5    6    7    8    9   10   11   12
  const opens = [100, 100, 100, 100, 110, 110, 100, 100, 120, 120, 100, 100, 90]
  const bars = makeBars(opens)
  const signals = { position: f64([0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]) }
  const baseline = runBacktest(
    bars,
    signals,
    makeSpec({ initialCapital: 1_000 }),
  )

  it('reproduces the pre-risk numbers exactly', () => {
    expect(baseline.trades.map((t) => t.pnl)).toEqual([100, 220, -132])
    expect(baseline.stats.finalEquity).toBeCloseTo(1_188, 9)
    expect(baseline.stats.profitFactor).toBeCloseTo(320 / 132, 12)
    expect(baseline.stats.averageBarsHeld).toBeCloseTo(2, 12)
  })

  it('labels every exit as the strategy changing its mind', () => {
    expect(baseline.trades.map((t) => t.exitReason)).toEqual([
      'signal',
      'signal',
      'signal',
    ])
  })

  it('is unchanged by an empty or unusable risk block', () => {
    const same = (over: Partial<CustomIndicatorStrategySpec>) => {
      const other = runBacktest(bars, signals, makeSpec(over))
      expect(other.trades).toEqual(baseline.trades)
      expect(other.stats).toEqual(baseline.stats)
      expect(Array.from(other.equity)).toEqual(Array.from(baseline.equity))
      expect(Array.from(other.position)).toEqual(Array.from(baseline.position))
    }
    same({ initialCapital: 1_000, risk: {} })
    // Zero is an unconfigured distance, not a stop at the entry price — a
    // strategy declaring one must not have every position closed on sight.
    same({ initialCapital: 1_000, risk: { stopLoss: 0, trailingStop: 0 } })
    same({ initialCapital: 1_000, risk: { maxBars: 0 } })
  })
})

describe('runBacktest — sharpe ratio', () => {
  it('is finite for a moving equity curve', () => {
    const opens = [100, 100, 102, 101, 104, 103, 107, 106, 110]
    const result = runBacktest(
      makeBars(opens),
      { long: f64(opens.map((_, i) => (i === 0 ? 0 : 1))) },
      makeSpec(),
    )
    expect(Number.isFinite(result.stats.sharpeRatio)).toBe(true)
    expect(result.stats.sharpeRatio).not.toBe(0)
  })

  it('is 0 for a flat curve', () => {
    const bars = makeBars([100, 100, 100, 100, 100])
    const result = runBacktest(bars, { long: f64([0, 1, 1, 1, 1]) }, makeSpec())
    expect(result.stats.sharpeRatio).toBe(0)
  })

  it('is 0 when there is a single bar', () => {
    const result = runBacktest(makeBars([100]), { long: f64([1]) }, makeSpec())
    expect(result.stats.sharpeRatio).toBe(0)
  })
})
