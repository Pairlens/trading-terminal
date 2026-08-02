// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Protective exits: the stop-loss, take-profit, trailing stop and time stop a
 * script declares through `strategy(risk=...)`.
 *
 * Two rules shape everything here.
 *
 * First, risk is evaluated INTRABAR, against the bar's high and low rather than
 * its close. A stop that only looked at closes would sail through the wick that
 * actually took the account out, and the backtest would report a loss the live
 * bot never had the chance to avoid.
 *
 * Second, the fill is the trigger level, not the close. Returning the close
 * would hand every gap-through bar a fill far better than the stop asked for,
 * which is exactly the bar where honesty matters. The simplification we do
 * accept is that a bar which opens beyond the level still fills at the level;
 * modelling gap fills is the executor's job, where slippage lives.
 */
import type {
  BotBar,
  BotPosition,
  CustomIndicatorRiskSpec,
  RiskExit,
} from './types'

/**
 * Risk distances are fractions of price, so anything non-positive or
 * non-finite is not a tighter limit, it is an unconfigured one. Treating a 0
 * stop as "stop at the entry price" would exit every position on its first
 * bar.
 */
function fraction(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

/**
 * The extreme price after this bar: the highest high since entry for a long,
 * the lowest low for a short.
 *
 * The runtime calls this AFTER `evaluateRisk`, never before. A trailing stop is
 * set by the extreme as of the last close; letting the current bar's own high
 * lift the stop before checking it would let a single tall bar rescue itself.
 */
export function updateExtreme(position: BotPosition, bar: BotBar): number {
  const current = Number.isFinite(position.extremePrice)
    ? position.extremePrice
    : position.entryPrice
  return position.side === 'long'
    ? Math.max(current, bar.high)
    : Math.min(current, bar.low)
}

/**
 * The protective exit this bar triggers, or null when the position survives.
 *
 * Precedence, when more than one level falls inside the same bar:
 *
 *   1. stop-loss / trailing-stop
 *   2. take-profit
 *   3. max-bars
 *
 * We cannot know the path price took inside a bar, so an ambiguous bar is
 * resolved pessimistically: the stop wins over the target. A backtest that
 * booked the target on every ambiguous bar would be reporting the best of two
 * possible pasts, and the strategy would look profitable in precisely the
 * volatile conditions where it is not.
 *
 * Between the two stops the tie breaks differently, on physics rather than
 * pessimism: whichever level price touches first closes the trade, and the
 * other never fires. For a long that is the HIGHER of the two levels (price
 * falls through it on the way down), for a short the lower. Reporting the far
 * stop instead would invent a fill at a price the position no longer existed
 * at. On an exact tie the plain stop-loss is reported, being the limit the user
 * set explicitly.
 *
 * `max-bars` is last because it is the only exit that fills at the close: any
 * price level touched during the bar happened before the bar ended.
 */
export function evaluateRisk(
  position: BotPosition,
  bar: BotBar,
  spec: CustomIndicatorRiskSpec,
): RiskExit | null {
  const long = position.side === 'long'
  const entry = position.entryPrice
  // A position with a nonsense entry price still ages, so time stops keep
  // working even when the price-derived levels cannot be computed.
  const priced = Number.isFinite(entry) && entry > 0
  const extreme = Number.isFinite(position.extremePrice)
    ? position.extremePrice
    : entry

  const stopFraction = fraction(spec.stopLoss)
  const trailFraction = fraction(spec.trailingStop)
  const takeFraction = fraction(spec.takeProfit)

  let stopLevel: number | null = null
  let stopReason: 'stop-loss' | 'trailing-stop' = 'stop-loss'

  if (priced && stopFraction !== null) {
    const level = long ? entry * (1 - stopFraction) : entry * (1 + stopFraction)
    if (long ? bar.low <= level : bar.high >= level) stopLevel = level
  }

  if (priced && trailFraction !== null) {
    const level = long
      ? extreme * (1 - trailFraction)
      : extreme * (1 + trailFraction)
    if (long ? bar.low <= level : bar.high >= level) {
      const touchedFirst =
        stopLevel === null || (long ? level > stopLevel : level < stopLevel)
      if (touchedFirst) {
        stopLevel = level
        stopReason = 'trailing-stop'
      }
    }
  }

  if (stopLevel !== null) return { reason: stopReason, price: stopLevel }

  if (priced && takeFraction !== null) {
    const level = long ? entry * (1 + takeFraction) : entry * (1 - takeFraction)
    if (long ? bar.high >= level : bar.low <= level) {
      return { reason: 'take-profit', price: level }
    }
  }

  // `barsHeld` counts CLOSED bars since entry, so `>=` makes `maxBars: 3` mean
  // "hold for at most three bars", not four.
  const maxBars = spec.maxBars
  if (
    typeof maxBars === 'number' &&
    Number.isFinite(maxBars) &&
    maxBars > 0 &&
    position.barsHeld >= maxBars
  ) {
    return { reason: 'max-bars', price: bar.close }
  }

  return null
}
