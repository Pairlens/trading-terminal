// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two honesty rules the calendars share, as functions rather than as JSX
 * conditions.
 *
 * Both are about the same thing: a calendar cell that is empty must render as
 * empty. A figure column full of dashes and a badge reading "unknown" are both
 * the pane claiming to know something it does not, and the second one is worse,
 * because the report slot is the single detail a trader positions on.
 *
 * They live here rather than inline so they can be tested without a DOM. The
 * terminal has no component-render harness, and these are the parts of the
 * panes worth pinning.
 */
import type {
  EarningsCalendarEntry,
  EconomicCalendarEntry,
} from '@pairlens/shared/instrument-types'

/**
 * Whether a window carries any figure at all, which is what decides if the
 * actual, prior and implied columns exist.
 *
 * Filling these columns is a server capability: it needs the enrichment the App
 * Server runs, and a self-hosted deployment can have none of it. When nothing
 * can be filled, the pane shows the schedule alone. That is not a degraded
 * state, it is the product this pane shipped as.
 */
export function hasEconomicFigures(
  entries: ReadonlyArray<EconomicCalendarEntry>,
): boolean {
  return entries.some(
    (entry) =>
      Boolean(entry.actual) || Boolean(entry.prior) || Boolean(entry.implied),
  )
}

export type ReportTimeBadge = {
  /** Translation key for the badge text a desk reads: BMO, AMC. */
  shortKey: string
  /** Translation key for the full sentence, used as tooltip and for readers. */
  labelKey: string
}

/**
 * The badge for a report slot, or null when no source stated one.
 *
 * Null is the answer for most of the calendar past thirty days and for every
 * foreign private issuer, because neither the provider nor a company's filing
 * history commits to a slot there. Rendering nothing is the point.
 */
export function reportTimeBadge(
  reportTime: EarningsCalendarEntry['reportTime'],
): ReportTimeBadge | null {
  if (reportTime !== 'bmo' && reportTime !== 'amc') return null
  return {
    shortKey: `earningsCalendar.reportTime.${reportTime}`,
    labelKey: `earningsCalendar.reportTime.${reportTime}Label`,
  }
}
