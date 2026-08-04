// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bot engine's vocabulary.
 *
 * A bot is a *deployment* of a strategy script to a market: the script decides
 * what position to hold, the deployment decides where, how large, and under
 * what limits. Everything in this package is pure — no clock, no network, no
 * storage — because it is the code that decides whether real money moves, and
 * that code has to be reproducible in a test.
 *
 * The single invariant the whole feature rests on: the Strategy Tester and the
 * live runtime both reach their decisions through `decideTransition` and
 * `evaluateRisk`. A backtest is only a claim about the future if the thing
 * being tested is the thing that will run.
 */
import type { CustomIndicatorRiskSpec } from '@pairlens/shared/plugin-types'

export type { CustomIndicatorRiskSpec }

/**
 * Paper trades against the live feed with simulated fills; live routes real
 * orders to the venue. The distinction is carried all the way down rather than
 * being a flag on the executor, so nothing can accidentally default to live.
 */
export type BotMode = 'paper' | 'live'

/** Which way a position faces. Flat is the absence of a position, not a side. */
export type BotSide = 'long' | 'short'

export type BotStatus =
  /** Never started, or explicitly turned off. */
  | 'stopped'
  /** Running, waiting for the current bar to close. */
  | 'running'
  /** Enabled but not yet fed a full candle window. */
  | 'warming-up'
  /** Halted by an error; needs the user to look at it. */
  | 'error'
  /** Halted by a guard (daily loss cap, trade cap...). */
  | 'halted'
  /**
   * A live bot whose credential vault is sealed. Deliberately NOT `halted`:
   * the bot is still armed and resumes by itself the moment the vault opens,
   * so disabling the definition (which is what halting does) would turn "I
   * rebooted my laptop" into "all my bots are off and nobody told me".
   */
  | 'waiting-unlock'

/** How much to commit per entry. */
export type BotSizing =
  /** Fraction (0..1] of the tradable balance at entry time. */
  | { kind: 'percent-equity'; value: number }
  /** A fixed amount of quote currency (e.g. 250 USDT). */
  | { kind: 'fixed-quote'; value: number }
  /** A fixed amount of base currency (e.g. 0.01 BTC). */
  | { kind: 'fixed-base'; value: number }

/**
 * Limits enforced outside the strategy. These are the user's rules about the
 * bot, not the author's rules about the market, which is why they live on the
 * deployment and not in the script.
 */
export type BotGuardConfig = {
  /** Stop the bot once realized losses today reach this fraction of equity. */
  maxDailyLossPercent?: number
  /** Stop the bot after this many entries in a rolling 24h. */
  maxTradesPerDay?: number
  /** Never hold more than this notional, in quote currency. */
  maxPositionQuote?: number
  /** Wait this many closed bars after a losing exit before entering again. */
  cooldownBars?: number
  /** Stop the bot after this many losing trades in a row. */
  maxConsecutiveLosses?: number
}

/** A bot definition as the user configured it. Persisted. */
export type BotDefinition = {
  id: string
  name: string
  /** Script in the indicator-scripts store; must declare `strategy(...)`. */
  scriptId: string
  /** Input overrides for the script's declared `inputs`. */
  params: Record<string, unknown>
  /** Venue plugin id. */
  market: string
  /** 'BASE-QUOTE'. */
  pair: string
  timeframe: string
  mode: BotMode
  sizing: BotSizing
  guards: BotGuardConfig
  /** User's turn-on intent. The runtime may still be stopped (see status). */
  enabled: boolean
  /**
   * Live bots are never silently resumed across an app restart — the user has
   * to see that real orders are about to flow again. Set when a live bot is
   * loaded from storage, cleared when the user re-arms.
   */
  needsRearm?: boolean
  createdAt: number
  updatedAt: number
}

/** The position a bot currently holds. */
export type BotPosition = {
  side: BotSide
  /** Base-currency size. Always positive; direction lives in `side`. */
  quantity: number
  /** Average fill price of the entry. */
  entryPrice: number
  entryTs: number
  /** Closed bars elapsed since entry — drives `maxBars`. */
  barsHeld: number
  /**
   * Best price seen since entry (high for longs, low for shorts). Trailing
   * stops measure from here, so it has to be tracked bar by bar rather than
   * recomputed, which would need history the runtime doesn't keep.
   */
  extremePrice: number
}

/** Why the engine wants to trade. Every intent carries one; the UI shows it. */
export type BotIntentReason =
  | 'signal-entry'
  | 'signal-exit'
  | 'signal-flip'
  | 'stop-loss'
  | 'take-profit'
  | 'trailing-stop'
  | 'max-bars'
  | 'manual-close'
  | 'bot-disabled'

/**
 * One order the engine wants placed. At most one per bar close: a strategy
 * that flips direction produces a single `flip` intent rather than an exit and
 * an entry that could partially fail and leave the bot in a state neither the
 * engine nor the user expected.
 */
export type BotOrderIntent = {
  kind: 'enter' | 'exit' | 'flip'
  /** Venue-facing side of the order to submit. */
  side: 'buy' | 'sell'
  /** Position to hold once filled: the side, or null to end up flat. */
  targetSide: BotSide | null
  reason: BotIntentReason
  /** Bar index in the compute window that produced this decision. */
  barIndex: number
}

/** Everything `decideTransition` needs. Pure input — no ambient state. */
export type BotDecisionInput = {
  /** Currently held position, or null when flat. */
  position: BotPosition | null
  /** Target from the last CLOSED bar: 1 long, -1 short, 0 flat. */
  target: number
  /** Whether the deployment permits shorts (venue + strategy must both allow). */
  allowShort: boolean
  barIndex: number
}

/** A protective exit that fired. */
export type RiskExit = {
  reason: Extract<
    BotIntentReason,
    'stop-loss' | 'take-profit' | 'trailing-stop' | 'max-bars'
  >
  /**
   * Price the exit is assumed to fill at. For price-triggered stops this is
   * the trigger level, not the bar's close: a stop that only filled at the
   * close would flatter every backtest that ran through a gap.
   */
  price: number
}

/** The bar shape the engine reasons over. Matches `ChartBar` structurally. */
export type BotBar = {
  ts: number
  open: number
  high: number
  low: number
  close: number
}

export type GuardVerdict =
  | { allowed: true }
  | {
      allowed: false
      /** Machine-readable, for the event log and the UI badge. */
      code:
        | 'daily-loss'
        | 'trade-cap'
        | 'position-cap'
        | 'cooldown'
        | 'loss-streak'
      /** Human-readable detail, already interpolated. */
      detail: string
      /** True when the bot should stop rather than skip this one signal. */
      halts: boolean
    }

/** Rolling counters the guards read. Owned by the runtime, updated on fills. */
export type BotGuardState = {
  /** Realized P&L since the start of the current UTC day, quote currency. */
  realizedToday: number
  /** Equity the day's loss cap is measured against. */
  dayStartEquity: number
  /** Entry count in the rolling window. */
  tradesToday: number
  /** Losing trades closed back to back. */
  consecutiveLosses: number
  /** Bar index of the last losing exit, or null. Drives `cooldownBars`. */
  lastLossBarIndex: number | null
}

/** Anything the engine did that a user might later ask "why?" about. */
export type BotEvent = {
  id: string
  botId: string
  ts: number
  level: 'info' | 'warning' | 'error'
  kind:
    | 'started'
    | 'stopped'
    | 'signal'
    | 'order-submitted'
    | 'order-filled'
    | 'order-rejected'
    | 'guard-blocked'
    | 'risk-exit'
    | 'compute-error'
    | 'rearm-required'
  message: string
  /** Free-form detail rendered under the message when present. */
  detail?: string
}
