// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The manage pane's arithmetic, checked against the module that computes a
 * position's composition in the first place.
 *
 * The deposit ratio is the load-bearing one: it is derived from PRICES while
 * the connector's `lp-math` derives amounts from LIQUIDITY and tick square
 * roots, so the two agreeing is a real cross-check rather than a restatement.
 * A wrong ratio does not look wrong on screen either — it looks like a
 * perfectly plausible second amount that the position manager then refunds,
 * which is how somebody ends up depositing a third of what they meant to.
 */
import { describe, expect, test } from 'bun:test'

import {
  Q96,
  positionAmounts,
  sqrtPriceX96ToPrice,
  sqrtRatioAtTick,
  tickToPrice,
} from '@pairlens/plugins/evm-dex-connector/lp-math'

import {
  LP_DEFAULT_SLIPPAGE_BPS,
  amountToWireString,
  clampRemovePercent,
  counterpartAmount,
  depositShape,
  hasClaimableFees,
  minAfterSlippage,
  parseAmountInput,
  removalPreview,
} from '../lp-manage-math'

/** A USDC/WETH-shaped position: 6-decimal token0, 18-decimal token1. */
const DEC0 = 6
const DEC1 = 18

function sqrtPriceX96At(tick: number): bigint {
  return BigInt(Math.round(sqrtRatioAtTick(tick) * Q96))
}

/**
 * The price fields a position row carries, for a band and a current tick.
 * Built exactly the way the connector builds them, so the test is fed the same
 * numbers the pane is.
 */
function priceView(tickLower: number, tickUpper: number, currentTick: number) {
  return {
    priceLower: tickToPrice(tickLower, DEC0, DEC1),
    priceUpper: tickToPrice(tickUpper, DEC0, DEC1),
    priceCurrent: sqrtPriceX96ToPrice(sqrtPriceX96At(currentTick), DEC0, DEC1),
  }
}

describe('depositShape — the ratio round-trips against lp-math', () => {
  const cases = [
    { lower: 195_000, upper: 200_000, current: 197_500, label: 'centred' },
    { lower: 195_000, upper: 200_000, current: 195_100, label: 'near lower' },
    { lower: 195_000, upper: 200_000, current: 199_900, label: 'near upper' },
    { lower: -100_000, upper: 100_000, current: 0, label: 'wide, tick 0' },
    { lower: 60_000, upper: 62_000, current: 61_000, label: 'narrow' },
  ]

  for (const { lower, upper, current, label } of cases) {
    test(`${label}: ratio equals amount1 / amount0`, () => {
      const amounts = positionAmounts({
        liquidity: 4_200_000_000_000_000_000n,
        sqrtPriceX96: sqrtPriceX96At(current),
        currentTick: current,
        tickLower: lower,
        tickUpper: upper,
        decimals0: DEC0,
        decimals1: DEC1,
      })
      const shape = depositShape(priceView(lower, upper, current))
      expect(shape.kind).toBe('both')
      if (shape.kind !== 'both') return
      const observed = amounts.amount1 / amounts.amount0
      expect(Math.abs(shape.ratio / observed - 1)).toBeLessThan(1e-6)
    })

    test(`${label}: a counterpart reproduces the other leg`, () => {
      const amounts = positionAmounts({
        liquidity: 1_000_000_000_000_000_000n,
        sqrtPriceX96: sqrtPriceX96At(current),
        currentTick: current,
        tickLower: lower,
        tickUpper: upper,
        decimals0: DEC0,
        decimals1: DEC1,
      })
      const shape = depositShape(priceView(lower, upper, current))
      // Typing token0's share must derive token1's, and the reverse.
      const derived1 = counterpartAmount(shape, 'token0', amounts.amount0)!
      const derived0 = counterpartAmount(shape, 'token1', amounts.amount1)!
      expect(Math.abs(derived1 / amounts.amount1 - 1)).toBeLessThan(1e-6)
      expect(Math.abs(derived0 / amounts.amount0 - 1)).toBeLessThan(1e-6)
    })
  }

  test('a round trip through both directions returns the input', () => {
    const shape = depositShape(priceView(195_000, 200_000, 197_500))
    const back = counterpartAmount(
      shape,
      'token1',
      counterpartAmount(shape, 'token0', 1_500),
    )!
    expect(Math.abs(back / 1_500 - 1)).toBeLessThan(1e-9)
  })
})

describe('depositShape — one-sided and unreadable positions', () => {
  test('below the band the position takes token0 only', () => {
    expect(depositShape(priceView(195_000, 200_000, 194_000)).kind).toBe(
      'token0',
    )
  })

  test('above the band it takes token1 only', () => {
    expect(depositShape(priceView(195_000, 200_000, 201_000)).kind).toBe(
      'token1',
    )
  })

  test('exactly at a bound is the one-sided side, matching the pool', () => {
    const at = priceView(195_000, 200_000, 195_000)
    // `tickToPrice` and `sqrtPriceX96ToPrice` agree to ~1e-12 at the same tick,
    // so pin the comparison rather than relying on which rounds higher.
    expect(depositShape({ ...at, priceCurrent: at.priceLower }).kind).toBe(
      'token0',
    )
    expect(depositShape({ ...at, priceCurrent: at.priceUpper }).kind).toBe(
      'token1',
    )
  })

  test('an unread pool is undeterminable, not two-sided', () => {
    const view = priceView(195_000, 200_000, 197_500)
    expect(depositShape({ ...view, priceCurrent: null }).kind).toBe('unknown')
    expect(depositShape({ ...view, priceLower: null }).kind).toBe('unknown')
    expect(depositShape({ ...view, priceUpper: 0 }).kind).toBe('unknown')
  })

  test('a one-sided or unread shape derives no counterpart', () => {
    expect(counterpartAmount({ kind: 'token0' }, 'token0', 5)).toBeNull()
    expect(counterpartAmount({ kind: 'unknown' }, 'token1', 5)).toBeNull()
    expect(
      counterpartAmount({ kind: 'both', ratio: 2 }, 'token0', null),
    ).toBeNull()
    expect(
      counterpartAmount({ kind: 'both', ratio: 2 }, 'token0', -1),
    ).toBeNull()
    expect(counterpartAmount({ kind: 'both', ratio: 2 }, 'token0', 3)).toBe(6)
  })
})

describe('removalPreview', () => {
  const entry = { amount0: 400, amount1: 0.25, fees0: 12, fees1: 0.004 }

  test('scales the position by the percentage', () => {
    expect(removalPreview(entry, 25).amount0).toBeCloseTo(100, 10)
    expect(removalPreview(entry, 25).amount1).toBeCloseTo(0.0625, 10)
    expect(removalPreview(entry, 100).amount0).toBe(400)
  })

  test('never scales the fees: the collect leg sweeps all of them', () => {
    for (const pct of [25, 50, 75, 100]) {
      expect(removalPreview(entry, pct).fees0).toBe(12)
      expect(removalPreview(entry, pct).fees1).toBe(0.004)
    }
  })

  test('an unread pool previews nothing rather than zero', () => {
    const unread = { ...entry, amount0: null, amount1: null }
    expect(removalPreview(unread, 50).amount0).toBeNull()
    expect(removalPreview(unread, 50).amount1).toBeNull()
  })
})

describe('clampRemovePercent', () => {
  test('keeps a whole percentage inside 1..100', () => {
    expect(clampRemovePercent(0)).toBe(1)
    expect(clampRemovePercent(101)).toBe(100)
    expect(clampRemovePercent(33.4)).toBe(33)
    expect(clampRemovePercent(Number.NaN)).toBe(1)
  })
})

describe('minAfterSlippage', () => {
  test('applies the tolerance the confirm card names', () => {
    expect(minAfterSlippage(100, LP_DEFAULT_SLIPPAGE_BPS)).toBeCloseTo(99.5, 10)
    expect(minAfterSlippage(100, 0)).toBe(100)
    expect(minAfterSlippage(null, 50)).toBeNull()
  })
})

describe('parseAmountInput / amountToWireString', () => {
  test('a half-typed amount is nothing, not zero', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('  ')).toBeNull()
    expect(parseAmountInput('0')).toBeNull()
    expect(parseAmountInput('-3')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('1.25')).toBe(1.25)
  })

  test('the wire string is decimal, never exponential', () => {
    expect(amountToWireString(0.0000001, 18)).toBe('0.0000001')
    expect(amountToWireString(1e-7, 18)).toBe('0.0000001')
    expect(amountToWireString(1234, 6)).toBe('1234')
    expect(amountToWireString(0, 18)).toBe('0')
  })

  test('it truncates at the token decimals rather than rounding up', () => {
    // Rounding would send more than the card said; the scaler truncates too.
    expect(amountToWireString(1.234567891, 6)).toBe('1.234567')
    expect(amountToWireString(1.5, 0)).toBe('1')
    expect(amountToWireString(0.4, 0)).toBe('0')
  })
})

describe('hasClaimableFees', () => {
  test('is true for either leg, false for zero and for unread', () => {
    expect(hasClaimableFees({ fees0: 0, fees1: 0.001 })).toBe(true)
    expect(hasClaimableFees({ fees0: 3, fees1: 0 })).toBe(true)
    expect(hasClaimableFees({ fees0: 0, fees1: 0 })).toBe(false)
    expect(hasClaimableFees({ fees0: null, fees1: null })).toBe(false)
  })
})
