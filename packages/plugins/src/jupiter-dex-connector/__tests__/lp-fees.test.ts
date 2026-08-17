// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The fee replay, against the protocol rather than against itself.
 *
 * The Orca vector is the one that matters: position, pool and tick array from
 * one mainnet slot, and an expected value that came out of the Orca program's
 * own `update_fees_and_rewards` simulated over those exact bytes. If the
 * offsets, the branch order in `feeGrowthInside` or the Q64.64 scale were
 * wrong, that number would not reproduce.
 */
import { describe, expect, test } from 'bun:test'

import {
  U128_MODULUS,
  feeDeltaSinceCheckpoint,
  feeGrowthInside,
  liveFeesForPosition,
  wrappingSub,
} from '../lp-fees'
import {
  decodeOrcaPosition,
  decodeOrcaTick,
  decodeOrcaTickArrayStart,
  decodeOrcaWhirlpool,
  decodeRaydiumPool,
  decodeRaydiumPosition,
  decodeRaydiumTick,
  i32ToBigEndianBytes,
  orcaTickArrayKind,
  tickArrayStartIndex,
} from '../lp-layouts'
import { boundaryTickArrayStarts, tickArrayStartSeed } from '../lp-client'
import {
  ORCA_DYNAMIC_TICK_ARRAY_FIXTURE,
  ORCA_FEE_REPLAY_FIXTURE,
  RAYDIUM_FEE_REPLAY_FIXTURE,
  fixtureBytes,
  gzipFixtureBytes,
} from './fixtures/solana-lp-accounts'

describe('u128 modular arithmetic', () => {
  test('a plain subtraction is unchanged', () => {
    expect(wrappingSub(10n, 4n)).toBe(6n)
  })

  test('an underflow wraps rather than going negative', () => {
    // Not an error case. `feeGrowthOutside` is seeded with the global at the
    // moment a tick is first crossed, so `global - outside` underflows all the
    // time and the protocol defines the result as the wrapped value.
    expect(wrappingSub(0n, 1n)).toBe(U128_MODULUS - 1n)
    expect(wrappingSub(5n, 9n)).toBe(U128_MODULUS - 4n)
  })

  test('a wrapped difference still yields the right fee delta', () => {
    // Growth of 2^64 per unit of liquidity is exactly one raw token unit.
    const checkpoint = U128_MODULUS - 5n
    const inside = 3n // wrapped past the top
    expect(
      feeDeltaSinceCheckpoint({
        feeGrowthInside: inside,
        checkpoint,
        liquidity: 1n << 64n,
      }),
    ).toBe(8n)
  })

  test('no liquidity means no accrual, whatever the growth says', () => {
    expect(
      feeDeltaSinceCheckpoint({
        feeGrowthInside: 10n << 64n,
        checkpoint: 0n,
        liquidity: 0n,
      }),
    ).toBe(0n)
  })
})

describe('feeGrowthInside branches on where the price is', () => {
  const base = { tickLower: -100, tickUpper: 100, feeGrowthGlobal: 1000n }

  test('in range: both outsides are subtracted as stored', () => {
    expect(
      feeGrowthInside({
        ...base,
        lowerOutside: 100n,
        upperOutside: 250n,
        tickCurrent: 0,
      }),
    ).toBe(650n)
  })

  test('below the range: the lower outside is complemented', () => {
    // global - (global - lower) - upper = lower - upper, mod 2^128.
    expect(
      feeGrowthInside({
        ...base,
        lowerOutside: 400n,
        upperOutside: 250n,
        tickCurrent: -500,
      }),
    ).toBe(150n)
  })

  test('above the range: the upper outside is complemented', () => {
    expect(
      feeGrowthInside({
        ...base,
        lowerOutside: 100n,
        upperOutside: 700n,
        tickCurrent: 500,
      }),
    ).toBe(600n)
  })

  test('the boundaries match how a pool treats them', () => {
    // tickCurrent === tickLower is IN range; tickCurrent === tickUpper is not.
    const atLower = feeGrowthInside({
      ...base,
      lowerOutside: 100n,
      upperOutside: 250n,
      tickCurrent: -100,
    })
    const atUpper = feeGrowthInside({
      ...base,
      lowerOutside: 100n,
      upperOutside: 250n,
      tickCurrent: 100,
    })
    expect(atLower).toBe(650n)
    expect(atUpper).toBe(
      feeGrowthInside({
        ...base,
        lowerOutside: 100n,
        upperOutside: 250n,
        tickCurrent: 999,
      }),
    )
  })
})

describe('tick array grids', () => {
  test('start index floors toward negative infinity', () => {
    // Every SOL/USDC band sits below tick 0, so truncation toward zero would
    // derive the neighbouring array on almost every real position.
    expect(tickArrayStartIndex(-25836, 4, 88)).toBe(-26048)
    expect(tickArrayStartIndex(-25890, 1, 60)).toBe(-25920)
    expect(tickArrayStartIndex(352, 4, 88)).toBe(352)
    expect(tickArrayStartIndex(-1, 4, 88)).toBe(-352)
    expect(tickArrayStartIndex(0, 4, 88)).toBe(0)
  })

  test('the two protocols seed the PDA differently', () => {
    // Orca: the decimal string. Raydium: four big-endian bytes.
    expect(tickArrayStartSeed('orca-whirlpool', -26048)).toEqual(
      new TextEncoder().encode('-26048'),
    )
    expect(tickArrayStartSeed('raydium-clmm', -25920)).toEqual(
      i32ToBigEndianBytes(-25920),
    )
  })

  test('big-endian i32 handles negatives', () => {
    // -25920 is 0xFFFF9AC0 in two's complement.
    expect([...i32ToBigEndianBytes(-25920)]).toEqual([255, 255, 154, 192])
    expect([...i32ToBigEndianBytes(-1)]).toEqual([255, 255, 255, 255])
    expect([...i32ToBigEndianBytes(0)]).toEqual([0, 0, 0, 0])
    expect([...i32ToBigEndianBytes(352)]).toEqual([0, 0, 1, 96])
  })

  test('bounds inside one array resolve to one address', () => {
    const starts = boundaryTickArrayStarts({
      protocol: 'orca-whirlpool',
      tickLower: -25836,
      tickUpper: -25740,
      tickSpacing: 4,
    })
    expect(starts).toEqual({ lower: -26048, upper: -26048 })
  })
})

describe('Orca fee replay against the program itself', () => {
  const position = decodeOrcaPosition(
    fixtureBytes(ORCA_FEE_REPLAY_FIXTURE.position),
  )
  const pool = decodeOrcaWhirlpool(fixtureBytes(ORCA_FEE_REPLAY_FIXTURE.pool))
  const tickArray = gzipFixtureBytes(ORCA_FEE_REPLAY_FIXTURE.tickArray)

  test('the fixture is the fixed tick-array layout', () => {
    expect(orcaTickArrayKind(tickArray)).toBe('fixed')
    expect(tickArray.length).toBe(9988)
    expect(decodeOrcaTickArrayStart(tickArray)).toBe(-26048)
  })

  test('the new pool fields decode', () => {
    expect(pool.tickSpacing).toBe(4)
    expect(pool.feeGrowthGlobalA).toBeGreaterThan(0n)
    expect(pool.feeGrowthGlobalB).toBeGreaterThan(0n)
  })

  test('the position checkpoints decode', () => {
    expect(position.feeGrowthCheckpointA).toBeGreaterThan(0n)
    expect(position.feeGrowthCheckpointB).toBeGreaterThan(0n)
    expect(position.feeOwedA).toBe(ORCA_FEE_REPLAY_FIXTURE.settledFeeA)
    expect(position.feeOwedB).toBe(ORCA_FEE_REPLAY_FIXTURE.settledFeeB)
  })

  test('replayed fees equal what the Orca program computed', () => {
    const lower = decodeOrcaTick(
      tickArray,
      position.tickLower,
      pool.tickSpacing,
    )
    const upper = decodeOrcaTick(
      tickArray,
      position.tickUpper,
      pool.tickSpacing,
    )
    expect(lower?.initialized).toBe(true)
    expect(upper?.initialized).toBe(true)

    const live = liveFeesForPosition({
      liquidity: position.liquidity,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      tickCurrent: pool.tickCurrent,
      feesOwed0: position.feeOwedA,
      feesOwed1: position.feeOwedB,
      checkpoint0: position.feeGrowthCheckpointA,
      checkpoint1: position.feeGrowthCheckpointB,
      feeGrowthGlobal0: pool.feeGrowthGlobalA,
      feeGrowthGlobal1: pool.feeGrowthGlobalB,
      ticks: { lower: lower!, upper: upper! },
    })
    expect(live).not.toBeNull()
    expect(live!.fees0).toBe(ORCA_FEE_REPLAY_FIXTURE.expectedFeeA)
    expect(live!.fees1).toBe(ORCA_FEE_REPLAY_FIXTURE.expectedFeeB)
  })

  test('the live figure is nothing like the settled one', () => {
    // The reason the feature exists: this position had earned eighty times what
    // the last-touch path was printing.
    expect(ORCA_FEE_REPLAY_FIXTURE.expectedFeeA).toBeGreaterThan(
      ORCA_FEE_REPLAY_FIXTURE.settledFeeA * 50n,
    )
  })

  test('reading the growth as Uniswap X128 would report the settled figure', () => {
    // The single most plausible way to get this wrong, and it fails quietly:
    // a 2^128 shift drives every delta to zero and the row still renders.
    const growth = wrappingSub(
      feeGrowthInside({
        feeGrowthGlobal: pool.feeGrowthGlobalA,
        lowerOutside: decodeOrcaTick(tickArray, position.tickLower, 4)!
          .feeGrowthOutside0,
        upperOutside: decodeOrcaTick(tickArray, position.tickUpper, 4)!
          .feeGrowthOutside0,
        tickCurrent: pool.tickCurrent,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
      }),
      position.feeGrowthCheckpointA,
    )
    expect((growth * position.liquidity) >> 128n).toBe(0n)
    expect((growth * position.liquidity) >> 64n).toBeGreaterThan(0n)
  })
})

describe('Orca dynamic tick arrays', () => {
  const data = fixtureBytes(ORCA_DYNAMIC_TICK_ARRAY_FIXTURE)
  const { tickSpacing, startTickIndex, initializedSlots } =
    ORCA_DYNAMIC_TICK_ARRAY_FIXTURE

  test('recognised by discriminator, not by size', () => {
    expect(orcaTickArrayKind(data)).toBe('dynamic')
    expect(data.length).not.toBe(9988)
    expect(data.length).toBe(148 + 112 * initializedSlots.length)
    expect(decodeOrcaTickArrayStart(data)).toBe(startTickIndex)
  })

  test('the variable stride lands on the right ticks', () => {
    for (const slot of initializedSlots) {
      const tick = startTickIndex + slot * tickSpacing
      const decoded = decodeOrcaTick(data, tick, tickSpacing)
      expect(decoded).not.toBeNull()
      expect(decoded!.initialized).toBe(true)
      expect(decoded!.feeGrowthOutside0).toBeGreaterThan(0n)
    }
  })

  test('uninitialized slots report so instead of returning a neighbour', () => {
    const slots = new Set<number>(initializedSlots)
    let checked = 0
    for (let slot = 0; slot < 88 && checked < 12; slot++) {
      if (slots.has(slot)) continue
      const decoded = decodeOrcaTick(
        data,
        startTickIndex + slot * tickSpacing,
        tickSpacing,
      )
      expect(decoded?.initialized).toBe(false)
      expect(decoded?.feeGrowthOutside0).toBe(0n)
      checked++
    }
    expect(checked).toBe(12)
  })

  test('an unknown account discriminator is refused, never guessed at', () => {
    const junk = new Uint8Array(9988)
    expect(orcaTickArrayKind(junk)).toBeNull()
    expect(decodeOrcaTick(junk, 0, 4)).toBeNull()
    expect(decodeOrcaTickArrayStart(junk)).toBeNull()
  })
})

describe('Raydium fee replay', () => {
  const position = decodeRaydiumPosition(
    fixtureBytes(RAYDIUM_FEE_REPLAY_FIXTURE.position),
  )
  const pool = decodeRaydiumPool(fixtureBytes(RAYDIUM_FEE_REPLAY_FIXTURE.pool))
  const lowerArray = gzipFixtureBytes(RAYDIUM_FEE_REPLAY_FIXTURE.tickArrayLower)
  const upperArray = gzipFixtureBytes(RAYDIUM_FEE_REPLAY_FIXTURE.tickArrayUpper)

  test('the new fields decode', () => {
    expect(pool.feeGrowthGlobal0).toBeGreaterThan(0n)
    expect(pool.feeGrowthGlobal1).toBeGreaterThan(0n)
    expect(position.feeGrowthInside0Last).toBeGreaterThan(0n)
    expect(position.feeGrowthInside1Last).toBeGreaterThan(0n)
  })

  test('the bounds land in the arrays the PDA grid predicts', () => {
    const starts = boundaryTickArrayStarts({
      protocol: 'raydium-clmm',
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      tickSpacing: pool.tickSpacing,
    })
    expect(starts.lower).toBe(-25920)
    expect(starts.upper).toBe(-25740)
  })

  test('each tick slot carries its own index, which has to match', () => {
    // Raydium's own structural check against a bad offset, and the reason a
    // wrong stride here is loud: `decodeRaydiumTick` returns null rather than a
    // neighbouring tick's fee growth.
    expect(
      decodeRaydiumTick(lowerArray, position.tickLower, pool.tickSpacing),
    ).not.toBeNull()
    // A tick that belongs to the OTHER array is refused by this one rather than
    // answered from whatever byte range the index arithmetic lands on.
    expect(
      decodeRaydiumTick(lowerArray, position.tickUpper, pool.tickSpacing),
    ).toBeNull()
    // And so is one past the end of the array's own span.
    expect(
      decodeRaydiumTick(lowerArray, -25920 + 60, pool.tickSpacing),
    ).toBeNull()
  })

  test('replay reproduces the pinned figure and beats the settled one', () => {
    const lower = decodeRaydiumTick(
      lowerArray,
      position.tickLower,
      pool.tickSpacing,
    )
    const upper = decodeRaydiumTick(
      upperArray,
      position.tickUpper,
      pool.tickSpacing,
    )
    const live = liveFeesForPosition({
      liquidity: position.liquidity,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      tickCurrent: pool.tickCurrent,
      feesOwed0: position.tokenFeesOwed0,
      feesOwed1: position.tokenFeesOwed1,
      checkpoint0: position.feeGrowthInside0Last,
      checkpoint1: position.feeGrowthInside1Last,
      feeGrowthGlobal0: pool.feeGrowthGlobal0,
      feeGrowthGlobal1: pool.feeGrowthGlobal1,
      ticks: { lower: lower!, upper: upper! },
    })
    expect(live!.fees0).toBe(RAYDIUM_FEE_REPLAY_FIXTURE.expectedFee0)
    expect(live!.fees1).toBe(RAYDIUM_FEE_REPLAY_FIXTURE.expectedFee1)
    expect(live!.fees0).toBeGreaterThan(RAYDIUM_FEE_REPLAY_FIXTURE.settledFee0)
  })
})

describe('when a position cannot be replayed', () => {
  const ticks = {
    lower: { initialized: true, feeGrowthOutside0: 1n, feeGrowthOutside1: 1n },
    upper: { initialized: true, feeGrowthOutside0: 1n, feeGrowthOutside1: 1n },
  }
  const base = {
    liquidity: 1_000_000n,
    tickLower: -100,
    tickUpper: 100,
    tickCurrent: 0,
    feesOwed0: 7n,
    feesOwed1: 9n,
    checkpoint0: 0n,
    checkpoint1: 0n,
    feeGrowthGlobal0: 10n,
    feeGrowthGlobal1: 10n,
  }

  test('missing tick accounts return null, not a smaller number', () => {
    expect(liveFeesForPosition({ ...base, ticks: null })).toBeNull()
  })

  test('an uninitialized boundary returns null', () => {
    // Its stored outside is zero, and using that would credit the position with
    // the pool's entire lifetime fee growth.
    expect(
      liveFeesForPosition({
        ...base,
        ticks: { ...ticks, lower: { ...ticks.lower, initialized: false } },
      }),
    ).toBeNull()
    expect(
      liveFeesForPosition({
        ...base,
        ticks: { ...ticks, upper: { ...ticks.upper, initialized: false } },
      }),
    ).toBeNull()
  })

  test('a position with no liquidity is live without reading a tick at all', () => {
    // Nothing accrues, so what is owed IS what is claimable.
    const live = liveFeesForPosition({ ...base, liquidity: 0n, ticks: null })
    expect(live).toEqual({ fees0: 7n, fees1: 9n })
  })
})
