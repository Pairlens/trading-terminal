// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The user's limits on the bot, checked BEFORE the order exists.
 *
 * This is the deliberate difference from the app's global risk store, which
 * inspects fills after the fact and reports what already happened. A bot places
 * orders while nobody is watching, so its limits have to be a gate rather than
 * a report: by the time a post-hoc check notices the fourth losing trade, the
 * fourth losing trade has been paid for.
 *
 * The verdict distinguishes two failures. Some limits mean "this signal is not
 * allowed" and the bot keeps running; others mean "this bot is not allowed" and
 * it stops, visibly, for the user to look at. Getting that split wrong in
 * either direction is a real cost: a bot that halts on a cooldown is a bot the
 * user has to babysit, and a bot that merely skips a signal after blowing its
 * daily loss cap is a bot that will try again in a minute.
 */
import type { BotGuardConfig, BotGuardState, GuardVerdict } from './types'

/** What the guards need to know about the trade being considered. */
export type GuardContext = {
  /** Quote-currency value the intended entry would commit. */
  intendedNotional: number
  /** Bar index being decided. Compared against the last losing exit. */
  barIndex: number
  /** Current account equity, quote currency. Fallback base for the loss cap. */
  equity: number
}

/** The closed round trip `applyFill` folds into the counters. */
export type BotTradeOutcome = {
  /** Realized P&L of the closed trade in quote currency, net of fees. */
  realizedPnl: number
  /** Bar index the trade closed on. Starts the cooldown clock when it lost. */
  barIndex: number
}

function limit(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

function block(
  code: Extract<GuardVerdict, { allowed: false }>['code'],
  detail: string,
  halts: boolean,
): GuardVerdict {
  return { allowed: false, code, detail, halts }
}

/**
 * Whether the bot may act on this signal.
 *
 * Halting limits are checked first. When a bot has both blown its daily loss
 * cap and is inside a cooldown, "halted: daily loss cap reached" is the true
 * story and "skipped: cooling down" is a distraction the user would read as
 * routine.
 */
export function checkGuards(
  state: BotGuardState,
  config: BotGuardConfig,
  ctx: GuardContext,
): GuardVerdict {
  // Despite the name, this is a fraction (0.05 = 5%), per its declaration.
  const maxDailyLoss = limit(config.maxDailyLossPercent)
  if (maxDailyLoss !== null) {
    // `dayStartEquity` is the honest base — measuring against equity that has
    // already shrunk would keep moving the cap down and let the bot bleed past
    // it. It falls back to current equity only on the first bar of a fresh
    // deployment, before any day has started.
    const base = state.dayStartEquity > 0 ? state.dayStartEquity : ctx.equity
    const allowedLoss = base * maxDailyLoss
    if (base > 0 && state.realizedToday <= -allowedLoss) {
      return block(
        'daily-loss',
        `Daily loss ${state.realizedToday.toFixed(2)} reached the ${allowedLoss.toFixed(2)} cap`,
        true,
      )
    }
  }

  const maxStreak = limit(config.maxConsecutiveLosses)
  if (maxStreak !== null && state.consecutiveLosses >= maxStreak) {
    return block(
      'loss-streak',
      `${state.consecutiveLosses} losing trades in a row (limit ${maxStreak})`,
      true,
    )
  }

  // Below here the bot stays alive. Every one of these limits is about THIS
  // trade being wrong — too many today, too big, too soon — none of them is
  // evidence the strategy has stopped working, and all of them expire on their
  // own as bars close.
  const maxTrades = limit(config.maxTradesPerDay)
  if (maxTrades !== null && state.tradesToday >= maxTrades) {
    return block(
      'trade-cap',
      `${state.tradesToday} trades today reached the ${maxTrades} limit`,
      false,
    )
  }

  const cooldown = limit(config.cooldownBars)
  if (cooldown !== null && state.lastLossBarIndex !== null) {
    const elapsed = ctx.barIndex - state.lastLossBarIndex
    if (elapsed < cooldown) {
      return block(
        'cooldown',
        `${elapsed} of ${cooldown} cooldown bars elapsed since the last loss`,
        false,
      )
    }
  }

  const maxPosition = limit(config.maxPositionQuote)
  if (maxPosition !== null && ctx.intendedNotional > maxPosition) {
    return block(
      'position-cap',
      `Intended ${ctx.intendedNotional.toFixed(2)} exceeds the ${maxPosition.toFixed(2)} position cap`,
      false,
    )
  }

  return { allowed: true }
}

/**
 * Fold a closed trade into the guard counters. Pure: the caller persists the
 * returned state, and nothing here reads a clock, so the runtime — not this
 * reducer — is what resets `realizedToday`, `dayStartEquity` and `tradesToday`
 * at the UTC day boundary.
 *
 * A trade is counted when it CLOSES, because that is the event carrying a P&L.
 * `maxTradesPerDay` therefore counts completed round trips rather than open
 * ones, which is the conservative reading for a cap meant to stop overtrading.
 *
 * Breakeven is not a loss, but it is not a win either: a scratched trade leaves
 * the streak exactly where it was. Only a real loss extends it, only a real
 * gain clears it. `lastLossBarIndex` survives a winning trade for the same
 * reason — the cooldown is a wait measured from a loss, not a punishment a
 * later win can buy off.
 */
export function applyFill(
  state: BotGuardState,
  outcome: BotTradeOutcome,
): BotGuardState {
  const lost = outcome.realizedPnl < 0
  const won = outcome.realizedPnl > 0
  return {
    ...state,
    realizedToday: state.realizedToday + outcome.realizedPnl,
    tradesToday: state.tradesToday + 1,
    consecutiveLosses: lost
      ? state.consecutiveLosses + 1
      : won
        ? 0
        : state.consecutiveLosses,
    lastLossBarIndex: lost ? outcome.barIndex : state.lastLossBarIndex,
  }
}
