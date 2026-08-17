// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the trading day is, given the broker's clock and calendar.
 *
 * The invariant a user notices when this breaks: on Christmas Eve the bell
 * rings at 13:00 and on Thanksgiving it does not ring at all, so a session
 * strip that counts down to 16:00 is wrong on exactly the days a stock trader
 * is paying attention. Every boundary here comes from a calendar entry the
 * venue published; nothing in this module knows what 09:30 means.
 *
 * Pure arithmetic over epoch milliseconds, and deliberately so: it never
 * constructs a Date, never reads a host clock and never names a timezone, so
 * a laptop in Tokyo with a skewed clock resolves the same phase as one in New
 * York. The instants were converted once, in the connector, where the venue's
 * timezone is known.
 */
import type {
  MarketSessionClock,
  MarketSessionDay,
} from '@pairlens/shared/instrument-types'

/**
 * `pre` and `post` are the extended sessions the venue publishes bounds for;
 * `closed` is everything else, including a holiday and the overnight gap.
 */
export type SessionPhase = 'pre' | 'rth' | 'post' | 'closed'

/** Which instant the countdown is running towards. */
export type SessionBoundary = 'preOpen' | 'open' | 'close' | 'postClose'

export type SessionState = {
  phase: SessionPhase
  /** The session `nowMs` sits inside, extended hours included. */
  day: MarketSessionDay | null
  /** The next scheduled session, when one is known and not already running. */
  nextDay: MarketSessionDay | null
  nextBoundary: SessionBoundary | null
  nextBoundaryMs: number | null
  /**
   * What the answer rests on. `clock` means the calendar never arrived and the
   * phase is the venue's open/closed bit alone — true, but with no windows to
   * draw and no pre/post distinction, which the panes say out loud rather than
   * drawing an empty bar.
   */
  source: 'calendar' | 'clock' | 'none'
}

/** First instant of the day's extended session, or of the auction if none. */
export function dayStartMs(day: MarketSessionDay): number {
  return day.preOpenMs ?? day.openMs
}

/** Last instant of the day's extended session, or of the auction if none. */
export function dayEndMs(day: MarketSessionDay): number {
  return day.postCloseMs ?? day.closeMs
}

/**
 * Classify `nowMs` against the venue's own schedule.
 *
 * `days` is trading days only — a holiday is an absent entry, which is what
 * makes "no day contains now" the correct definition of closed.
 */
export function resolveSessionState({
  nowMs,
  clock,
  days,
}: {
  nowMs: number
  clock: MarketSessionClock | null
  days: Array<MarketSessionDay>
}): SessionState {
  const sorted = [...days].sort((a, b) => a.openMs - b.openMs)
  const current =
    sorted.find((d) => nowMs >= dayStartMs(d) && nowMs < dayEndMs(d)) ?? null
  const nextDay = sorted.find((d) => dayStartMs(d) > nowMs) ?? null

  if (current) {
    if (nowMs < current.openMs) {
      return {
        phase: 'pre',
        day: current,
        nextDay,
        nextBoundary: 'open',
        nextBoundaryMs: current.openMs,
        source: 'calendar',
      }
    }
    if (nowMs < current.closeMs) {
      return {
        phase: 'rth',
        day: current,
        nextDay,
        nextBoundary: 'close',
        nextBoundaryMs: current.closeMs,
        source: 'calendar',
      }
    }
    return {
      phase: 'post',
      day: current,
      nextDay,
      nextBoundary: 'postClose',
      nextBoundaryMs: dayEndMs(current),
      source: 'calendar',
    }
  }

  if (sorted.length > 0) {
    // Closed, and the calendar knows when that ends. The countdown runs to the
    // first tradable instant rather than to the auction: a trader who can work
    // an order at 04:00 is not "waiting for 09:30".
    const boundaryMs = nextDay ? dayStartMs(nextDay) : null
    return {
      phase: 'closed',
      day: null,
      nextDay,
      nextBoundary:
        nextDay && nextDay.preOpenMs !== undefined ? 'preOpen' : 'open',
      nextBoundaryMs: boundaryMs,
      source: 'calendar',
    }
  }

  // Calendar unavailable. The clock alone still answers open or closed, and
  // saying so beats a spinner that never resolves.
  if (clock) {
    return clock.isOpen
      ? {
          phase: 'rth',
          day: null,
          nextDay: null,
          nextBoundary: clock.nextCloseMs === null ? null : 'close',
          nextBoundaryMs: clock.nextCloseMs,
          source: 'clock',
        }
      : {
          phase: 'closed',
          day: null,
          nextDay: null,
          nextBoundary: clock.nextOpenMs === null ? null : 'open',
          nextBoundaryMs: clock.nextOpenMs,
          source: 'clock',
        }
  }

  return {
    phase: 'closed',
    day: null,
    nextDay: null,
    nextBoundary: null,
    nextBoundaryMs: null,
    source: 'none',
  }
}

// ── The day bar ───────────────────────────────────────────────────────

export type DayBarSegments = {
  /** Fractions of the bar's full width, summing to 1. */
  pre: number
  rth: number
  post: number
  /** Where "now" sits, 0..1, or null when it is outside the day entirely. */
  nowFraction: number | null
}

/**
 * Proportions for the pre / regular / post strip, measured on the real
 * schedule rather than on a fixed 04:00-to-20:00 template.
 *
 * A half day therefore renders as a visibly shorter green band with a long
 * after-hours tail, which is the point of drawing the bar at all.
 */
export function dayBarSegments(
  day: MarketSessionDay,
  nowMs: number,
): DayBarSegments {
  const start = dayStartMs(day)
  const end = dayEndMs(day)
  const span = end - start
  if (span <= 0) return { pre: 0, rth: 1, post: 0, nowFraction: null }

  const pre = (day.openMs - start) / span
  const rth = (day.closeMs - day.openMs) / span
  const post = (end - day.closeMs) / span
  const nowFraction =
    nowMs >= start && nowMs <= end ? (nowMs - start) / span : null

  return { pre, rth, post, nowFraction }
}

// ── Countdown ─────────────────────────────────────────────────────────

export type Countdown = {
  hours: number
  minutes: number
  seconds: number
  /** Total whole days, for a gap that spans a weekend or a holiday week. */
  days: number
}

/**
 * Split a remaining duration into display parts, floored and clamped at zero.
 *
 * Floored rather than rounded: "closes in 1m" must not appear with 90 seconds
 * left, and a countdown that reads 0 is a boundary that has passed.
 */
export function splitCountdown(ms: number): Countdown {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  }
}

// ── Day range from the candle buffer ──────────────────────────────────

export type DayRange = { low: number; high: number } | null

/**
 * High and low since this session's first tradable instant, from candles the
 * chart already streams.
 *
 * Session-anchored, not "the last 24 hours": a stock's range is a statement
 * about today's tape, and 24 hours of a thin overnight would widen it with
 * prints from yesterday's session. Bars are included whole when they OPEN
 * inside the window — a bar that straddles the pre-market open belongs to the
 * day it started in, and splitting it is not possible from OHLC anyway.
 *
 * Returns null when the loaded timeframe cannot answer the question (a weekly
 * bar covers five sessions), rather than reporting a range that spans days.
 */
export function sessionRange(
  candles: Array<{ ts: number; high: number; low: number }>,
  windowStartMs: number,
  windowEndMs: number,
  timeframeMs: number,
): DayRange {
  if (timeframeMs > 86_400_000) return null

  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const candle of candles) {
    if (candle.ts < windowStartMs || candle.ts > windowEndMs) continue
    if (candle.low < low) low = candle.low
    if (candle.high > high) high = candle.high
  }

  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null
}
