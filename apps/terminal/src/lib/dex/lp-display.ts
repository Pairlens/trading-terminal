// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning a pool-ordered position into the pair a trader is looking at.
 *
 * A v3 pool orders its two tokens by contract address, so half of all pools
 * quote the leg nobody thinks in: the canonical Ethereum WETH/USDC pool has
 * USDC as token0 and reports a price of 0.00033 WETH per USDC. Every number the
 * pane shows (range bounds, current price, which side the position is drifting
 * into) has to be flipped for those. Getting the flip wrong does not look like
 * a bug, it looks like a range around a completely different price, so the
 * orientation is decided here and tested.
 *
 * Rule: match the pair's legs to the position's tokens BY ADDRESS first, then
 * by the quote leg's ticker, and fall back to the pool's own orientation
 * (token1 as the quote) when neither answers. Never infer from which token
 * "looks like" a stablecoin.
 */
import type { LpPositionEntry } from '@/lib/dex/lp-types'
import type { PairLegs } from '@/lib/dex/pair-legs'

export type OrientedLpPosition = {
  baseSymbol: string
  quoteSymbol: string
  /** Amounts and fees re-labelled base/quote. Null stays null. */
  baseAmount: number | null
  quoteAmount: number | null
  baseFees: number | null
  quoteFees: number | null
  /** Band and current price, quote per base. */
  priceLower: number | null
  priceUpper: number | null
  priceCurrent: number | null
  /** True when the pool's token1 is the pair's base, so prices were flipped. */
  inverted: boolean
}

/**
 * Which of the pool's tokens is the pair's base.
 *
 * Null means undeterminable, and the caller then uses the pool's own order
 * rather than guessing. Address matching comes first because a DEX pair key's
 * base leg IS an address on qualified routes, and because two tokens on the
 * same chain routinely share a ticker.
 */
export function baseIsToken0(
  entry: Pick<LpPositionEntry, 'token0' | 'token1'>,
  legs: PairLegs | null,
): boolean | null {
  if (!legs) return null
  const base = legs.base.toLowerCase()
  if (base === entry.token0.address.toLowerCase()) return true
  if (base === entry.token1.address.toLowerCase()) return false
  const quote = legs.quote.toUpperCase()
  if (quote === entry.token1.symbol.toUpperCase()) return true
  if (quote === entry.token0.symbol.toUpperCase()) return false
  const baseSymbol = legs.base.toUpperCase()
  if (baseSymbol === entry.token0.symbol.toUpperCase()) return true
  if (baseSymbol === entry.token1.symbol.toUpperCase()) return false
  return null
}

/** Reciprocal, guarding the zero that would render as `Infinity`. */
function invert(price: number | null): number | null {
  if (price === null || !Number.isFinite(price) || price === 0) return null
  return 1 / price
}

/**
 * Relabel a position base/quote, flipping the price scale when the pair's base
 * is the pool's token1.
 *
 * Inverting a range swaps the bounds as well as the values: the upper bound in
 * token1-per-token0 is the LOWER bound once the price is read the other way
 * round, and a band drawn without that swap is inside out.
 */
export function orientPosition(
  entry: LpPositionEntry,
  legs: PairLegs | null,
): OrientedLpPosition {
  const isToken0 = baseIsToken0(entry, legs) ?? true
  if (isToken0) {
    return {
      baseSymbol: entry.token0.symbol,
      quoteSymbol: entry.token1.symbol,
      baseAmount: entry.amount0,
      quoteAmount: entry.amount1,
      baseFees: entry.fees0,
      quoteFees: entry.fees1,
      priceLower: entry.priceLower,
      priceUpper: entry.priceUpper,
      priceCurrent: entry.priceCurrent,
      inverted: false,
    }
  }
  return {
    baseSymbol: entry.token1.symbol,
    quoteSymbol: entry.token0.symbol,
    baseAmount: entry.amount1,
    quoteAmount: entry.amount0,
    baseFees: entry.fees1,
    quoteFees: entry.fees0,
    priceLower: invert(entry.priceUpper),
    priceUpper: invert(entry.priceLower),
    priceCurrent: invert(entry.priceCurrent),
    inverted: true,
  }
}

/**
 * Where the current price sits in the band, 0..1, for the marker on the bar.
 *
 * Interpolated in LOG space because the tick scale is geometric: a band from 68
 * to 84 has its tick midpoint at 75.6, not 76, and a linear marker drifts
 * visibly off the middle on wide ranges. Null when the band is degenerate or
 * the price is unknown, which draws a bar with no marker instead of one pinned
 * to an end.
 */
export function rangePosition(
  current: number | null,
  lower: number | null,
  upper: number | null,
): number | null {
  if (current === null || lower === null || upper === null) return null
  if (!(lower > 0) || !(upper > lower) || !(current > 0)) return null
  const span = Math.log(upper) - Math.log(lower)
  if (!(span > 0)) return null
  const at = (Math.log(current) - Math.log(lower)) / span
  return Math.min(1, Math.max(0, at))
}

/**
 * Half-width of the band as a fraction, against its geometric centre.
 *
 * The geometric centre is the tick midpoint, which is what "±10% band" means to
 * whoever set the range. `±` is only honest because of that: measured against
 * the arithmetic mean the two sides would differ.
 */
export function bandHalfWidth(
  lower: number | null,
  upper: number | null,
): number | null {
  if (lower === null || upper === null) return null
  if (!(lower > 0) || !(upper > lower)) return null
  const centre = Math.sqrt(lower * upper)
  if (!(centre > 0)) return null
  return upper / centre - 1
}

/**
 * How far the price can still rise before the position stops earning, as a
 * fraction of the current price. Negative once it is already above the band.
 */
export function headroomToUpper(
  current: number | null,
  upper: number | null,
): number | null {
  if (current === null || upper === null || !(current > 0)) return null
  return upper / current - 1
}

/**
 * A position's two legs priced in USD.
 *
 * Both prices are required. Valuing one leg and calling the sum a position
 * value understates it by whatever the other side holds, and on a
 * concentrated-liquidity position that share swings from 0% to 100% as price
 * crosses the band.
 */
export function positionValueUsd(
  baseAmount: number | null,
  quoteAmount: number | null,
  basePriceUsd: number | null,
  quotePriceUsd: number | null,
): number | null {
  if (baseAmount === null || quoteAmount === null) return null
  if (basePriceUsd === null || quotePriceUsd === null) return null
  if (!(basePriceUsd > 0) || !(quotePriceUsd > 0)) return null
  return baseAmount * basePriceUsd + quoteAmount * quotePriceUsd
}

/**
 * Claimable fees summed per token symbol across positions.
 *
 * Per SYMBOL and not in USD, because a wallet's positions span pools whose
 * tokens this pane has no price for. A USD total that silently skipped the
 * unpriced rows would read as the whole claim.
 */
export function totalClaimableBySymbol(
  entries: ReadonlyArray<LpPositionEntry>,
): Array<{ symbol: string; amount: number }> {
  const totals = new Map<string, number>()
  const add = (symbol: string, amount: number | null) => {
    if (amount === null || !Number.isFinite(amount) || amount <= 0) return
    totals.set(symbol, (totals.get(symbol) ?? 0) + amount)
  }
  for (const entry of entries) {
    add(entry.token0.symbol, entry.fees0)
    add(entry.token1.symbol, entry.fees1)
  }
  return [...totals.entries()]
    .map(([symbol, amount]) => ({ symbol, amount }))
    .sort((a, b) => b.amount - a.amount)
}
