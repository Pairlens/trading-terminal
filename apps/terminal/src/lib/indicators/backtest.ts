// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { evaluateRisk, updateExtreme } from '@pairlens/bot-engine/risk'
import type { BotPosition } from '@pairlens/bot-engine/types'
import type { ChartBar } from 'fast-financial-charts/types'
import type { CustomIndicatorStrategySpec } from '@pairlens/shared/plugin-types'

// ---------------------------------------------------------------------------
// Replays the per-bar signal arrays a strategy script returns into a trade
// ledger, an equity curve and summary stats — the Strategy Tester half of the
// custom-indicator feature.
//
// The rule that makes the numbers trustworthy: a signal on bar `i` fills at
// `bars[i + 1].open`. Filling on the signal bar's close would let the strategy
// trade on information it could not have had, which turns every backtest into
// fiction. A signal on the last bar therefore never fills.
//
// Protective exits (`spec.risk`) are the one thing here that is NOT implemented
// here: they come from `@pairlens/bot-engine/risk`, the same module a live bot
// runs. A tester that reimplemented its own stop-loss would eventually disagree
// with the bot it is meant to predict, and the disagreement would only surface
// on the bar where real money was at stake.
// ---------------------------------------------------------------------------

/**
 * Per-bar signal arrays produced by a strategy's `compute(ctx)`. Every array is
 * indexed like `bars`; anything shorter (or missing) reads as zero, so a script
 * that only fills part of the window degrades to "no signal" instead of
 * throwing.
 */
export type BacktestSignals = {
  /** Nonzero = be long on this bar. */
  long?: Float64Array
  /** Nonzero = be short on this bar. */
  short?: Float64Array
  /** -1 | 0 | +1 target position; wins over every other array. */
  position?: Float64Array
  /** Nonzero = enter; direction taken from `long`/`short`, default long. */
  entries?: Float64Array
  /** Nonzero = flatten. */
  exits?: Float64Array
}

/**
 * What ended a trade. `'signal'` is the strategy changing its mind; the four
 * protective reasons come straight from the bot engine, so a tester row and a
 * live bot's event log read the same word for the same event. `'open'` marks
 * the position that ran out of data rather than out of reasons.
 */
export type BacktestExitReason =
  | 'signal'
  | 'stop-loss'
  | 'take-profit'
  | 'trailing-stop'
  | 'max-bars'
  | 'open'

/**
 * One round trip through the market. Still-open at the end of data is
 * represented by null exits, with `pnl` marked to the final close.
 */
export type BacktestTrade = {
  direction: 'long' | 'short'
  entryIndex: number
  entryTs: number
  entryPrice: number
  /** null while still open at the end of data. */
  exitIndex: number | null
  exitTs: number | null
  exitPrice: number | null
  quantity: number
  /** Net of fees and slippage, in quote currency. */
  pnl: number
  /** `pnl` over the entry notional, as a fraction. */
  pnlPercent: number
  /** Bars held. */
  bars: number
  /** Why the trade ended. `'open'` when it never did. */
  exitReason: BacktestExitReason
}

/**
 * Headline numbers for the tester panel. Aggregates cover closed trades only —
 * an open position contributes to the equity curve but not to win rate,
 * profit factor or the trade counts.
 */
export type BacktestStats = {
  initialCapital: number
  /** Last equity point, including any open position's unrealized P&L. */
  finalEquity: number
  netProfit: number
  netProfitPercent: number
  /** Buy-and-hold over the same window, for an honest comparison. */
  buyHoldPercent: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  /** 0..1, winners over all closed trades (breakevens count in the base). */
  winRate: number
  /** Gross profit / gross loss; Infinity when there are wins and no losses. */
  profitFactor: number
  averageWin: number
  /** Signed, so a losing average is negative. */
  averageLoss: number
  largestWin: number
  /** Signed, so the worst trade is negative. */
  largestLoss: number
  /** Absolute, quote currency. */
  maxDrawdown: number
  /** 0..1; peak-relative, so it can peak on a different bar than the above. */
  maxDrawdownPercent: number
  /** Annualized from the median bar spacing; 0 when undefined. */
  sharpeRatio: number
  totalFees: number
  averageBarsHeld: number
  /** Longest run of consecutive losing trades. */
  maxConsecutiveLosses: number
  /** 0..1, fraction of bars holding a position. */
  timeInMarket: number
}

/** Everything the tester UI needs: a ledger, a curve, and the summary. */
export type BacktestResult = {
  trades: Array<BacktestTrade>
  stats: BacktestStats
  /** Per-bar equity, same length as bars — for the equity curve. */
  equity: Float64Array
  /** Per-bar drawdown from the running peak, as a 0..1 fraction. */
  drawdown: Float64Array
  /** Per-bar held position, -1/0/1 — lets the chart shade in-position runs. */
  position: Float64Array
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** Keeps NaN/Infinity out of the stats block. */
const finite = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback

/** Reads a signal array defensively: 0 when absent, short, or non-finite. */
const signalAt = (array: Float64Array | undefined, index: number): number => {
  if (array === undefined || index >= array.length) return 0
  const value = array[index]
  return Number.isFinite(value) ? value : 0
}

/** Clamps a spec into the ranges the maths assumes. */
const normalizeSpec = (
  spec: CustomIndicatorStrategySpec,
): CustomIndicatorStrategySpec => {
  const normalized: CustomIndicatorStrategySpec = {
    initialCapital: Math.max(finite(spec.initialCapital), 0),
    positionSize: Math.min(Math.max(finite(spec.positionSize), 0), 1),
    fee: Math.max(finite(spec.fee), 0),
    slippage: Math.max(finite(spec.slippage), 0),
    allowShort: spec.allowShort === true,
  }
  // `risk` passes through untouched. `evaluateRisk` already treats a
  // non-positive or non-finite distance as "unconfigured", and clamping it a
  // second time here would be a second opinion on what the user asked for —
  // exactly the drift between tester and bot this feature exists to prevent.
  if (spec.risk !== undefined) normalized.risk = spec.risk
  return normalized
}

/**
 * Collapses the signal arrays into one target position per bar (-1/0/+1).
 *
 * Precedence is `position`, then the `entries`/`exits` state machine, then the
 * `long`/`short` state arrays. `entries`/`exits` outrank `long`/`short` because
 * when both are supplied the pulse arrays are the events and `long`/`short`
 * only carry the direction of an entry — reading them as standalone state
 * would flatten the position on the bar after every entry.
 *
 * Exported for the live bot runtime, which must read the target of the last
 * CLOSED bar through this exact function. A second implementation of this
 * precedence would let the tester and the live bot disagree about what the
 * same script asked for, which is the one divergence this feature cannot have.
 */
export const resolveTargets = (
  barCount: number,
  signals: BacktestSignals,
  allowShort: boolean,
): Float64Array => {
  const targets = new Float64Array(barCount)
  const { position, entries, exits, long, short } = signals
  const useEvents =
    position === undefined && (entries !== undefined || exits !== undefined)
  let held = 0

  for (let i = 0; i < barCount; i += 1) {
    let target = 0
    if (position !== undefined) {
      const rounded = Math.round(signalAt(position, i))
      if (rounded > 0) target = 1
      else if (rounded < 0) target = -1
    } else if (useEvents) {
      // Exits are applied before entries, so a bar carrying both ends up in
      // the entry's direction rather than flat.
      if (signalAt(exits, i) !== 0) held = 0
      if (signalAt(entries, i) !== 0) {
        const wantsShort =
          signalAt(short, i) !== 0 && signalAt(long, i) === 0 ? -1 : 1
        held = wantsShort
      }
      target = held
    } else {
      const isLong = signalAt(long, i) !== 0
      const isShort = signalAt(short, i) !== 0
      if (isLong && isShort) target = 0
      else if (isLong) target = 1
      else if (isShort) target = -1
    }
    if (target < 0 && !allowShort) target = 0
    targets[i] = target
  }
  return targets
}

/** sqrt(periods per year), inferred from the median bar spacing. 0 if unknown. */
const annualization = (bars: Array<ChartBar>): number => {
  const n = bars.length
  if (n < 2) return 0
  const spacings = new Float64Array(n - 1)
  let count = 0
  for (let i = 1; i < n; i += 1) {
    const delta = bars[i].ts - bars[i - 1].ts
    if (Number.isFinite(delta) && delta > 0) {
      spacings[count] = delta
      count += 1
    }
  }
  if (count === 0) return 0
  const used = spacings.subarray(0, count)
  used.sort()
  const mid = count >> 1
  const median = count % 2 === 1 ? used[mid] : (used[mid - 1] + used[mid]) / 2
  if (!(median > 0)) return 0
  return finite(Math.sqrt(YEAR_MS / median))
}

/** Annualized Sharpe of the per-bar equity returns; 0 when it is undefined. */
const sharpeOf = (equity: Float64Array, factor: number): number => {
  const n = equity.length
  if (n < 2 || factor <= 0) return 0
  const count = n - 1
  let sum = 0
  for (let i = 1; i < n; i += 1) {
    const prev = equity[i - 1]
    sum += prev > 0 ? equity[i] / prev - 1 : 0
  }
  const mean = sum / count
  let variance = 0
  for (let i = 1; i < n; i += 1) {
    const prev = equity[i - 1]
    const ret = prev > 0 ? equity[i] / prev - 1 : 0
    variance += (ret - mean) * (ret - mean)
  }
  variance /= count
  const stdev = Math.sqrt(variance)
  if (!(stdev > 0)) return 0
  return finite((mean / stdev) * factor)
}

const emptyResult = (initialCapital: number): BacktestResult => ({
  trades: [],
  stats: {
    initialCapital,
    finalEquity: initialCapital,
    netProfit: 0,
    netProfitPercent: 0,
    buyHoldPercent: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    profitFactor: 0,
    averageWin: 0,
    averageLoss: 0,
    largestWin: 0,
    largestLoss: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    sharpeRatio: 0,
    totalFees: 0,
    averageBarsHeld: 0,
    maxConsecutiveLosses: 0,
    timeInMarket: 0,
  },
  equity: new Float64Array(0),
  drawdown: new Float64Array(0),
  position: new Float64Array(0),
})

/**
 * Replays `signals` over `bars` under `spec` and returns the trade ledger,
 * equity curve and summary stats. Pure: no I/O, no shared state, no mutation
 * of its inputs.
 *
 * Fills land at the next bar's open, sizing commits `positionSize` of the
 * equity available at that moment (so wins compound), and fees are charged per
 * side. A direction flip is one exit plus one entry on the same bar at the same
 * fill price — both legs trade the same way round, so slippage moves them
 * identically — and pays two fees.
 *
 * When `spec.risk` is present, every bar is first offered to `evaluateRisk`
 * before the strategy gets to act on it (see the loop for why that ordering,
 * and what it costs).
 */
export function runBacktest(
  bars: Array<ChartBar>,
  signals: BacktestSignals,
  spec: CustomIndicatorStrategySpec,
): BacktestResult {
  const { initialCapital, positionSize, fee, slippage, allowShort, risk } =
    normalizeSpec(spec)
  const n = bars.length
  if (n === 0) return emptyResult(initialCapital)

  const targets = resolveTargets(n, signals, allowShort)
  const equity = new Float64Array(n)
  const drawdown = new Float64Array(n)
  const positionOut = new Float64Array(n)
  const trades: Array<BacktestTrade> = []

  // Realized account equity. An open position is marked separately so the
  // curve moves on every bar, not only on trade bars.
  let cash = initialCapital
  let direction = 0
  let quantity = 0
  let entryPrice = 0
  let entryFee = 0
  let entryIndex = -1

  // The same shape the live runtime carries, held in lockstep with the locals
  // above. It exists so `evaluateRisk` sees exactly what it will see in
  // production — a position with a side, an age and a running extreme — rather
  // than something assembled per call from tester-private variables. Null
  // exactly when `direction === 0`.
  let position: BotPosition | null = null

  let totalFees = 0
  let inMarketBars = 0
  let peak = Number.NEGATIVE_INFINITY
  let maxDrawdown = 0
  let maxDrawdownPercent = 0

  let closedTrades = 0
  let winningTrades = 0
  let losingTrades = 0
  let grossProfit = 0
  let grossLoss = 0
  let largestWin = 0
  let largestLoss = 0
  let totalBarsHeld = 0
  let lossStreak = 0
  let maxConsecutiveLosses = 0

  /**
   * Books an exit of the open position at `fillPrice` and folds it into every
   * closed-trade aggregate. Signal exits and protective exits both go through
   * here so the two can never drift apart on fees, on how a breakeven trade
   * treats the loss streak, or on what `bars` counts.
   */
  const recordExit = (
    fillPrice: number,
    index: number,
    reason: BacktestExitReason,
  ): void => {
    const exitFee = quantity * fillPrice * fee
    const gross = direction * (fillPrice - entryPrice) * quantity
    cash += gross - exitFee
    totalFees += exitFee
    const pnl = gross - exitFee - entryFee
    const notional = quantity * entryPrice
    trades.push({
      direction: direction > 0 ? 'long' : 'short',
      entryIndex,
      entryTs: bars[entryIndex].ts,
      entryPrice,
      exitIndex: index,
      exitTs: bars[index].ts,
      exitPrice: fillPrice,
      quantity,
      pnl,
      pnlPercent: notional > 0 ? pnl / notional : 0,
      bars: index - entryIndex,
      exitReason: reason,
    })

    closedTrades += 1
    totalBarsHeld += index - entryIndex
    if (pnl > 0) {
      winningTrades += 1
      grossProfit += pnl
      if (pnl > largestWin) largestWin = pnl
      lossStreak = 0
    } else if (pnl < 0) {
      losingTrades += 1
      grossLoss -= pnl
      if (pnl < largestLoss) largestLoss = pnl
      lossStreak += 1
      if (lossStreak > maxConsecutiveLosses) maxConsecutiveLosses = lossStreak
    } else {
      lossStreak = 0
    }

    direction = 0
    quantity = 0
    position = null
  }

  for (let i = 0; i < n; i += 1) {
    const bar = bars[i]

    // Protective exits go first, against the position carried INTO this bar.
    //
    // The ordering is a choice about an unknowable: with only OHLC we cannot
    // say whether the stop was touched before or after the strategy's fill at
    // the open. Resolving it in the stop's favour is the pessimistic reading,
    // and pessimism is the only bias a backtest is allowed to have.
    //
    // A consequence worth naming: a position entered on bar `i` is not offered
    // to `evaluateRisk` until bar `i + 1`, because at this point in bar `i` it
    // did not exist yet. Its own bar still counts towards the trailing extreme
    // (folded in at the bottom of the loop), so only the first bar's stop check
    // is skipped.
    let riskClosed = false
    if (risk !== undefined && position !== null) {
      const exit = evaluateRisk(position, bar, risk)
      // A trigger price that is not a usable number is dropped rather than
      // booked: an exit at NaN would poison the equity curve from that bar on.
      if (exit !== null && Number.isFinite(exit.price) && exit.price > 0) {
        // Closing a long is a sell, so slippage moves the fill against us in
        // exactly the same direction a signal exit's would.
        recordExit(exit.price * (1 - slippage * direction), i, exit.reason)
        riskClosed = true
      }
    }

    // The target set on the previous bar is what we may act on now: this bar's
    // open is the first price available after that signal existed.
    const desired = i > 0 ? targets[i - 1] : 0

    // A bar that produced a protective exit produces nothing else. The
    // strategy has no idea it was stopped out, so its target is still pointing
    // the way it was — re-entering on it here would put the position straight
    // back on at this bar's open and reduce the stop to decoration. The
    // opposite direction is refused too, for a different reason: it would fill
    // at the open, a price that is already in the past by the time the stop
    // triggered, and the live engine emits at most one order per bar close.
    // Re-entry is a matter for the NEXT bar, and needs nothing special — the
    // target still says what it says, and the transition below will act on it.
    if (!riskClosed && desired !== direction) {
      // Both legs of a flip trade the same way round (long -> short is two
      // sells), so one slippage-adjusted price serves the whole transition.
      const side = desired !== 0 ? desired : -direction
      const open = bar.open
      const raw = Number.isFinite(open) ? open : 0
      const fillPrice = raw * (1 + slippage * side)

      if (direction !== 0) recordExit(fillPrice, i, 'signal')

      if (desired !== 0 && fillPrice > 0) {
        // The entry fee comes out of the same budget as the notional: at
        // positionSize 1 the position plus its fee must still fit inside
        // equity, or the backtest quietly trades on leverage it doesn't have.
        const budget = Math.max(cash, 0) * positionSize
        const committed = budget / (1 + fee)
        const openFee = committed * fee
        cash -= openFee
        totalFees += openFee
        quantity = committed / fillPrice
        entryPrice = fillPrice
        entryFee = openFee
        entryIndex = i
        direction = desired
        position = {
          side: desired > 0 ? 'long' : 'short',
          quantity,
          entryPrice,
          entryTs: bar.ts,
          // Nothing has closed yet, and the best price seen so far is the one
          // we just paid.
          barsHeld: 0,
          extremePrice: fillPrice,
        }
      }
    }

    positionOut[i] = direction
    if (direction !== 0) inMarketBars += 1

    // This bar is now history as far as the position is concerned: it can lift
    // a trailing stop, and it counts against `maxBars`. Both happen after the
    // risk check above, never before — a bar that rescued itself by setting the
    // very high its own trail is measured from would never stop out.
    if (position !== null) {
      position.extremePrice = updateExtreme(position, bar)
      position.barsHeld += 1
    }

    const close = bar.close
    const mark = Number.isFinite(close) ? close : entryPrice
    equity[i] =
      direction !== 0 ? cash + direction * (mark - entryPrice) * quantity : cash

    if (equity[i] > peak) peak = equity[i]
    const gap = peak - equity[i]
    const gapPercent = peak > 0 ? gap / peak : 0
    drawdown[i] = gapPercent
    if (gap > maxDrawdown) maxDrawdown = gap
    if (gapPercent > maxDrawdownPercent) maxDrawdownPercent = gapPercent
  }

  if (direction !== 0) {
    // Left open at the end of data: reported for rendering with its P&L marked
    // to the final close, but excluded from every closed-trade aggregate.
    const lastClose = bars[n - 1].close
    const mark = Number.isFinite(lastClose) ? lastClose : entryPrice
    const pnl = direction * (mark - entryPrice) * quantity - entryFee
    const notional = quantity * entryPrice
    trades.push({
      direction: direction > 0 ? 'long' : 'short',
      entryIndex,
      entryTs: bars[entryIndex].ts,
      entryPrice,
      exitIndex: null,
      exitTs: null,
      exitPrice: null,
      quantity,
      pnl,
      pnlPercent: notional > 0 ? pnl / notional : 0,
      bars: n - 1 - entryIndex,
      exitReason: 'open',
    })
  }

  const finalEquity = finite(equity[n - 1], initialCapital)
  const netProfit = finalEquity - initialCapital
  const firstOpen = bars[0].open
  const lastClose = bars[n - 1].close
  const buyHoldPercent =
    Number.isFinite(firstOpen) && firstOpen > 0 && Number.isFinite(lastClose)
      ? (lastClose - firstOpen) / firstOpen
      : 0

  let profitFactor = 0
  if (grossLoss > 0) profitFactor = grossProfit / grossLoss
  else if (grossProfit > 0) profitFactor = Number.POSITIVE_INFINITY

  return {
    trades,
    stats: {
      initialCapital,
      finalEquity,
      netProfit: finite(netProfit),
      netProfitPercent:
        initialCapital > 0 ? finite(netProfit / initialCapital) : 0,
      buyHoldPercent: finite(buyHoldPercent),
      totalTrades: closedTrades,
      winningTrades,
      losingTrades,
      winRate: closedTrades > 0 ? winningTrades / closedTrades : 0,
      profitFactor,
      averageWin: winningTrades > 0 ? finite(grossProfit / winningTrades) : 0,
      averageLoss: losingTrades > 0 ? finite(-grossLoss / losingTrades) : 0,
      largestWin,
      largestLoss,
      maxDrawdown: finite(maxDrawdown),
      maxDrawdownPercent: finite(maxDrawdownPercent),
      sharpeRatio: sharpeOf(equity, annualization(bars)),
      totalFees: finite(totalFees),
      averageBarsHeld: closedTrades > 0 ? totalBarsHeld / closedTrades : 0,
      maxConsecutiveLosses,
      timeInMarket: inMarketBars / n,
    },
    equity,
    drawdown,
    position: positionOut,
  }
}
