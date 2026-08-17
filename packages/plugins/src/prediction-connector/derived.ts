// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two facts the events projection has to DERIVE rather than copy: how far
 * a probability moved in a day, and what the venue says decides the question.
 *
 * Neither is a unified ccxt field. `parsePredictionTicker` explicitly sets
 * `change` and `percentage` to undefined on both venues even where the raw
 * payload carries the previous price, so the only place the move exists is the
 * market's `info` blob — which is exactly what `toMarketSummary` already has
 * in hand. Deriving it there, once, is what lets a discovery pane rank by "who
 * moved" without a second request per row.
 *
 * Kept pure and venue-agnostic on purpose: the branch is on which FIELD is
 * present, not on which venue is calling, so a third prediction connector that
 * publishes either shape inherits both behaviours.
 */

/**
 * The market's 24h probability move, YES-denominated, in collateral units.
 *
 * Two shapes, checked in order:
 *
 *  - `oneDayPriceChange` — Polymarket states the delta directly on the gamma
 *    market, already signed and already in collateral units.
 *  - `last_price_dollars` − `previous_price_dollars` — Kalshi states the two
 *    endpoints and leaves the subtraction to the reader.
 *
 * The zero guard on the Kalshi branch is not tidiness. A market that has not
 * traded in the window comes back with `previous_price_dollars: "0.0000"`, and
 * subtracting that reports a contract priced at 43¢ as having moved +43 points
 * overnight — which would put every cold market at the top of a movers board,
 * the one place a wrong number is guaranteed to be read.
 */
export function marketChange24h(
  info: Record<string, unknown>,
): number | undefined {
  const direct = num(info['oneDayPriceChange'])
  if (direct !== undefined) return direct

  const last = num(info['last_price_dollars'])
  const previous = num(info['previous_price_dollars'])
  if (last === undefined || previous === undefined) return undefined
  if (last <= 0 || previous <= 0) return undefined
  return last - previous
}

/**
 * Which way the market's move points for one outcome, or 0 for "cannot say".
 *
 * A binary market's two legs sum to one, so the NO leg moved exactly as far in
 * the other direction and the sign flip is arithmetic, not an estimate. Any
 * other shape returns 0: a market with three outcomes has one number and three
 * legs, and splitting it between them would be invention.
 *
 * The label check leads because it is the venue's own word for the side, and
 * position is the fallback for a market whose legs are a candidate pair rather
 * than Yes/No.
 */
export function outcomeChangeSign(
  label: string,
  index: number,
  outcomeCount: number,
): 1 | -1 | 0 {
  if (outcomeCount !== 2) return 0
  const normalized = label.trim().toLowerCase()
  if (normalized === 'yes') return 1
  if (normalized === 'no') return -1
  return index === 0 ? 1 : -1
}

/** The signed move for one outcome, or undefined when it cannot be attributed. */
export function outcomeChange24h(
  change: number | undefined,
  label: string,
  index: number,
  outcomeCount: number,
): number | undefined {
  if (change === undefined || !Number.isFinite(change)) return undefined
  const sign = outcomeChangeSign(label, index, outcomeCount)
  if (sign === 0) return undefined
  // -0 renders as "-0.0" and reads as a downward move that did not happen.
  const signed = change * sign
  return signed === 0 ? 0 : signed
}

/** Longest secondary clause worth appending; beyond it the header truncates. */
const MAX_RULES_CHARS = 4000

/**
 * What the venue says decides the question, verbatim, or '' when it says
 * nothing.
 *
 * Kalshi splits it in two (`rules_primary` is the criterion, `rules_secondary`
 * the exceptions) and both matter, so they are joined rather than picked
 * between. Polymarket keeps the same prose in the market's `description`.
 *
 * Nothing is paraphrased and nothing is summarised: this is the text a dispute
 * is settled against, and a shortened version of it would be worse than no
 * version. The cap only refuses an implausibly long blob outright — one venue
 * pasting a whole contract spec should not sit in every browse result.
 */
export function marketRules(info: Record<string, unknown>): string {
  const primary = str(info['rules_primary'])
  const secondary = str(info['rules_secondary'])
  const text = primary
    ? [primary, secondary].filter(Boolean).join('\n\n')
    : str(info['description'])
  return text.length > MAX_RULES_CHARS ? '' : text
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
