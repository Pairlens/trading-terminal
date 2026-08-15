// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The perp ticket's arithmetic, which two shells render and neither owns.
 *
 * The properties worth pinning are the ones a second implementation would have
 * got subtly wrong: a contract count is not a base amount, an unpriced order
 * has no notional (not a zero one), and a liquidation estimate has to move the
 * right direction for each side.
 */
import { describe, expect, test } from 'bun:test'

import {
  clampLeverage,
  contractsToBase,
  estimateLiquidationPrice,
  leveragePresets,
  perpNotional,
} from '../ticket-math'

describe('contractsToBase', () => {
  test('a contract count is not a base amount', () => {
    // KuCoin XBTUSDTM: 0.001 BTC per contract. Ten contracts is 0.01 BTC, not
    // ten BTC — the difference between a $600 order and a $600,000 one.
    expect(contractsToBase(10, 0.001)).toBeCloseTo(0.01, 12)
  })

  test('the venues that quote in the base asset are the identity case', () => {
    expect(contractsToBase(2.5, 1)).toBe(2.5)
  })

  test('nonsense in, zero out — never NaN into a formatter', () => {
    expect(contractsToBase(Number.NaN, 1)).toBe(0)
    expect(contractsToBase(5, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('perpNotional', () => {
  test('contracts × contract size × price', () => {
    expect(
      perpNotional({ contracts: 10, contractSize: 0.001, price: 60000 }),
    ).toBeCloseTo(600, 9)
    expect(perpNotional({ contracts: 2, contractSize: 1, price: 3000 })).toBe(
      6000,
    )
  })

  test('an unpriced order has no notional, rather than a zero one', () => {
    // Zero would render as a free order on a ticket that is about to commit
    // margin; a dash says "not priced yet", which is the truth.
    expect(
      perpNotional({ contracts: 10, contractSize: 1, price: null }),
    ).toBeNull()
    expect(
      perpNotional({ contracts: 10, contractSize: 1, price: 0 }),
    ).toBeNull()
    expect(
      perpNotional({ contracts: 0, contractSize: 1, price: 60000 }),
    ).toBeNull()
  })
})

describe('estimateLiquidationPrice', () => {
  test('a long liquidates below entry, a short above', () => {
    const long = estimateLiquidationPrice({
      entryPrice: 60000,
      leverage: 10,
      side: 'buy',
    })
    const short = estimateLiquidationPrice({
      entryPrice: 60000,
      leverage: 10,
      side: 'sell',
    })
    expect(long).not.toBeNull()
    expect(short).not.toBeNull()
    expect(long!).toBeLessThan(60000)
    expect(short!).toBeGreaterThan(60000)
    // 60000 × (1 − 0.1 + 0.005) = 54300, and its mirror.
    expect(long!).toBeCloseTo(54300, 6)
    expect(short!).toBeCloseTo(65700, 6)
  })

  test('more leverage moves the liquidation closer to entry', () => {
    const at5 = estimateLiquidationPrice({
      entryPrice: 100,
      leverage: 5,
      side: 'buy',
    })!
    const at25 = estimateLiquidationPrice({
      entryPrice: 100,
      leverage: 25,
      side: 'buy',
    })!
    expect(at25).toBeGreaterThan(at5)
    expect(at25).toBeLessThan(100)
  })

  test('1x has no liquidation level on either side — with the SHIPPED rate', () => {
    // The bug this pins: at the default 0.5% maintenance rate a 1x long came
    // out at entry × 0.005, which for BTC at $60k is $300 — a plausible-looking
    // price the ticket rendered in red. No override, because no caller passes
    // one; the earlier test only stayed green by zeroing the rate.
    for (const side of ['buy', 'sell'] as const) {
      expect(
        estimateLiquidationPrice({ entryPrice: 60000, leverage: 1, side }),
      ).toBeNull()
    }
    expect(
      estimateLiquidationPrice({ entryPrice: 100, leverage: 1.5, side: 'buy' }),
    ).not.toBeNull()
  })

  test('no entry price, no estimate', () => {
    expect(
      estimateLiquidationPrice({ entryPrice: null, leverage: 10, side: 'buy' }),
    ).toBeNull()
    expect(
      estimateLiquidationPrice({ entryPrice: 100, leverage: 0, side: 'buy' }),
    ).toBeNull()
  })
})

describe('leveragePresets', () => {
  test('starts at 1 and always ends at the venue cap', () => {
    expect(leveragePresets(125)).toEqual([1, 2, 5, 10, 25, 50, 100, 125])
    expect(leveragePresets(20)).toEqual([1, 2, 5, 10, 20])
  })

  test('a cap that is not a round number still terminates the row', () => {
    // Kraken publishes 50x on some contracts and 5x on others; a row that
    // stopped at 25 under a 50x cap would understate the venue.
    expect(leveragePresets(50)).toEqual([1, 2, 5, 10, 25, 50])
    expect(leveragePresets(3)).toEqual([1, 2, 3])
  })

  test('a nonsense cap still yields a usable row', () => {
    expect(leveragePresets(0)).toEqual([1])
    expect(leveragePresets(1)).toEqual([1])
  })
})

describe('clampLeverage', () => {
  test('a venue switch pulls a too-high choice down rather than rejecting it', () => {
    expect(clampLeverage(100, 20)).toBe(20)
    expect(clampLeverage(10, 125)).toBe(10)
  })

  test('never below 1, never fractional, never NaN', () => {
    expect(clampLeverage(0, 20)).toBe(1)
    expect(clampLeverage(-5, 20)).toBe(1)
    expect(clampLeverage(7.9, 20)).toBe(7)
    expect(clampLeverage(Number.NaN, 20)).toBe(1)
  })
})
