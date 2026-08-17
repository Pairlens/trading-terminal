// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The price range on an IPO row, which is absent more often than it is present.
 *
 * A forward calendar is mostly deals that have filed but not priced, and the
 * provider writes nothing for those. The one thing this must never do is render
 * them as a number: a $0.00 range on a row a reader is scanning for a price is
 * worse than an empty cell, because it looks like an answer.
 *
 * The kinds exist so the pane can pick a sentence rather than string-match on a
 * formatted value, and so the separator between two prices stays translatable.
 */
import { formatMoneyPrecise } from './company-format'

export type IpoPriceRange =
  | { kind: 'range'; low: string; high: string }
  | { kind: 'single'; value: string }
  /** Filed but not priced, which is most of the pipeline. */
  | { kind: 'unknown' }

export function formatIpoPriceRange(
  low: number | null,
  high: number | null,
  currency: string | null,
): IpoPriceRange {
  const lowText = formatMoneyPrecise(low, currency)
  const highText = formatMoneyPrecise(high, currency)

  if (lowText === null && highText === null) return { kind: 'unknown' }
  if (lowText === null) return { kind: 'single', value: highText! }
  if (highText === null) return { kind: 'single', value: lowText }
  // A range of one price is a price, not a range.
  if (lowText === highText) return { kind: 'single', value: lowText }
  // Defensive: the columns have been published the wrong way round, and
  // '$22.00 to $19.00' reads as a bug in Pairlens rather than in the feed.
  if (low !== null && high !== null && low > high) {
    return { kind: 'range', low: highText, high: lowText }
  }
  return { kind: 'range', low: lowText, high: highText }
}
