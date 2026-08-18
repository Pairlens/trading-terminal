// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which period a company is about to report, in the width of a subtitle.
 *
 * The design asks for 'NVIDIA · Q2 FY26' and we cannot write that sentence,
 * which is worth explaining because the reason looks like a missing feature and
 * is not. A calendar entry carries ONE date about the period: the day the
 * fiscal quarter ended. Turning that into a fiscal-quarter NUMBER needs the
 * company's fiscal year end, which no calendar row publishes, and guessing it
 * from the calendar quarter is wrong for exactly the names people watch:
 * NVIDIA's fiscal year ends in January, so its Q2 closes in July, and a label
 * derived from the calendar would tell a reader "Q3" about a print the company,
 * the filing and every headline call Q2. Walmart, Deere, Oracle, Adobe,
 * Broadcom and Costco all break the same way.
 *
 * So the label names the period end instead, which is the fact we hold: 'Jul
 * 2026', rendered by the row as 'quarter to Jul 2026'. It is four characters
 * longer than the design's token and it is never wrong about whose quarter it
 * is.
 *
 * The month is formatted in UTC for the same reason the day headings are: this
 * is a calendar date rather than an instant, and rendering midnight UTC in a
 * zone west of it prints the month before on every first-of-the-month period
 * end.
 */

/**
 * 'Jul 2026' for a fiscal period ending 2026-07-31, or null when the entry has
 * no period end at all — which is most of a calendar past the next few weeks.
 */
export function quarterLabel(
  fiscalDateEnding: string | null | undefined,
  locale: string,
): string | null {
  if (!fiscalDateEnding) return null
  const at = Date.parse(`${fiscalDateEnding}T00:00:00Z`)
  if (!Number.isFinite(at)) return null
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  }).format(new Date(at))
}
