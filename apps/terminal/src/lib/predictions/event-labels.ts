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

/**
 * The line a market shows on a bounded card: its short label, else its
 * question, else nothing.
 *
 * The venue's own short label wins because on a categorical event it is the
 * one thing separating siblings and it is two words where the question is a
 * sentence. It is only ever used on a MULTI-market event, though: on an event
 * with one market the heading already named it, and Polymarket's short label
 * there is often a bare date ("October 31, 2025") that reads as a second,
 * unexplained heading. Single-market events keep `marketSubtitle`'s answer,
 * which is null.
 */
export function shortLabelOf(
  market: { title: string; shortTitle?: string },
  eventTitle: string,
  marketCount: number,
): string | null {
  if (marketCount > 1 && market.shortTitle?.trim()) return market.shortTitle
  return marketSubtitle(market.title, eventTitle, marketCount)
}

/**
 * Which side of a binary market an outcome label names, or null.
 *
 * Both venues spell the two sides of a yes/no market 'Yes' and 'No' — Kalshi
 * in its own payload, Polymarket through ccxt's unified outcome — so this is a
 * literal match rather than a guess, and a categorical label ('Newsom',
 * 'Above 13.5M') correctly answers null. Callers paint the two sides with the
 * SAME up/down tokens the rest of the terminal uses for long and short, because
 * that is what taking a side is here.
 *
 * Deliberately not translated: the label comes off the venue's API in English
 * and is what the venue's own UI shows. Matching a localized string would stop
 * matching the moment the interface language changed.
 */
export function binarySideOf(label: string): 'yes' | 'no' | null {
  const normalized = label.trim().toLowerCase()
  if (normalized === 'yes') return 'yes'
  if (normalized === 'no') return 'no'
  return null
}

// ── The ticker slot ──────────────────────────────────────────────────────
//
// Everything above answers "what is this outcome called" for a place with a
// line to spare — a picker row, an empty state, an order ticket header. This
// section answers a harder question: what goes where a TICKER goes.
//
// A ticker slot is four to twelve characters wide by construction. Every
// surface that has one — the recents marquee, the top-bar switcher, the
// watchlist, the chart watermark, the copilot's heading — was built around
// that, so handing it `DEMOCRATIC-PRESIDENTIAL-NOMINEE-2028-GAVIN-NEWSOM-WIN-
// 2028-DEMOCRATIC-PRESIDENTIAL-NOMINATION-568-YES` does not merely look bad:
// the marquee's chips stop fitting and start overlapping, the switcher's
// dropdown rows wrap to five lines each, and the watermark covers the chart.
//
// The answer is a two-part label, not a truncated key. A prediction outcome
// is a subject and a side — "Gavin Newsom" / "Yes" — and both halves are
// short. Rendering is CSS's job from there: the subject gets `truncate` inside
// a `min-w-0` box and the full question rides along as a `title`, so a narrow
// pane elides rather than overflows.

/** A prediction outcome reduced to what fits where a ticker goes. */
export type PredictionTicker = {
  /** The subject: 'Gavin Newsom', 'Above 13.5M', or the question. */
  subject: string
  /** The side taken: 'Yes', 'No', a candidate name. */
  outcome: string
  /** The whole thing, for a tooltip and for accessible names. */
  full: string
}

/**
 * The ticker-slot reading of a pinned outcome.
 *
 * Preference order for the subject is shortest-that-still-distinguishes:
 *
 *  1. `shortTitle` — the venue's own per-market label inside its event. On a
 *     categorical event this is the ONLY thing separating siblings, and it is
 *     two words.
 *  2. The question, minus its event heading. A market titled "Will Bitcoin
 *     close above $120,000 on August 15?" under an event of the same name
 *     would otherwise print the heading twice.
 *  3. The event heading.
 *  4. The pair key, elided in the middle. Reached only by a pin written before
 *     these fields existed, and still better than the raw key.
 *
 * The outcome half is never dropped: on a binary market it is the side, and on
 * a categorical one it is the answer.
 */
export function predictionTicker(
  entry: {
    name: string
    outcome: string
    shortTitle?: string
    eventTitle?: string
  },
  pairKey: string,
): PredictionTicker {
  const question = stripOutcomeSuffix(entry.name, entry.outcome)
  const subject =
    entry.shortTitle?.trim() ||
    strippedQuestion(question, entry.eventTitle) ||
    entry.eventTitle?.trim() ||
    shortenId(pairKey)
  return {
    subject,
    outcome: entry.outcome,
    // The tooltip is the LONG reading on purpose: the label above is lossy by
    // design, and the one place with room to be complete should be.
    full: entry.outcome ? `${question || subject} - ${entry.outcome}` : subject,
  }
}

/** `Will X win? - Yes` → `Will X win?`. */
export function stripOutcomeSuffix(name: string, outcome: string): string {
  const suffix = ` - ${outcome}`
  return outcome && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
}

/**
 * The question with its event heading removed, or '' when nothing readable is
 * left. An opaque question (a bare condition hash) is not a subject.
 */
function strippedQuestion(
  question: string,
  eventTitle: string | undefined,
): string {
  const trimmed = question.trim()
  if (!trimmed || isOpaqueTitle(trimmed)) return ''
  const heading = eventTitle?.trim()
  if (heading && trimmed !== heading && trimmed.startsWith(heading)) {
    const rest = trimmed.slice(heading.length).replace(/^[\s:·-]+/, '')
    if (rest) return rest
  }
  return trimmed
}
