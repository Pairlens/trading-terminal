// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The funding and margin arithmetic, pinned at the places a wrong answer would
 * look perfectly reasonable on screen.
 *
 * Each case here is a number a trader would act on: a carry compared across two
 * venues that settle on different clocks, a basis annualised seconds before it
 * settles, a stress row that says a position survives a move it does not.
 */

import { describe, expect, it } from 'bun:test'
import {
  HOURS_PER_YEAR,
  annualizedFunding,
  annualizedSpreadPoints,
  axisPosition,
  basisBps,
  basisFraction,
  fundingCost,
  fundingOverWindow,
  liquidationDistance,
  openInterestValue,
  percentileOf,
  priceAxisRange,
  projectedMarginRatio,
} from '../funding-math'

describe('annualizedFunding', () => {
  it('scales a per-interval rate by the intervals in a year', () => {
    // 0.01% every 8h is the textbook "neutral" perp rate: 1095 stamps a year.
    expect(annualizedFunding(0.0001, 8)!).toBeCloseTo(0.1095, 10)
  })

  it('makes two venues on different clocks comparable', () => {
    // The same printed rate on an hourly venue is eight times the carry. This
    // is the whole reason the interval rides the wire shape.
    const eightHourly = annualizedFunding(0.0001, 8)!
    const hourly = annualizedFunding(0.0001, 1)!
    expect(hourly / eightHourly).toBeCloseTo(8, 10)
    expect(hourly).toBeCloseTo(0.0001 * HOURS_PER_YEAR, 10)
  })

  it('keeps the sign, because a negative rate pays the long', () => {
    expect(annualizedFunding(-0.0002, 8)!).toBeCloseTo(-0.219, 10)
  })

  it('refuses a period it would divide by zero', () => {
    expect(annualizedFunding(0.0001, 0)).toBeNull()
    expect(annualizedFunding(0.0001, -8)).toBeNull()
    expect(annualizedFunding(Number.NaN, 8)).toBeNull()
  })
})

describe('basis', () => {
  it('measures the perp against the index, in bps', () => {
    expect(basisFraction(63_121, 63_052)!).toBeCloseTo(0.0010943, 6)
    expect(basisBps(63_121, 63_052)!).toBeCloseTo(10.94, 2)
  })

  it('goes negative when the perp trades under spot', () => {
    expect(basisBps(75.246, 75.39)!).toBeLessThan(0)
  })

  it('is null when the venue publishes no index', () => {
    // Kraken serves an index; a venue that does not must render "n/a" rather
    // than a basis measured against its own mark, which is always zero.
    expect(basisBps(63_121, undefined)).toBeNull()
    expect(basisBps(63_121, 0)).toBeNull()
  })
})

describe('percentileOf', () => {
  it('ranks a live rate against the contract own settled history', () => {
    const history = [0.0001, 0.0002, 0.0003, 0.0004, 0.0005]
    expect(percentileOf(0.0009, history)).toBe(100)
    expect(percentileOf(0.00005, history)).toBe(0)
    expect(percentileOf(0.00035, history)).toBeCloseTo(60, 10)
  })

  it('counts ties as half, so a flat history reads as the middle', () => {
    // The alternative puts a contract that has funded at exactly one rate for
    // a month in the 100th percentile of its own range, which would light the
    // whole rail up as "never been more crowded".
    expect(percentileOf(0.0002, [0.0002, 0.0002, 0.0002])).toBe(50)
    expect(percentileOf(0.0003, [0.0002, 0.0002, 0.0002])).toBe(100)
    expect(percentileOf(0.0001, [0.0002, 0.0002, 0.0002])).toBe(0)
  })

  it('is null when there is no history to rank against', () => {
    // A percentile of nothing is not zero, and the rail falls back to the
    // per-interval phrasing rather than claiming a range it never read.
    expect(percentileOf(0.0002, [])).toBeNull()
    expect(percentileOf(0.0002, [Number.NaN])).toBeNull()
    expect(percentileOf(Number.NaN, [0.0002])).toBeNull()
  })

  it('ignores unusable stamps inside an otherwise good series', () => {
    expect(percentileOf(0.0003, [0.0001, Number.NaN, 0.0005])).toBe(50)
  })
})

describe('fundingCost', () => {
  it('charges the long and pays the short at a positive rate', () => {
    expect(fundingCost(47_286, 0.000412, 'long')!).toBeCloseTo(19.48, 2)
    expect(fundingCost(47_286, 0.000412, 'short')!).toBeCloseTo(-19.48, 2)
  })

  it('inverts both when the rate is negative', () => {
    expect(fundingCost(10_000, -0.0005, 'long')!).toBeCloseTo(-5, 10)
    expect(fundingCost(10_000, -0.0005, 'short')!).toBeCloseTo(5, 10)
  })
})

describe('fundingOverWindow', () => {
  const now = 1_800_000_000_000
  const hour = 3_600_000
  const points = [
    { ts: now - 30 * hour, rate: 0.01 },
    { ts: now - 20 * hour, rate: 0.0002 },
    { ts: now - 7 * hour, rate: 0.0003 },
    { ts: now - 1 * hour, rate: -0.0001 },
  ]

  it('sums the stamps inside the window and nothing else', () => {
    // Funding is paid per stamp, so the trailing figure is a sum. An average
    // would say a position held through two settlements paid for one.
    expect(fundingOverWindow(points, 8 * hour, now)!).toBeCloseTo(0.0002, 10)
    expect(fundingOverWindow(points, 24 * hour, now)!).toBeCloseTo(0.0004, 10)
  })

  it('is null when nothing settled in the window', () => {
    expect(fundingOverWindow(points, 30 * 60_000, now)).toBeNull()
    expect(fundingOverWindow([], 24 * hour, now)).toBeNull()
  })
})

describe('openInterestValue', () => {
  it('prefers the number the venue priced itself', () => {
    expect(
      openInterestValue({ value: 14_200_000_000, amount: 1, markPrice: 2 }),
    ).toBe(14_200_000_000)
  })

  it('prices a contract count at the mark, contract size included', () => {
    // KuCoin's XBTUSDTM is 0.001 BTC a contract; ignoring that overstates open
    // interest a thousandfold.
    expect(
      openInterestValue({
        amount: 8_053_960,
        markPrice: 63_000,
        contractSize: 0.001,
      }),
    ).toBeCloseTo(507_399_480, 4)
  })

  it('is null with no price to convert at', () => {
    expect(openInterestValue({ amount: 8_053_960 })).toBeNull()
    expect(openInterestValue({ markPrice: 63_000 })).toBeNull()
  })
})

describe('liquidationDistance', () => {
  it('is negative for a long and positive for a short', () => {
    expect(liquidationDistance(63_049, 57_180)!).toBeCloseTo(-0.0931, 4)
    expect(liquidationDistance(75.25, 89.1)!).toBeCloseTo(0.184, 3)
  })

  it('is null without both prices', () => {
    expect(liquidationDistance(63_049, undefined)).toBeNull()
    expect(liquidationDistance(undefined, 57_180)).toBeNull()
  })
})

describe('projectedMarginRatio', () => {
  const base = { equity: 29_708, maintenance: 5_462, notional: 100_000 }

  it('moves both legs: equity falls and maintenance follows the notional', () => {
    // A long losing 3% is a 3% smaller position, so the requirement shrinks
    // with it. Freezing maintenance here reads as more danger than there is.
    const ratio = projectedMarginRatio({ ...base, side: 'long', move: 0.03 })!
    const frozen = base.maintenance / (base.equity - 3_000)
    expect(ratio).toBeCloseTo(
      (base.maintenance * 0.97) / (base.equity - 3_000),
      10,
    )
    expect(ratio).toBeLessThan(frozen)
  })

  it('scales maintenance UP for a short, whose notional grows against it', () => {
    const ratio = projectedMarginRatio({ ...base, side: 'short', move: 0.03 })!
    expect(ratio).toBeCloseTo(
      (base.maintenance * 1.03) / (base.equity - 3_000),
      10,
    )
  })

  it('reports 1 once the move has taken the account through liquidation', () => {
    expect(projectedMarginRatio({ ...base, side: 'long', move: 0.4 })).toBe(1)
  })

  it('never exceeds 1, so the gauge cannot run off its own track', () => {
    const ratio = projectedMarginRatio({
      equity: 1_000,
      maintenance: 900,
      notional: 100_000,
      side: 'long',
      move: 0.009,
    })!
    expect(ratio).toBeLessThanOrEqual(1)
  })

  it('is null for an account with no equity to lose', () => {
    expect(
      projectedMarginRatio({ ...base, equity: 0, side: 'long', move: 0.03 }),
    ).toBeNull()
  })
})

describe('price axis', () => {
  it('always contains the current price', () => {
    // Liquidations far below spot must not push the marker off the map.
    const range = priceAxisRange([57_180, 56_420], 63_049)!
    expect(range.min).toBeLessThan(56_420)
    expect(range.max).toBeGreaterThan(63_049)
    expect(axisPosition(63_049, range)).toBeGreaterThan(0.9)
  })

  it('gives a single marker a window instead of a zero-width axis', () => {
    const range = priceAxisRange([63_049], 63_049)!
    expect(range.max).toBeGreaterThan(range.min)
    expect(axisPosition(63_049, range)).toBeCloseTo(0.5, 2)
  })

  it('clamps anything outside the axis to its ends', () => {
    const range = { min: 100, max: 200 }
    expect(axisPosition(50, range)).toBe(0)
    expect(axisPosition(500, range)).toBe(1)
  })

  it('is null with nothing usable to draw', () => {
    expect(priceAxisRange([], 0)).toBeNull()
  })
})

describe('annualizedSpreadPoints', () => {
  it('is the gap between the dearest and cheapest venue, in points', () => {
    expect(annualizedSpreadPoints([0.109, 0.146, 0.064])!).toBeCloseTo(8.2, 6)
  })

  it('needs two venues to have a spread at all', () => {
    expect(annualizedSpreadPoints([0.109])).toBeNull()
    expect(annualizedSpreadPoints([])).toBeNull()
  })
})
