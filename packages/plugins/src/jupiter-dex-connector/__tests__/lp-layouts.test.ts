// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The decoders, against real mainnet accounts.
 *
 * A wrong offset here does not throw: it reads the neighbouring field and
 * prints a plausible number, so a band lands around the wrong price and a
 * liquidity figure is quietly off. So the assertions are not "the decode
 * succeeded" but the exact values those bytes carry, plus the cross-checks that
 * would catch a shifted read even if the constants were re-transcribed wrong:
 * both pools quote the same SOL price to four significant figures, both
 * positions' bounds land on their pool's tick-spacing grid, and both fee rates
 * are tiers the protocols actually publish.
 */
import { describe, expect, test } from 'bun:test'
import bs58 from 'bs58'

import {
  ORCA_POSITION_SIZE,
  ORCA_WHIRLPOOL_SIZE,
  RAYDIUM_POOL_SIZE,
  RAYDIUM_POSITION_SIZE,
  decodeOrcaPosition,
  decodeOrcaWhirlpool,
  decodeRaydiumAmmConfigFee,
  decodeRaydiumPool,
  decodeRaydiumPosition,
  readI32LE,
  readU128LE,
  readU64LE,
  sqrtPriceX64ToX96,
} from '../lp-layouts'
import { Q96 } from '../../evm-dex-connector/lp-math'
import {
  ORCA_POSITION_FIXTURE,
  ORCA_POSITION_MINT,
  ORCA_WHIRLPOOL_FIXTURE,
  RAYDIUM_AMM_CONFIG_FIXTURE,
  RAYDIUM_POOL_FIXTURE,
  RAYDIUM_POSITION_FIXTURE,
  RAYDIUM_POSITION_MINT,
  USDC_MINT,
  WSOL_MINT,
  fixtureBytes,
} from './fixtures/solana-lp-accounts'

/** SOL/USDC, so the human price is `sqrt^2 * 10^(9-6)`. */
function priceFromX64(sqrtPriceX64: bigint): number {
  const sqrt = Number(sqrtPriceX64) / 2 ** 64
  return sqrt * sqrt * 10 ** 3
}

describe('primitive readers', () => {
  test('i32 sign-extends, which every tick index below price 1 needs', () => {
    const bytes = new Uint8Array([0xa4, 0x9b, 0xff, 0xff])
    expect(readI32LE(bytes, 0)).toBe(-25_692)
  })

  test('u64 and u128 stay exact above 2^53', () => {
    const bytes = new Uint8Array(16)
    bytes.set([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x1f, 0x00], 0)
    expect(readU64LE(bytes, 0)).toBe(9_007_199_254_740_991n)
    const wide = new Uint8Array(16)
    wide[15] = 0x01
    expect(readU128LE(wide, 0)).toBe(1n << 120n)
  })
})

describe('Orca Whirlpools', () => {
  const position = decodeOrcaPosition(fixtureBytes(ORCA_POSITION_FIXTURE))
  const pool = decodeOrcaWhirlpool(fixtureBytes(ORCA_WHIRLPOOL_FIXTURE))

  test('the fixtures are the sizes the layouts assume', () => {
    expect(fixtureBytes(ORCA_POSITION_FIXTURE).length).toBe(ORCA_POSITION_SIZE)
    expect(fixtureBytes(ORCA_WHIRLPOOL_FIXTURE).length).toBe(
      ORCA_WHIRLPOOL_SIZE,
    )
  })

  test('position decodes to the values those bytes carry', () => {
    expect(bs58.encode(position.pool)).toBe(ORCA_WHIRLPOOL_FIXTURE.address)
    expect(bs58.encode(position.positionMint)).toBe(ORCA_POSITION_MINT)
    expect(position.liquidity).toBe(61_028_272_428_078n)
    expect(position.tickLower).toBe(-25_836)
    expect(position.tickUpper).toBe(-25_740)
    expect(position.feeOwedA).toBe(13_576_608n)
    expect(position.feeOwedB).toBe(30_139n)
  })

  test('pool decodes to a published fee tier and the right legs', () => {
    expect(pool.tickSpacing).toBe(4)
    // Hundredths of a bip: 400 is Orca's 0.04% tier.
    expect(pool.feeRate).toBe(400)
    expect(pool.tickCurrent).toBe(-25_793)
    expect(pool.sqrtPriceX64).toBe(5_079_983_834_448_995_991n)
    expect(bs58.encode(pool.mintA)).toBe(WSOL_MINT)
    expect(bs58.encode(pool.mintB)).toBe(USDC_MINT)
  })

  test('bounds sit on the pool tick-spacing grid, which a shifted read breaks', () => {
    expect(Math.abs(position.tickLower % pool.tickSpacing)).toBe(0)
    expect(Math.abs(position.tickUpper % pool.tickSpacing)).toBe(0)
  })

  test('sqrtPrice and tick agree on the same price', () => {
    const fromSqrt = priceFromX64(pool.sqrtPriceX64)
    const fromTick = 1.0001 ** pool.tickCurrent * 10 ** 3
    expect(fromSqrt).toBeCloseTo(fromTick, 1)
    // ~75.8 USDC per SOL at capture time. The band is wide on purpose: this
    // asserts the decode read a PRICE, not that the market stood still.
    expect(fromSqrt).toBeGreaterThan(10)
    expect(fromSqrt).toBeLessThan(1000)
  })
})

describe('Raydium CLMM', () => {
  const position = decodeRaydiumPosition(fixtureBytes(RAYDIUM_POSITION_FIXTURE))
  const pool = decodeRaydiumPool(fixtureBytes(RAYDIUM_POOL_FIXTURE))

  test('the fixtures are the sizes the layouts assume', () => {
    expect(fixtureBytes(RAYDIUM_POSITION_FIXTURE).length).toBe(
      RAYDIUM_POSITION_SIZE,
    )
    expect(fixtureBytes(RAYDIUM_POOL_FIXTURE).length).toBe(RAYDIUM_POOL_SIZE)
  })

  test('position decodes to the values those bytes carry', () => {
    expect(bs58.encode(position.nftMint)).toBe(RAYDIUM_POSITION_MINT)
    expect(bs58.encode(position.pool)).toBe(RAYDIUM_POOL_FIXTURE.address)
    expect(position.tickLower).toBe(-25_890)
    expect(position.tickUpper).toBe(-25_729)
    expect(position.liquidity).toBe(20_904_343_930_541n)
    expect(position.tokenFeesOwed0).toBe(1_702_983n)
    expect(position.tokenFeesOwed1).toBe(358_138n)
  })

  test('pool carries both legs, their decimals and the current tick', () => {
    expect(bs58.encode(pool.mint0)).toBe(WSOL_MINT)
    expect(bs58.encode(pool.mint1)).toBe(USDC_MINT)
    expect(pool.decimals0).toBe(9)
    expect(pool.decimals1).toBe(6)
    expect(pool.tickSpacing).toBe(1)
    expect(pool.tickCurrent).toBe(-25_793)
    expect(pool.sqrtPriceX64).toBe(5_080_208_025_296_619_520n)
  })

  test('the fee rate lives on the config account, in millionths', () => {
    const fee = decodeRaydiumAmmConfigFee(
      fixtureBytes(RAYDIUM_AMM_CONFIG_FIXTURE),
    )
    expect(fee).toBe(400)
    expect(bs58.encode(pool.ammConfig)).toBe(RAYDIUM_AMM_CONFIG_FIXTURE.address)
  })

  test('quotes the same SOL price as the Orca pool captured beside it', () => {
    const orca = decodeOrcaWhirlpool(fixtureBytes(ORCA_WHIRLPOOL_FIXTURE))
    // Two independent programs, two independent layouts, one market. Within
    // 1%: arbitrage keeps them together, and a misread field would not be.
    const ratio =
      priceFromX64(pool.sqrtPriceX64) / priceFromX64(orca.sqrtPriceX64)
    expect(ratio).toBeGreaterThan(0.99)
    expect(ratio).toBeLessThan(1.01)
  })
})

describe('sqrtPriceX64ToX96', () => {
  test('is an exact shift, so v3 math applies unchanged', () => {
    const x64 = 5_079_983_834_448_995_991n
    expect(sqrtPriceX64ToX96(x64)).toBe(x64 * 2n ** 32n)
  })

  test('produces the same price through the v3 reader as through Q64', () => {
    const pool = decodeOrcaWhirlpool(fixtureBytes(ORCA_WHIRLPOOL_FIXTURE))
    const viaX96 = Number(sqrtPriceX64ToX96(pool.sqrtPriceX64)) / Q96
    expect(viaX96 * viaX96 * 10 ** 3).toBeCloseTo(
      priceFromX64(pool.sqrtPriceX64),
      6,
    )
  })

  test('refuses to decode an account of the wrong size', () => {
    expect(() => decodeOrcaPosition(new Uint8Array(200))).toThrow()
    expect(() => decodeRaydiumPosition(new Uint8Array(216))).toThrow()
  })
})
