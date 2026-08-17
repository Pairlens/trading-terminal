// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The seam the macro calendar is still waiting on.
 *
 * The earnings half of this file is gone: the App Server serves the reporting
 * schedule now (`/api/earnings-calendar`, wire types
 * `EarningsCalendarEntry` / `EarningsCalendarResponse` in
 * `@pairlens/shared/instrument-types`), so the pane reads a real feed rather
 * than a shape nobody fills.
 *
 * Macro stays a seam on purpose. The fundamentals provider publishes company
 * filings and earnings dates, not a forward macro calendar with consensus, and
 * no bundled connector does either: a broker publishes the schedule its own
 * venue keeps (the clock and the trading calendar, which `market-data:session`
 * carries) rather than what CPI printed. So the economic-calendar pane ships as
 * the real frame with an honest empty state, and this is the shape a macro
 * provider plugin fills.
 *
 * Written as data a PROVIDER can produce, not as what the prototype drew:
 * everything a US-centric mockup implies is optional, because a provider
 * covering European releases or a free tier will have some fields and not
 * others. A pane renders what arrived and omits the rest; it never prints a
 * dash grid.
 */

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

/** What a provider hands the calendar pane for one window. */
export type EconCalendarPage = {
  events: Array<EconCalendarEvent>
  /** Window covered, ISO dates in exchange time. */
  start: string
  end: string
}
