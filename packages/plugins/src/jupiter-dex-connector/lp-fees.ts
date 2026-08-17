// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a Solana LP position could actually claim right now.
 *
 * A concentrated-liquidity pool never writes down what any one position has
 * earned. It keeps a single running total of fees per unit of liquidity, and on
 * every initialized tick the share of that total that accumulated on the far
 * side of it. A position stores the value of "growth inside my band" as of the
 * last time anything touched it, plus whatever had already been settled. So the
 * claimable amount is:
 *
 *   inside  = global − below − above          (all mod 2^128)
 *   claim   = feeOwed + (inside − checkpoint) · liquidity / 2^64
 *
 * where `below` and `above` are each either the boundary tick's stored outside
 * value or the global minus it, depending on which side of the tick the pool is
 * trading. That is the whole of it, and it is why fees are the one number on an
 * LP row that cannot be read off the position account.
 *
 * WRAP-AROUND IS NORMAL. Every quantity here is a `u128` the protocol allows to
 * overflow: `feeGrowthOutside` is initialized to the global at the time the tick
 * is first crossed, so `global − outside` is routinely a subtraction that would
 * be negative in integers and is defined to wrap. Treating a wrap as an error
 * would drop the fee figure on exactly the positions that have earned the most.
 * Every subtraction below is therefore modular, and none of them is checked.
 *
 * SCALE. Both Orca and Raydium use Q64.64 for fee growth. Uniswap v3 uses
 * Q128.128 for the same quantity, and this module is a shift away from being
 * silently wrong for that reason: at 2^128 a real position reports its settled
 * figure and nothing else, which reads as a working number rather than a bug.
 * `__tests__/lp-fees.test.ts` pins the scale against a mainnet fixture whose
 * expected value came from the Orca program itself.
 */

/** Everything a `u128` wraps at. */
export const U128_MODULUS = 1n << 128n

/** Q64.64: the fixed-point scale both protocols express fee growth in. */
export const FEE_GROWTH_SHIFT = 64n

/** `a − b` as the protocol computes it: modular, and a wrap is not an error. */
export function wrappingSub(a: bigint, b: bigint): bigint {
  return (((a - b) % U128_MODULUS) + U128_MODULUS) % U128_MODULUS
}

/**
 * Fee growth accumulated inside a band, per unit of liquidity.
 *
 * The two branches are the entire subtlety. A tick's `feeGrowthOutside` means
 * "growth on the other side of me from the current price", and which side that
 * is flips as the pool crosses it, so the same stored number is read as `below`
 * or as `global − below` depending on `tickCurrent`. Getting the comparison
 * boundaries wrong (`>=` on the lower, `<` on the upper, matching how a pool
 * treats an in-range position) inverts the correction and produces a number
 * that is plausible and wrong.
 */
export function feeGrowthInside(opts: {
  feeGrowthGlobal: bigint
  lowerOutside: bigint
  upperOutside: bigint
  tickCurrent: number
  tickLower: number
  tickUpper: number
}): bigint {
  const { feeGrowthGlobal: global } = opts
  const below =
    opts.tickCurrent >= opts.tickLower
      ? opts.lowerOutside
      : wrappingSub(global, opts.lowerOutside)
  const above =
    opts.tickCurrent < opts.tickUpper
      ? opts.upperOutside
      : wrappingSub(global, opts.upperOutside)
  return wrappingSub(wrappingSub(global, below), above)
}

/**
 * Fees earned since the checkpoint, in raw token units.
 *
 * Truncating division, which is what the protocol does: the pool keeps the
 * remainder rather than paying out a unit it has not collected.
 */
export function feeDeltaSinceCheckpoint(opts: {
  feeGrowthInside: bigint
  checkpoint: bigint
  liquidity: bigint
}): bigint {
  if (opts.liquidity <= 0n) return 0n
  const growth = wrappingSub(opts.feeGrowthInside, opts.checkpoint)
  return (growth * opts.liquidity) >> FEE_GROWTH_SHIFT
}

/** A position's two boundary ticks, as the pool stores them. */
export type BoundaryTicks = {
  lower: {
    initialized: boolean
    feeGrowthOutside0: bigint
    feeGrowthOutside1: bigint
  }
  upper: {
    initialized: boolean
    feeGrowthOutside0: bigint
    feeGrowthOutside1: bigint
  }
}

export type LiveFees = {
  /** Settled plus replayed, raw units. What a claim would pay. */
  fees0: bigint
  fees1: bigint
}

/**
 * The claimable figure for one position, or null when it cannot be replayed.
 *
 * Null is the honest answer and the caller renders it as `last-touch` for THAT
 * position rather than dropping the whole page: an uninitialized boundary tick
 * has no meaningful `feeGrowthOutside`, and using its zero would report the
 * pool's entire lifetime growth as one position's fees.
 *
 * A position with no liquidity is not a failure. It earns nothing, so its
 * settled figure IS the live one and it returns exactly that, without ever
 * needing a tick account.
 */
export function liveFeesForPosition(opts: {
  liquidity: bigint
  tickLower: number
  tickUpper: number
  tickCurrent: number
  feesOwed0: bigint
  feesOwed1: bigint
  checkpoint0: bigint
  checkpoint1: bigint
  feeGrowthGlobal0: bigint
  feeGrowthGlobal1: bigint
  ticks: BoundaryTicks | null
}): LiveFees | null {
  if (opts.liquidity <= 0n) {
    return { fees0: opts.feesOwed0, fees1: opts.feesOwed1 }
  }
  const { ticks } = opts
  if (!ticks || !ticks.lower.initialized || !ticks.upper.initialized)
    return null

  const common = {
    tickCurrent: opts.tickCurrent,
    tickLower: opts.tickLower,
    tickUpper: opts.tickUpper,
  }
  const inside0 = feeGrowthInside({
    ...common,
    feeGrowthGlobal: opts.feeGrowthGlobal0,
    lowerOutside: ticks.lower.feeGrowthOutside0,
    upperOutside: ticks.upper.feeGrowthOutside0,
  })
  const inside1 = feeGrowthInside({
    ...common,
    feeGrowthGlobal: opts.feeGrowthGlobal1,
    lowerOutside: ticks.lower.feeGrowthOutside1,
    upperOutside: ticks.upper.feeGrowthOutside1,
  })
  return {
    fees0:
      opts.feesOwed0 +
      feeDeltaSinceCheckpoint({
        feeGrowthInside: inside0,
        checkpoint: opts.checkpoint0,
        liquidity: opts.liquidity,
      }),
    fees1:
      opts.feesOwed1 +
      feeDeltaSinceCheckpoint({
        feeGrowthInside: inside1,
        checkpoint: opts.checkpoint1,
        liquidity: opts.liquidity,
      }),
  }
}
