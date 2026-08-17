// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Instants rendered in EXCHANGE time, never in the reader's.
 *
 * A session strip that labels the open '15:30' because the reader is in Berlin
 * is telling the truth about the wrong clock: the bell is at 09:30 in New York
 * and every trader, headline and filing says so. The zone comes from the venue
 * with the schedule, so a second broker in another zone labels its own hours
 * correctly without a change here.
 *
 * Split from `session.ts` on purpose: that module is pure arithmetic with no
 * Date in it, and formatting needs both a Date and the host's ICU tables.
 */

/** '09:30' in the venue's own timezone. */
export function formatExchangeTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}

/** 'Mon 17 Aug', in the venue's timezone and the reader's language. */
export function formatExchangeDay(
  ms: number,
  timeZone: string,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(ms))
}

/** The venue's timezone abbreviation for the instant, e.g. 'EDT'. */
export function exchangeZoneLabel(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(new Date(ms))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}
