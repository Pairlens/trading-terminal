// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The honesty rule the calendars share, as a function rather than as a JSX
 * condition: a calendar cell that is empty must render as empty, because a
 * column of invented figures is the pane claiming to know something it does
 * not.
 *
 * It lives here rather than inline so it can be tested without a DOM. The
 * terminal has no component-render harness, and this is the part of the panes
 * worth pinning.
 */
import type { EconomicCalendarEntry } from '@pairlens/shared/instrument-types'

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
