// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Vectors for the concentrated-liquidity math.
 *
 * Three kinds of check, in order of how much they prove:
 *
 *  1. Anchors against the protocol's own published constants — `MIN_SQRT_RATIO`,
 *     `MAX_SQRT_RATIO` and the sqrt ratios at ticks ±1, all lifted from
 *     Uniswap's `TickMath`. These are what validate that the float formula
 *     reproduces the fixed-point one, and they are asserted with a relative
 *     tolerance because that is exactly the trade `lp-math` documents.
 *  2. Identities the protocol guarantees: a full-range position holds L/√P of
 *     token0 and L·√P of token1 (the v2 relation), and a band centred on the
 *     current price holds equal value on both sides.
 *  3. Boundary behaviour, which is where a display bug turns into a wrong
 *     position: at or past a bound one side must be exactly zero, and no input
 *     may produce a negative amount.
 */
import { describe, expect, test } from 'bun:test'

import {
  MAX_TICK,
  MIN_TICK,
  Q96,
  feeTierFraction,
  isInRange,
  positionAmounts,
  rawAmountsForLiquidity,
  sqrtPriceX96ToPrice,
  sqrtRatioAtTick,
  tickToPrice,
} from '../lp-math'

/** Relative difference, for tolerance assertions on float math. */
function relative(actual: number, expected: number): number {
  if (expected === 0) return Math.abs(actual)
  return Math.abs((actual - expected) / expected)
}

/** `sqrtPriceX96` at a tick, the way the pool would report it. */
function sqrtPriceX96At(tick: number): bigint {
  return BigInt(Math.round(sqrtRatioAtTick(tick) * Q96))
}

describe('sqrtRatioAtTick', () => {
  test('tick 0 is exactly 1', () => {
    expect(sqrtRatioAtTick(0)).toBe(1)
  })

  // TickMath's own values, written as bigints so the exact integer is in the
  // source and the conversion to a double is the assertion's, not the parser's.
  const MIN_SQRT_RATIO = Number(4295128739n)
  const MAX_SQRT_RATIO =
    Number(1461446703485210103287273052203988822378723970342n)
  const SQRT_RATIO_AT_1 = Number(79232123823359799118286999568n)
  const SQRT_RATIO_AT_MINUS_1 = Number(79224201403219477170569942574n)

  test('matches TickMath at the protocol bounds', () => {
    expect(
      relative(sqrtRatioAtTick(MIN_TICK) * Q96, MIN_SQRT_RATIO),
    ).toBeLessThan(1e-9)
    expect(
      relative(sqrtRatioAtTick(MAX_TICK) * Q96, MAX_SQRT_RATIO),
    ).toBeLessThan(1e-9)
  })

  test('matches TickMath one tick either side of zero', () => {
    expect(relative(sqrtRatioAtTick(1) * Q96, SQRT_RATIO_AT_1)).toBeLessThan(
      1e-12,
    )
    expect(
      relative(sqrtRatioAtTick(-1) * Q96, SQRT_RATIO_AT_MINUS_1),
    ).toBeLessThan(1e-12)
  })

  test('is monotonic across the tick space', () => {
    let previous = sqrtRatioAtTick(-500_000)
    for (const tick of [-100_000, -1000, -1, 0, 1, 1000, 100_000, 500_000]) {
      const value = sqrtRatioAtTick(tick)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })
})

describe('tickToPrice', () => {
  test('tick 0 with equal decimals is parity', () => {
    expect(tickToPrice(0, 18, 18)).toBe(1)
  })

  test('decimal correction turns a raw ratio into a readable price', () => {
    // The canonical Ethereum USDC/WETH pool: USDC is token0 (6 decimals), WETH
    // is token1 (18). Around tick 196250 the pool prices ETH near $3,000, which
    // is 1/3000 WETH per USDC once the 10^(6-18) correction is applied.
    const wethPerUsdc = tickToPrice(196250, 6, 18)
    expect(relative(wethPerUsdc, 3.3316e-4)).toBeLessThan(1e-3)
    expect(relative(1 / wethPerUsdc, 3001.5)).toBeLessThan(1e-3)
  })

  test('a tick above zero is a higher price', () => {
    expect(tickToPrice(1000, 18, 18)).toBeGreaterThan(tickToPrice(0, 18, 18))
  })
})

describe('sqrtPriceX96ToPrice', () => {
  test('2^96 is parity', () => {
    expect(sqrtPriceX96ToPrice(BigInt(Q96), 18, 18)).toBeCloseTo(1, 12)
  })

  test('agrees with the tick it was derived from', () => {
    const tick = 197_000
    const fromSqrt = sqrtPriceX96ToPrice(sqrtPriceX96At(tick), 6, 18)
    expect(relative(fromSqrt, tickToPrice(tick, 6, 18))).toBeLessThan(1e-9)
  })
})

describe('isInRange', () => {
  test('the upper bound is exclusive, as the pool treats it', () => {
    expect(isInRange(100, 100, 200)).toBe(true)
    expect(isInRange(199, 100, 200)).toBe(true)
    expect(isInRange(200, 100, 200)).toBe(false)
    expect(isInRange(99, 100, 200)).toBe(false)
  })
})

describe('rawAmountsForLiquidity', () => {
  const liquidity = 10n ** 18n

  test('a full-range position holds the v2 amounts, L/sqrtP and L*sqrtP', () => {
    const tick = 100_000
    const sqrtPrice = sqrtRatioAtTick(tick)
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(tick),
      currentTick: tick,
      tickLower: MIN_TICK,
      tickUpper: MAX_TICK,
    })
    expect(relative(amounts.amount0, 1e18 / sqrtPrice)).toBeLessThan(1e-9)
    expect(relative(amounts.amount1, 1e18 * sqrtPrice)).toBeLessThan(1e-9)
  })

  test('a band centred on the price holds equal value on both sides', () => {
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(0),
      currentTick: 0,
      tickLower: -60,
      tickUpper: 60,
    })
    // At parity the two raw amounts are directly comparable.
    expect(relative(amounts.amount0, amounts.amount1)).toBeLessThan(1e-4)
    expect(amounts.amount0).toBeGreaterThan(0)
  })

  test('below the band the position is entirely token0', () => {
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(-1000),
      currentTick: -1000,
      tickLower: -60,
      tickUpper: 60,
    })
    expect(amounts.amount1).toBe(0)
    expect(amounts.amount0).toBeGreaterThan(0)
  })

  test('above the band the position is entirely token1', () => {
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(1000),
      currentTick: 1000,
      tickLower: -60,
      tickUpper: 60,
    })
    expect(amounts.amount0).toBe(0)
    expect(amounts.amount1).toBeGreaterThan(0)
  })

  test('exactly at the upper bound counts as above it', () => {
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(60),
      currentTick: 60,
      tickLower: -60,
      tickUpper: 60,
    })
    expect(amounts.amount0).toBe(0)
  })

  test('at the lower bound token1 is zero and nothing goes negative', () => {
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(-60),
      currentTick: -60,
      tickLower: -60,
      tickUpper: 60,
    })
    expect(amounts.amount1).toBeGreaterThanOrEqual(0)
    expect(amounts.amount1).toBeLessThan(1e6)
    expect(amounts.amount0).toBeGreaterThan(0)
  })

  test('an out-of-band sqrtPrice is clamped rather than signed', () => {
    // Inconsistent input on purpose: the tick says in range, the square root
    // says far below it. Clamping is what keeps a rounding artefact from
    // rendering as a negative token balance.
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(-5000),
      currentTick: 0,
      tickLower: -60,
      tickUpper: 60,
    })
    expect(amounts.amount0).toBeGreaterThanOrEqual(0)
    expect(amounts.amount1).toBeGreaterThanOrEqual(0)
  })

  test('zero liquidity holds nothing', () => {
    const amounts = rawAmountsForLiquidity({
      liquidity: 0n,
      sqrtPriceX96: sqrtPriceX96At(0),
      currentTick: 0,
      tickLower: -60,
      tickUpper: 60,
    })
    expect(amounts).toEqual({ amount0: 0, amount1: 0 })
  })

  test('a degenerate band holds nothing', () => {
    const amounts = rawAmountsForLiquidity({
      liquidity,
      sqrtPriceX96: sqrtPriceX96At(0),
      currentTick: 0,
      tickLower: 60,
      tickUpper: 60,
    })
    expect(amounts).toEqual({ amount0: 0, amount1: 0 })
  })
})

describe('positionAmounts', () => {
  test('descales each leg by its own decimals', () => {
    const tick = 0
    const raw = rawAmountsForLiquidity({
      liquidity: 10n ** 18n,
      sqrtPriceX96: sqrtPriceX96At(tick),
      currentTick: tick,
      tickLower: -600,
      tickUpper: 600,
    })
    const human = positionAmounts({
      liquidity: 10n ** 18n,
      sqrtPriceX96: sqrtPriceX96At(tick),
      currentTick: tick,
      tickLower: -600,
      tickUpper: 600,
      decimals0: 6,
      decimals1: 18,
    })
    expect(relative(human.amount0, raw.amount0 / 1e6)).toBeLessThan(1e-12)
    expect(relative(human.amount1, raw.amount1 / 1e18)).toBeLessThan(1e-12)
  })
})

describe('feeTierFraction', () => {
  test('reads the pool fee as a fraction of notional', () => {
    expect(feeTierFraction(100)).toBe(0.0001)
    expect(feeTierFraction(500)).toBe(0.0005)
    expect(feeTierFraction(3000)).toBe(0.003)
    expect(feeTierFraction(10_000)).toBe(0.01)
  })

  test('refuses a fee that cannot be one', () => {
    expect(feeTierFraction(0)).toBeNull()
    expect(feeTierFraction(Number.NaN)).toBeNull()
  })
})
