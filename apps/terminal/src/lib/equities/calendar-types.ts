// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The seam the earnings and macro calendars are waiting on.
 *
 * No bundled connector serves either feed today: Alpaca is a broker, and a
 * broker publishes the schedule its own venue keeps (the clock and the trading
 * calendar, which `market-data:session` does carry) rather than who reports on
 * Thursday or what CPI printed. Both panes therefore ship as the real frame
 * with an honest empty state, and these are the shapes a fundamentals or macro
 * provider plugin fills.
 *
 * Written as data a PROVIDER can produce, not as what the prototype drew:
 * every field a US-centric mockup implies (consensus in dollars, an implied
 * move in percent) is optional, because a provider covering European listings
 * or a free tier will have some of them and not others. A pane renders what
 * arrived and omits the rest — it never prints a dash grid.
 */

/** Where in the session a company reports. */
export type EarningsSlot = 'before-open' | 'after-close' | 'unspecified'

export type EarningsEvent = {
  /** Bare ticker, matching the equity instrument's symbol ('NVDA'). */
  symbol: string
  /** Company name, when the provider carries one. */
  name?: string
  /** Report date in the exchange's own timezone, ISO 'YYYY-MM-DD'. */
  date: string
  slot: EarningsSlot
  /** Scheduled report time, epoch ms, when the provider is that precise. */
  scheduledMs?: number
  /** Fiscal period being reported, e.g. 'Q2 FY26'. */
  period?: string
  /** Consensus estimates, in the instrument's quote currency. */
  epsEstimate?: number
  revenueEstimate?: number
  /** Reported figures, once the print lands. */
  epsActual?: number
  revenueActual?: number
  /**
   * Move the options market prices for the print, as a fraction (0.084 =
   * ±8.4%). Absent unless the provider serves an options surface.
   */
  impliedMove?: number
  /** Price reaction since the print, as a fraction. Absent before it. */
  reaction?: number
}

/** How much a macro release is expected to move markets. */
export type EconEventImportance = 'high' | 'medium' | 'low'

export type EconCalendarEvent = {
  /** Provider-stable id, so a row can update in place as the print lands. */
  id: string
  title: string
  /** Release time, epoch ms — the wire never carries a bare wall clock. */
  releaseMs: number
  importance: EconEventImportance
  /** ISO 3166-1 alpha-2 country the release belongs to. */
  country?: string
  /**
   * Values as the provider states them, units included ('0.2%', '228k'):
   * a macro series is not one number type, and reformatting a percentage as
   * a count is how a calendar starts lying.
   */
  actual?: string
  consensus?: string
  prior?: string
}

/** What a provider hands a calendar pane for one window. */
export type EarningsCalendarPage = {
  events: Array<EarningsEvent>
  /** Window covered, ISO dates in exchange time. */
  start: string
  end: string
}

export type EconCalendarPage = {
  events: Array<EconCalendarEvent>
  start: string
  end: string
}
