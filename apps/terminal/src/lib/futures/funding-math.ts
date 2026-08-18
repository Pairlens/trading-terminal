// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The arithmetic behind the funding, basis and margin panes, as pure functions.
 *
 * A perp trader compares numbers that are only comparable once they are put on
 * the same footing, and every one of those conversions is a place two panes
 * would have drifted. The funding matrix, the belt and the extremes rail all
 * annualise; the extremes rail ranks a live rate against the contract's own
 * settled history; the margin pane and the liquidation map both measure a
 * distance to liquidation.
 *
 * Conventions used throughout, stated once:
 *
 * - A funding rate is a FRACTION per settlement interval, signed the way every
 *   venue signs it: positive means longs pay shorts.
 * - Basis is `(mark - index) / index`, so positive means the perp trades above
 *   spot. Rendered in basis points, which is where `10_000` comes from.
 * - Nothing here invents a number. Where an input is missing the result is
 *   `null`, because a pane can render "not published" and cannot un-render a
 *   plausible-looking zero.
 */

/** Hours in a 365-day year: the denominator every annualisation shares. */
export const HOURS_PER_YEAR = 8_760

/**
 * A per-interval funding rate as a yearly rate.
 *
 * `0.0001` every 8h is `0.0001 × 1095 = 10.95%` a year, which is the number the
 * matrix colours and the extremes rail sorts on. Simple, not compounded: every
 * venue and every data vendor quotes perp funding this way, and compounding it
 * would put Pairlens a few points away from the figure on the venue's own page
 * for no gain.
 */
export function annualizedFunding(
  ratePerInterval: number,
  intervalHours: number,
): number | null {
  if (!Number.isFinite(ratePerInterval)) return null
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) return null
  return ratePerInterval * (HOURS_PER_YEAR / intervalHours)
}

/** `(mark - index) / index`, or null when either leg is unusable. */
export function basisFraction(
  markPrice: number | undefined,
  indexPrice: number | undefined,
): number | null {
  if (markPrice == null || indexPrice == null) return null
  if (!Number.isFinite(markPrice) || !Number.isFinite(indexPrice)) return null
  if (indexPrice <= 0) return null
  return (markPrice - indexPrice) / indexPrice
}

/** The same figure in basis points, which is how a desk quotes it. */
export function basisBps(
  markPrice: number | undefined,
  indexPrice: number | undefined,
): number | null {
  const fraction = basisFraction(markPrice, indexPrice)
  return fraction === null ? null : fraction * 10_000
}

/**
 * What one settlement costs a position, in the settle currency.
 *
 * Positive is money LEAVING the account. A long pays the rate as published; a
 * short receives it, which is the sign flip — the whole reason this is a
 * function and not a multiplication at four call sites.
 */
export function fundingCost(
  notional: number,
  ratePerInterval: number,
  side: 'long' | 'short',
): number | null {
  if (!Number.isFinite(notional) || !Number.isFinite(ratePerInterval)) {
    return null
  }
  const cost = Math.abs(notional) * ratePerInterval
  return side === 'long' ? cost : -cost
}

export type FundingPoint = { ts: number; rate: number }

/**
 * The rates that settled inside the trailing window, summed.
 *
 * This is what "8h / 24h / 7d paid" means for a position held flat across the
 * window: funding is a sum of per-stamp payments, not an average. Null when no
 * stamp fell inside it, so the belt can say "no settlement yet" rather than
 * showing a confident zero for a contract listed an hour ago.
 */
export function fundingOverWindow(
  points: Array<FundingPoint>,
  windowMs: number,
  now: number,
): number | null {
  const from = now - windowMs
  let total = 0
  let seen = 0
  for (const point of points) {
    if (point.ts < from || point.ts > now) continue
    if (!Number.isFinite(point.rate)) continue
    total += point.rate
    seen++
  }
  return seen === 0 ? null : total
}

/**
 * Where a live rate sits inside a contract's own settled history, 0..100.
 *
 * This is the honest version of "the crowd has never paid more to be long
 * this": the comparison is against the SAME contract on the SAME venue, so a
 * perp that funds at 40% a year all year long does not read as extreme, and a
 * quiet contract that has just doubled its usual rate does.
 *
 * Ties count half, which is the standard percentile rank and the only
 * definition that gives a flat history a sane answer: a rate equal to every
 * stamp behind it is the middle of its range, not the top of it. Null on an
 * empty history, because a percentile of nothing is not zero.
 */
export function percentileOf(
  current: number,
  history: Array<number>,
): number | null {
  if (!Number.isFinite(current)) return null
  let below = 0
  let equal = 0
  let seen = 0
  for (const value of history) {
    if (!Number.isFinite(value)) continue
    seen++
    if (value < current) below++
    else if (value === current) equal++
  }
  if (seen === 0) return null
  return ((below + equal / 2) / seen) * 100
}

/**
 * Open interest in the settle currency.
 *
 * The venue's own figure wins where it publishes one. Binance publishes only
 * the contract count, so the mark price is what turns it into money — and with
 * neither the answer is null, because an OI leaderboard sorted on a fabricated
 * value would rank contracts by nothing at all.
 */
export function openInterestValue(input: {
  value?: number
  amount?: number
  markPrice?: number
  contractSize?: number
}): number | null {
  const { value, amount, markPrice, contractSize = 1 } = input
  if (value != null && Number.isFinite(value) && value > 0) return value
  if (amount == null || !Number.isFinite(amount)) return null
  if (markPrice == null || !Number.isFinite(markPrice) || markPrice <= 0) {
    return null
  }
  return amount * contractSize * markPrice
}

/**
 * Signed distance from the mark to the liquidation price, as a fraction.
 *
 * Negative for a long (liquidation sits below), positive for a short. Sign is
 * kept rather than absolute because the map draws bands on both sides of spot
 * and a magnitude alone would put a short's liquidation under the price.
 */
export function liquidationDistance(
  markPrice: number | undefined,
  liquidationPrice: number | undefined,
): number | null {
  if (markPrice == null || liquidationPrice == null) return null
  if (!Number.isFinite(markPrice) || !Number.isFinite(liquidationPrice)) {
    return null
  }
  if (markPrice <= 0 || liquidationPrice <= 0) return null
  return (liquidationPrice - markPrice) / markPrice
}

/**
 * Margin ratio after an adverse move of `move` (0.03 = 3% against the side).
 *
 * Returns a fraction where 1 is liquidation, which is how the gauge and the
 * stress rows both read it.
 *
 * Both legs move, and that is the part a naive version gets wrong: the loss
 * comes off equity, AND the maintenance requirement follows the notional, which
 * SHRINKS for a long as price falls and GROWS for a short as price rises. Using
 * a frozen maintenance figure overstates a long's danger and understates a
 * short's. Equity at or below zero is already past liquidation, so it clamps to
 * 1 rather than reporting a negative ratio.
 */
export function projectedMarginRatio(input: {
  equity: number
  maintenance: number
  notional: number
  side: 'long' | 'short'
  move: number
}): number | null {
  const { equity, maintenance, notional, side, move } = input
  if (![equity, maintenance, notional, move].every(Number.isFinite)) return null
  if (equity <= 0 || maintenance < 0 || notional < 0) return null
  const adverse = Math.abs(move)
  const loss = notional * adverse
  const nextEquity = equity - loss
  if (nextEquity <= 0) return 1
  const scale = side === 'long' ? 1 - adverse : 1 + adverse
  const nextMaintenance = maintenance * Math.max(scale, 0)
  return Math.min(nextMaintenance / nextEquity, 1)
}

/**
 * A price axis wide enough to hold every marker, with breathing room.
 *
 * The current price is always inside it: a map whose axis was derived from
 * liquidation prices alone would push spot off the edge as soon as a position
 * moved in your favour, and the marker is the whole reference point. Padding is
 * proportional so the axis reads the same on a $63,000 contract and a $0.07
 * one.
 */
export function priceAxisRange(
  prices: Array<number>,
  current: number,
  padding = 0.06,
): { min: number; max: number } | null {
  const usable = [...prices, current].filter((p) => Number.isFinite(p) && p > 0)
  if (usable.length === 0) return null
  let min = Math.min(...usable)
  let max = Math.max(...usable)
  if (max === min) {
    // One point, or every marker on the same price: give it a symmetric window
    // rather than a zero-width axis nothing can be positioned on.
    min = min * (1 - padding)
    max = max * (1 + padding)
    return { min, max }
  }
  const pad = (max - min) * padding
  return { min: min - pad, max: max + pad }
}

/** Where a price sits on that axis, 0 at `min` and 1 at `max`. */
export function axisPosition(
  price: number,
  range: { min: number; max: number },
): number {
  const span = range.max - range.min
  if (!(span > 0)) return 0.5
  return Math.min(Math.max((price - range.min) / span, 0), 1)
}

/**
 * The cash-and-carry gap across venues, in percentage POINTS of annualised
 * funding: long the cheapest, short the dearest.
 *
 * Null below two venues, because a spread needs two sides — one venue quoting
 * 40% is not a 40-point opportunity, it is one price.
 */
export function annualizedSpreadPoints(
  annualizedRates: Array<number>,
): number | null {
  const usable = annualizedRates.filter((r) => Number.isFinite(r))
  if (usable.length < 2) return null
  return (Math.max(...usable) - Math.min(...usable)) * 100
}
