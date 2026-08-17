// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fundamentals as a trader reads them.
 *
 * Every function here takes `number | null` and returns `string | null`,
 * because the pane's house rule is that an absent figure removes its cell
 * rather than printing a dash. Formatting and collapsing are therefore the
 * same decision, and it lives here instead of in eight ternaries in the pane.
 *
 * Scale is the trap this module exists for. The wire carries ratios as
 * fractions, so a 0.0003 dividend yield and a 0.559 profit margin are the same
 * kind of number three orders of magnitude apart: a fixed one-decimal percent
 * prints the first as '0.0%', which reads as "pays nothing" for a company that
 * pays. Precision follows magnitude instead.
 */
import type { CompanyAnalystRatings } from '@pairlens/shared/instrument-types'

/**
 * Abbreviations, so a market cap fits a cell. Pinned to `en-US` like
 * `formatCompactUsd`, for the same reason: these are abbreviations, and a
 * locale-following one renders a 'B' the reader's own numbers never use.
 *
 * Three significant digits rather than one fraction digit, which is what the
 * existing formatter does and what turns a $2.98T cap into '$3T'. A trillion of
 * rounding is not a rounding.
 */
const COMPACT = {
  notation: 'compact',
  maximumSignificantDigits: 3,
} as const

const compactDecimal = new Intl.NumberFormat('en-US', COMPACT)

const currencyFormatters = new Map<string, Intl.NumberFormat>()

function compactCurrencyFormatter(currency: string): Intl.NumberFormat | null {
  const cached = currencyFormatters.get(currency)
  if (cached) return cached
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      ...COMPACT,
    })
    currencyFormatters.set(currency, formatter)
    return formatter
  } catch {
    // Intl throws on a code that is not three letters. A provider shipping one
    // should not take the market cap down with it.
    return null
  }
}

/**
 * '$2.98T', '¥1.2B', or '1.2B US' when the code is not one Intl will accept.
 * An unknown but well-formed code is Intl's own business: it prints the code
 * beside the number ('XYZ 1.2B'), which is the right answer anyway.
 */
export function formatCompactMoney(
  value: number | null,
  currency?: string | null,
): string | null {
  if (value === null || !Number.isFinite(value)) return null
  const code = currency?.trim().toUpperCase()
  if (code) {
    const formatter = compactCurrencyFormatter(code)
    if (formatter) return formatter.format(value)
    return `${compactDecimal.format(value)} ${code}`
  }
  return compactDecimal.format(value)
}

/** A share or contract count: '24.4B', '312.5M'. */
export function formatCompactCount(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  return compactDecimal.format(value)
}

/**
 * A multiple: '42.1', '0.78', '-13.4'.
 *
 * Two decimals under ten because a PEG of 0.78 and one of 0.71 are a different
 * read, one above it because nobody compares P/E to a hundredth. A negative
 * multiple is kept: a loss-making company genuinely has one.
 */
export function formatRatio(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1)
}

/** An amount of money at full precision: '$2.88', '$149.62'. */
export function formatMoneyPrecise(
  value: number | null,
  currency?: string | null,
): string | null {
  if (value === null || !Number.isFinite(value)) return null
  const code = currency?.trim().toUpperCase()
  if (code) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    } catch {
      return `${value.toFixed(2)} ${code}`
    }
  }
  return value.toFixed(2)
}

/** A fraction as a percentage: 0.559 becomes '55.9%', 0.0003 becomes '0.03%'. */
export function formatPercentFraction(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  const pct = value * 100
  const digits = Math.abs(pct) < 1 ? 2 : 1
  return `${pct.toFixed(digits)}%`
}

/** The same, with the sign a growth figure needs: '+122.2%', '-8.4%'. */
export function formatSignedPercentFraction(
  value: number | null,
): string | null {
  const formatted = formatPercentFraction(value)
  if (formatted === null) return null
  return value! > 0 ? `+${formatted}` : formatted
}

/**
 * A provider label in sentence case: 'TECHNOLOGY' becomes 'Technology'.
 *
 * The wire keeps what the provider said, which is shouting, and shouting in a
 * pane header reads as an error state. Input that already carries a lowercase
 * letter is left exactly as it is, because that means someone cased it on
 * purpose and 'NVIDIA' must not become 'Nvidia'.
 */
export function formatSectorLabel(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/[a-z]/.test(trimmed)) return trimmed
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s(/&-])([a-z])/g, (_, prefix: string, letter: string) => {
      return `${prefix}${letter.toUpperCase()}`
    })
}

export type AnalystConsensus = {
  /** Strong buy and buy, together: the reading a row shows. */
  buy: number
  hold: number
  /** Sell and strong sell, together. */
  sell: number
  total: number
}

/**
 * Analyst opinion as three buckets, or null when nobody covers the name.
 *
 * Absent buckets count as nothing rather than zero, and a name where every
 * bucket is absent returns null instead of a bar with no segments: no coverage
 * and unanimous indifference are not the same fact.
 */
export function summarizeAnalystRatings(
  ratings: CompanyAnalystRatings | null,
): AnalystConsensus | null {
  if (!ratings) return null
  const n = (value: number | null) =>
    value !== null && Number.isFinite(value) && value > 0 ? value : 0
  const buy = n(ratings.strongBuy) + n(ratings.buy)
  const hold = n(ratings.hold)
  const sell = n(ratings.sell) + n(ratings.strongSell)
  const total = buy + hold + sell
  return total > 0 ? { buy, hold, sell, total } : null
}

/**
 * Whole days from today to an ISO calendar date. Negative once it is past.
 *
 * Compared as UTC calendar dates, which is what the report date is: a date with
 * no time. Subtracting instants instead would make a report "in 0 days" flip to
 * "1" at some hour of the afternoon depending on the reader's timezone.
 */
export function daysUntilDate(isoDate: string, nowMs = Date.now()): number {
  const target = Date.parse(`${isoDate}T00:00:00Z`)
  if (!Number.isFinite(target)) return Number.NaN
  const today = Date.parse(
    `${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`,
  )
  return Math.round((target - today) / 86_400_000)
}

/** The board's own way of stacking two related figures: '42.1 · 31.6'. */
export function joinValues(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => v !== null && v !== '')
  return present.length > 0 ? present.join(' · ') : null
}
