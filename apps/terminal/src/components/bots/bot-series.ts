// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning a bot's trade ledger into the series its charts plot.
 *
 * Pure and separate from the components on purpose: these are the numbers a
 * user will judge a strategy by, so they need to be testable without a DOM.
 *
 * One idea shapes all of it — a round trip is two events, not one. The entry
 * moves money at `entryTs`; the exit moves it back at `exitTs` and only then
 * is there a profit to speak of. Collapsing a trade to a single point would
 * put volume in the wrong place on the time axis and would credit a position
 * still open with a P&L it has not realized.
 */
import type { BotTrade } from '@/stores/bot-runs-store'

/** A cumulative reading of the whole ledger at one moment. */
export type BotSeriesPoint = {
  ts: number
  /** Realized P&L to date, quote currency. Open positions contribute nothing. */
  pnl: number
  /** Quote-currency value transacted to date, both legs of every fill. */
  volume: number
  /** Closed round trips to date. */
  trades: number
}

/** One calendar day's activity, for the per-day bars. */
export type BotDayBucket = {
  /** Start of the day, UTC, in ms. */
  day: number
  trades: number
  volume: number
  pnl: number
}

export type BotTradeSummary = {
  closed: number
  open: number
  wins: number
  losses: number
  /** 0..1 over closed trades; breakevens count in the base, not as wins. */
  winRate: number
  /** Quote currency, both legs. */
  volume: number
  bestPnl: number
  /** Signed, so the worst trade is negative. */
  worstPnl: number
  /** Mean P&L of closed trades, signed. */
  averagePnl: number
}

const DAY_MS = 24 * 60 * 60 * 1000

const finite = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/** Notional of one leg. Guards against a half-written trade record. */
const legValue = (quantity: number, price: number | null): number => {
  const q = finite(quantity)
  const p = finite(price)
  return q > 0 && p > 0 ? q * p : 0
}

type LedgerEvent = {
  ts: number
  volume: number
  pnl: number
  closed: number
}

/**
 * Flatten the ledger into time-ordered money movements.
 *
 * Exported for the day buckets to share, so the two views can never disagree
 * about what happened when.
 */
function ledgerEvents(trades: Array<BotTrade>): Array<LedgerEvent> {
  const events: Array<LedgerEvent> = []
  for (const trade of trades) {
    const entryTs = finite(trade.entryTs)
    if (entryTs > 0) {
      events.push({
        ts: entryTs,
        volume: legValue(trade.quantity, trade.entryPrice),
        pnl: 0,
        closed: 0,
      })
    }
    // An open trade has moved money once and settled nothing. Counting its
    // unrealized mark here would make the P&L line move under a user who has
    // not actually banked anything.
    if (trade.exitTs === null) continue
    events.push({
      ts: finite(trade.exitTs),
      volume: legValue(trade.quantity, trade.exitPrice),
      pnl: finite(trade.pnl),
      closed: 1,
    })
  }
  // The store keeps trades newest-first, and a flip can put an entry and an
  // exit on the same millisecond, so sort rather than assume.
  events.sort((a, b) => a.ts - b.ts)
  return events
}

/**
 * Running totals after every fill, oldest first.
 *
 * Returns an empty array for an empty ledger rather than a zero point: a chart
 * of one flat point at zero reads as "it traded and made nothing", which is a
 * different claim from "it has not traded".
 */
export function buildBotSeries(trades: Array<BotTrade>): Array<BotSeriesPoint> {
  const events = ledgerEvents(trades)
  if (events.length === 0) return []

  const points: Array<BotSeriesPoint> = []
  let pnl = 0
  let volume = 0
  let closed = 0
  for (const event of events) {
    pnl += event.pnl
    volume += event.volume
    closed += event.closed
    const last = points[points.length - 1]
    // Same-millisecond fills collapse into one point; two x-values at the same
    // instant make recharts draw a vertical spike that means nothing.
    if (last && last.ts === event.ts) {
      last.pnl = pnl
      last.volume = volume
      last.trades = closed
      continue
    }
    points.push({ ts: event.ts, pnl, volume, trades: closed })
  }
  return points
}

/**
 * Per-day activity, oldest first, with empty days in between filled in.
 *
 * The gaps matter: a bar chart that silently omits the days a bot did nothing
 * makes a quiet week look like a busy one.
 */
export function bucketBotDays(trades: Array<BotTrade>): Array<BotDayBucket> {
  const events = ledgerEvents(trades)
  if (events.length === 0) return []

  const byDay = new Map<number, BotDayBucket>()
  for (const event of events) {
    const day = Math.floor(event.ts / DAY_MS) * DAY_MS
    const bucket = byDay.get(day)
    if (bucket) {
      bucket.trades += event.closed
      bucket.volume += event.volume
      bucket.pnl += event.pnl
    } else {
      byDay.set(day, {
        day,
        trades: event.closed,
        volume: event.volume,
        pnl: event.pnl,
      })
    }
  }

  const days = Array.from(byDay.keys()).sort((a, b) => a - b)
  const first = days[0]
  const last = days[days.length - 1]
  const out: Array<BotDayBucket> = []
  for (let day = first; day <= last; day += DAY_MS) {
    out.push(byDay.get(day) ?? { day, trades: 0, volume: 0, pnl: 0 })
  }
  return out
}

/** Headline counts for the panel beside the charts. */
export function summarizeBotTrades(trades: Array<BotTrade>): BotTradeSummary {
  let closed = 0
  let open = 0
  let wins = 0
  let losses = 0
  let volume = 0
  let total = 0
  let bestPnl = 0
  let worstPnl = 0

  for (const trade of trades) {
    volume += legValue(trade.quantity, trade.entryPrice)
    if (trade.exitTs === null) {
      open += 1
      continue
    }
    volume += legValue(trade.quantity, trade.exitPrice)
    closed += 1
    const pnl = finite(trade.pnl)
    total += pnl
    if (pnl > 0) wins += 1
    else if (pnl < 0) losses += 1
    if (pnl > bestPnl) bestPnl = pnl
    if (pnl < worstPnl) worstPnl = pnl
  }

  return {
    closed,
    open,
    wins,
    losses,
    winRate: closed > 0 ? wins / closed : 0,
    volume,
    bestPnl,
    worstPnl,
    averagePnl: closed > 0 ? total / closed : 0,
  }
}
