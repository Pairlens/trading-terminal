// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a probability chart labels its time axis, on both shells.
 *
 * Split out of the desktop pane the moment the phone grew the same chart: the
 * two surfaces lay the chart out completely differently — one has a legend
 * across the top and a footer of span pills, the other stacks them — but a
 * date is a date, and a phone that formatted its axis differently from the
 * laptop would be the one place in the product where the same contract reads
 * as two.
 *
 * The rule both share: the format keys on the SPAN the chart is covering, not
 * on the size of its buckets. A week drawn from hourly candles is seven
 * repetitions of the same twenty-four clock labels, and a column of bare times
 * over seven days says nothing about which day anything happened on.
 */
const HOUR = 3_600_000
export const DAY = 24 * HOUR

/** Past this, ticks are dates rather than times. */
const DATE_LABEL_SPAN_MS = 1.5 * DAY

/** Past this the crosshair drops the hour: daily buckets are all midnight. */
const DATE_ONLY_SPAN_MS = 20 * DAY

/** True when the axis should be labelled in calendar days. */
export function isDateSpan(spanMs: number): boolean {
  return spanMs > DATE_LABEL_SPAN_MS
}

/** Clock inside a day and a half, calendar dates beyond it. */
export function formatAxisTime(ts: number, spanMs: number): string {
  const date = new Date(ts)
  if (!Number.isFinite(date.getTime())) return ''
  if (isDateSpan(spanMs)) {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** The crosshair always carries the date; a tick that repeats cannot. */
export function formatTooltipTime(ts: number, spanMs: number): string {
  const date = new Date(ts)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(spanMs > DATE_ONLY_SPAN_MS
      ? {}
      : { hour: 'numeric' as const, minute: '2-digit' as const }),
  })
}

/** The span the rows actually cover, in ms. Zero for fewer than two rows. */
export function spanOf(rows: ReadonlyArray<{ ts: number }>): number {
  const first = rows[0]?.ts
  const last = rows[rows.length - 1]?.ts
  if (typeof first !== 'number' || typeof last !== 'number') return 0
  return last - first
}
