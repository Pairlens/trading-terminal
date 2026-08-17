// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Orientation is the thing worth testing here.
 *
 * Half of all v3 pools quote the leg nobody thinks in, because token order is
 * decided by contract address: the canonical Ethereum WETH/USDC pool reports
 * 0.00033 WETH per USDC. Flipping that wrong does not look like a bug, it looks
 * like a range drawn around a completely different price, so every case gets a
 * vector: matched by address, matched by ticker, and unmatched.
 */
import { describe, expect, test } from 'bun:test'

import type { LpPositionEntry } from '@/lib/dex/lp-types'
import {
  bandHalfWidth,
  baseIsToken0,
  headroomToUpper,
  orientPosition,
  positionValueUsd,
  rangePosition,
  totalClaimableBySymbol,
} from '@/lib/dex/lp-display'
import { sortLpPositions } from '@/hooks/use-lp-positions'

const USDC = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
}
const WETH = {
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  symbol: 'WETH',
  decimals: 18,
}

/**
 * A WETH/USDC position as the POOL sees it: USDC sorts first, so prices are
 * WETH per USDC and the amounts are labelled the same way round.
 */
function entry(overrides: Partial<LpPositionEntry> = {}): LpPositionEntry {
  return {
    market: 'ethereum',
    managerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    tokenId: '1',
    dexName: 'Uniswap v3',
    poolAddress: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
    fee: 500,
    feeTier: 0.0005,
    token0: USDC,
    token1: WETH,
    liquidity: '1000',
    tickLower: 195_000,
    tickUpper: 200_000,
    currentTick: 197_000,
    sqrtPriceX96: '1',
    inRange: true,
    amount0: 6940,
    amount1: 2.3,
    fees0: 12.4,
    fees1: 0.0021,
    // The band read the pool's way round: more WETH per USDC means CHEAPER
    // ether, so the pool's lower bound is the expensive end (1/3600) and its
    // upper bound the cheap one (1/2500).
    priceLower: 1 / 3600,
    priceUpper: 1 / 2500,
    priceCurrent: 1 / 3000,
    matchesPair: null,
    ...overrides,
  }
}

describe('baseIsToken0', () => {
  test('null with no pair to match against', () => {
    expect(baseIsToken0(entry(), null)).toBeNull()
  })

  test('matches the base leg by address', () => {
    expect(
      baseIsToken0(entry(), {
        base: WETH.address.toLowerCase(),
        quote: 'USDC',
      }),
    ).toBe(false)
    expect(baseIsToken0(entry(), { base: USDC.address, quote: 'WETH' })).toBe(
      true,
    )
  })

  test('falls back to the quote leg ticker', () => {
    expect(baseIsToken0(entry(), { base: 'WETH', quote: 'USDC' })).toBe(false)
    expect(baseIsToken0(entry(), { base: 'USDC', quote: 'WETH' })).toBe(true)
  })

  test('null when neither leg names either token', () => {
    expect(baseIsToken0(entry(), { base: 'WBTC', quote: 'DAI' })).toBeNull()
  })
})

describe('orientPosition', () => {
  test('a pool-ordered read is passed through unchanged', () => {
    const view = orientPosition(entry(), null)
    expect(view.inverted).toBe(false)
    expect(view.baseSymbol).toBe('USDC')
    expect(view.quoteSymbol).toBe('WETH')
    expect(view.baseAmount).toBe(6940)
    expect(view.priceCurrent).toBeCloseTo(1 / 3000, 12)
  })

  test('a WETH/USDC pair flips the legs, the amounts and the fees', () => {
    const view = orientPosition(entry(), { base: 'WETH', quote: 'USDC' })
    expect(view.inverted).toBe(true)
    expect(view.baseSymbol).toBe('WETH')
    expect(view.quoteSymbol).toBe('USDC')
    expect(view.baseAmount).toBe(2.3)
    expect(view.quoteAmount).toBe(6940)
    expect(view.baseFees).toBe(0.0021)
    expect(view.quoteFees).toBe(12.4)
    expect(view.priceCurrent).toBeCloseTo(3000, 8)
  })

  test('inverting a band swaps the bounds, not just their values', () => {
    // 1/2500 is the pool-side UPPER bound (more WETH per USDC), so 2500 has to
    // come out as the LOWER one in dollars. Without the swap the band renders
    // inside out and every position reads as out of range.
    const view = orientPosition(entry(), { base: 'WETH', quote: 'USDC' })
    expect(view.priceLower).toBeCloseTo(2500, 8)
    expect(view.priceUpper).toBeCloseTo(3600, 8)
    expect(view.priceLower).toBeLessThan(view.priceCurrent as number)
    expect(view.priceCurrent).toBeLessThan(view.priceUpper as number)
  })

  test('nulls survive the flip', () => {
    const view = orientPosition(
      entry({ amount0: null, fees1: null, priceCurrent: null }),
      { base: 'WETH', quote: 'USDC' },
    )
    expect(view.quoteAmount).toBeNull()
    expect(view.baseFees).toBeNull()
    expect(view.priceCurrent).toBeNull()
  })
})

describe('rangePosition', () => {
  test('the geometric centre sits at the middle of the bar', () => {
    // 60 is the geometric centre of [30, 120], not 75. A linear marker would
    // put it at half the width of the wrong band.
    expect(rangePosition(60, 30, 120)).toBeCloseTo(0.5, 12)
  })

  test('clamps a price outside the band to an end', () => {
    expect(rangePosition(10, 30, 120)).toBe(0)
    expect(rangePosition(500, 30, 120)).toBe(1)
  })

  test('null rather than a marker when the band is degenerate', () => {
    expect(rangePosition(60, 60, 60)).toBeNull()
    expect(rangePosition(60, 0, 120)).toBeNull()
    expect(rangePosition(null, 30, 120)).toBeNull()
  })
})

describe('bandHalfWidth', () => {
  test('is symmetric against the geometric centre', () => {
    // The ± notation is honest because the band is symmetric MULTIPLICATIVELY
    // around its geometric centre: upper/centre and centre/lower are the same
    // factor, which is not true of the arithmetic mean.
    const half = bandHalfWidth(90, 110)!
    const centre = Math.sqrt(90 * 110)
    expect(half).toBeCloseTo(110 / centre - 1, 12)
    expect(110 / centre).toBeCloseTo(centre / 90, 12)
  })

  test('a tighter band reports a smaller half width', () => {
    expect(bandHalfWidth(95, 105)).toBeLessThan(
      bandHalfWidth(80, 120) as number,
    )
  })

  test('null on a band that is not one', () => {
    expect(bandHalfWidth(100, 100)).toBeNull()
    expect(bandHalfWidth(0, 100)).toBeNull()
    expect(bandHalfWidth(null, 100)).toBeNull()
  })
})

describe('headroomToUpper', () => {
  test('positive while the price is under the bound', () => {
    expect(headroomToUpper(80, 100)).toBeCloseTo(0.25, 12)
  })

  test('negative once the price is past it', () => {
    expect(headroomToUpper(120, 100)).toBeLessThan(0)
  })

  test('null with nothing to measure', () => {
    expect(headroomToUpper(null, 100)).toBeNull()
    expect(headroomToUpper(0, 100)).toBeNull()
  })
})

describe('positionValueUsd', () => {
  test('prices both legs', () => {
    expect(positionValueUsd(2, 1000, 3000, 1)).toBe(7000)
  })

  test('refuses to value a position it can only half price', () => {
    expect(positionValueUsd(2, 1000, 3000, null)).toBeNull()
    expect(positionValueUsd(2, 1000, null, 1)).toBeNull()
    expect(positionValueUsd(null, 1000, 3000, 1)).toBeNull()
  })
})

describe('totalClaimableBySymbol', () => {
  test('sums per token across positions, largest first', () => {
    const totals = totalClaimableBySymbol([
      entry({ fees0: 12.4, fees1: 0.002 }),
      entry({ tokenId: '2', fees0: 7.6, fees1: 0.001 }),
    ])
    expect(totals).toEqual([
      { symbol: 'USDC', amount: 20 },
      { symbol: 'WETH', amount: 0.003 },
    ])
  })

  test('skips unread and zero legs rather than listing a zero claim', () => {
    const totals = totalClaimableBySymbol([
      entry({ fees0: null, fees1: 0 }),
      entry({ tokenId: '2', fees0: 3, fees1: null }),
    ])
    expect(totals).toEqual([{ symbol: 'USDC', amount: 3 }])
  })
})

describe('sortLpPositions', () => {
  test('this pool first, then this chain, then a stable identity order', () => {
    const rows = [
      { market: 'base', tokenId: '9', matchesPair: false },
      { market: 'ethereum', tokenId: '4', matchesPair: false },
      { market: 'base', tokenId: '2', matchesPair: true },
      { market: 'arbitrum', tokenId: '1', matchesPair: null },
    ]
    expect(sortLpPositions(rows, 'ethereum').map((r) => r.tokenId)).toEqual([
      '2',
      '4',
      '1',
      '9',
    ])
  })

  test('does not mutate the input', () => {
    const rows = [
      { market: 'base', tokenId: '9', matchesPair: false },
      { market: 'base', tokenId: '2', matchesPair: true },
    ]
    sortLpPositions(rows, 'base')
    expect(rows[0].tokenId).toBe('9')
  })
})
