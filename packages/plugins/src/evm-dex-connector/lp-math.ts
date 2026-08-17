// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Concentrated-liquidity arithmetic: ticks to prices, and liquidity to the two
 * token amounts it currently stands for.
 *
 * A v3 position stores none of what a pane wants to show. On chain it is a
 * liquidity scalar plus two tick bounds, and the amounts of token0 and token1
 * behind it change with the pool price without a single storage write. So the
 * composition on screen is COMPUTED, and if this module is wrong the pane shows
 * a position that does not exist. Hence: pure functions, no I/O, tested against
 * the identities the protocol itself guarantees.
 *
 * The formulas, all from the v3 whitepaper (§6.2.9) and Uniswap's own
 * `LiquidityAmounts` library:
 *
 *   price(i)    = 1.0001^i                          raw token1 per raw token0
 *   sqrtP(i)    = 1.0001^(i/2)
 *   human price = price(i) · 10^(dec0 − dec1)       token1 per token0, human
 *
 *   below the range   amount0 = L · (√Pb − √Pa) / (√Pa · √Pb),  amount1 = 0
 *   inside the range  amount0 = L · (√Pb − √P)  / (√P  · √Pb)
 *                     amount1 = L · (√P  − √Pa)
 *   above the range   amount0 = 0,  amount1 = L · (√Pb − √Pa)
 *
 * Note the full-range case collapses to the v2 relation (amount0 = L/√P,
 * amount1 = L·√P), which is one of the test vectors.
 *
 * PRECISION. Tick square roots are computed in double precision rather than
 * with the protocol's Q64.96 fixed-point `TickMath`, which costs about 1e-12
 * relative accuracy on an amount and buys a module with no transcribed magic
 * constants in it. That trade is sound because nothing sized from these numbers
 * is exact: they are displayed, and in `lp-writer` they set the LOWER BOUND on
 * a removal, floored and then cut by a tolerance eight orders of magnitude
 * larger than the float error. What a write does need exactly it computes in
 * integers there (the liquidity being burnt, the amounts being deposited), and
 * a future MINT path would need the same. The one place rounding could actually
 * be seen — whether a position counts as in range — is decided on integer
 * ticks, so it cannot drift.
 */

/** Ratio between two adjacent ticks. The whole tick space is a power of this. */
export const TICK_BASE = 1.0001

/** Tick bounds the protocol enforces (`TickMath.MIN_TICK` / `MAX_TICK`). */
export const MIN_TICK = -887272
export const MAX_TICK = 887272

/** 2^96, the fixed-point scale slot0's `sqrtPriceX96` is expressed in. */
export const Q96 = 2 ** 96

/**
 * √(1.0001^tick), the price square root at a tick.
 *
 * Computed as `1.0001^(tick/2)` rather than `sqrt(1.0001^tick)`: same value,
 * half the exponent, and it stays inside double range across the entire tick
 * space (about 4e-20 to 2e19).
 */
export function sqrtRatioAtTick(tick: number): number {
  return TICK_BASE ** (tick / 2)
}

/**
 * Human price at a tick: how many token1 one token0 buys.
 *
 * The decimal correction is what makes this readable. A USDC/WETH pool stores
 * a raw ratio around 3.3e8; only after `10^(6−18)` does it become the 3.3e-4
 * ETH per USDC a human recognises.
 */
export function tickToPrice(
  tick: number,
  decimals0: number,
  decimals1: number,
): number {
  return TICK_BASE ** tick * 10 ** (decimals0 - decimals1)
}

/** The same price, read from the pool's live `sqrtPriceX96` instead of a tick. */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): number {
  const sqrtPrice = Number(sqrtPriceX96) / Q96
  return sqrtPrice * sqrtPrice * 10 ** (decimals0 - decimals1)
}

/**
 * Is the pool trading inside the position's band?
 *
 * Upper bound EXCLUSIVE, exactly as the pool treats it: at `tickUpper` the
 * position holds only token1 and earns nothing, so calling that "in range"
 * would put a green badge on a position that has stopped working.
 */
export function isInRange(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
): boolean {
  return currentTick >= tickLower && currentTick < tickUpper
}

export type RawAmounts = {
  /** token0 in raw units (still to be divided by 10^decimals0). */
  amount0: number
  amount1: number
}

/**
 * The two token amounts a liquidity position currently holds.
 *
 * Branches on the CURRENT TICK, not on square roots, so a position sitting
 * exactly on a bound lands in the same branch the pool would put it in. Inside
 * the range the pool's own √P is clamped into the band before it is used: it
 * belongs there by construction, and clamping is what stops double-precision
 * noise at a bound from producing a small negative amount.
 */
export function rawAmountsForLiquidity(opts: {
  /** Position liquidity, `uint128` as read from `positions()`. */
  liquidity: bigint
  /** Pool `sqrtPriceX96` from `slot0()`. */
  sqrtPriceX96: bigint
  currentTick: number
  tickLower: number
  tickUpper: number
}): RawAmounts {
  const liquidity = Number(opts.liquidity)
  if (!(liquidity > 0)) return { amount0: 0, amount1: 0 }

  const sqrtLower = sqrtRatioAtTick(opts.tickLower)
  const sqrtUpper = sqrtRatioAtTick(opts.tickUpper)
  if (!(sqrtUpper > sqrtLower)) return { amount0: 0, amount1: 0 }

  if (opts.currentTick < opts.tickLower) {
    // Price below the band: the position is entirely in token0, waiting to be
    // sold as price rises through it.
    return {
      amount0: (liquidity * (sqrtUpper - sqrtLower)) / (sqrtLower * sqrtUpper),
      amount1: 0,
    }
  }

  if (opts.currentTick >= opts.tickUpper) {
    // Price above the band: entirely token1.
    return { amount0: 0, amount1: liquidity * (sqrtUpper - sqrtLower) }
  }

  const sqrtPrice = Math.min(
    sqrtUpper,
    Math.max(sqrtLower, Number(opts.sqrtPriceX96) / Q96),
  )
  return {
    amount0: (liquidity * (sqrtUpper - sqrtPrice)) / (sqrtPrice * sqrtUpper),
    amount1: liquidity * (sqrtPrice - sqrtLower),
  }
}

/** Raw integer units → human units. Display only, so float space is fine. */
export function descaleAmount(raw: number | bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals
}

export type PositionAmounts = {
  /** Human units of token0 and token1 the liquidity stands for right now. */
  amount0: number
  amount1: number
}

/** `rawAmountsForLiquidity`, descaled by each token's decimals. */
export function positionAmounts(opts: {
  liquidity: bigint
  sqrtPriceX96: bigint
  currentTick: number
  tickLower: number
  tickUpper: number
  decimals0: number
  decimals1: number
}): PositionAmounts {
  const raw = rawAmountsForLiquidity(opts)
  return {
    amount0: descaleAmount(raw.amount0, opts.decimals0),
    amount1: descaleAmount(raw.amount1, opts.decimals1),
  }
}

/**
 * A fee tier as a fraction of notional: `3000` hundredths of a bip → `0.003`.
 *
 * The pool stores fee in hundredths of a basis point, which nobody reads as a
 * percentage without this.
 */
export function feeTierFraction(fee: number): number | null {
  if (!Number.isFinite(fee) || fee <= 0) return null
  return fee / 1_000_000
}
