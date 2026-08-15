// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a prediction market is CALLED, when the venue does not say.
 *
 * `market-data:events` falls back to a market's venue id whenever the row
 * carries no question of its own, and Polymarket's id is a 66-character `0x…`
 * condition hash. That string then travels: it becomes the browser card's
 * subtitle, the name pinned into the prediction directory, the watchlist row,
 * and the title of every "no data" empty state. One readability rule, applied
 * where the label is BUILT rather than where it is rendered, keeps all of them
 * saying the same readable thing.
 *
 * The rule is not "hide it". On a categorical event ("who wins?") this label is
 * the only thing separating one row from the next, so an opaque id is shortened
 * and kept where it is load-bearing, and dropped where the event heading
 * already carries the meaning.
 */

/** Longest single unbroken token that could still be a human phrase. */
const MAX_OPAQUE_TOKEN = 24

/** True for a value that is an identifier rather than a question. */
export function isOpaqueTitle(title: string): boolean {
  return title.length > MAX_OPAQUE_TOKEN && !/\s/.test(title)
}

/** `0xd4e77ba6…8527` — enough to tell two rows apart, short enough to sit inline. */
export function shortenId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`
}

/**
 * The line a market shows under its event heading, or null for none.
 *
 * Null when the market repeats the event's own title (a wasted line) or when
 * the event has a single market, in which case the heading already said it.
 */
export function marketSubtitle(
  title: string,
  eventTitle: string,
  marketCount: number,
): string | null {
  if (marketCount <= 1) return null
  if (!title || title === eventTitle) return null
  return isOpaqueTitle(title) ? shortenId(title) : title
}

/**
 * The readable name pinned for one outcome — what the watchlist, the pair
 * switcher, the ticket header and the empty states all end up showing.
 *
 * Question first, event heading second, and the shortened id appended only on
 * a multi-market event, where dropping it would make every outcome of that
 * event read identically.
 */
export function predictionOutcomeName(
  marketTitle: string,
  eventTitle: string,
  outcomeLabel: string,
  marketCount: number,
): string {
  const question = readableQuestion(marketTitle, eventTitle, marketCount)
  return `${question} - ${outcomeLabel}`
}

function readableQuestion(
  marketTitle: string,
  eventTitle: string,
  marketCount: number,
): string {
  if (marketTitle && !isOpaqueTitle(marketTitle)) return marketTitle
  if (!eventTitle) return marketTitle
  return marketCount > 1 && marketTitle
    ? `${eventTitle} (${shortenId(marketTitle)})`
    : eventTitle
}
