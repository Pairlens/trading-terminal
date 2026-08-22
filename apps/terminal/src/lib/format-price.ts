// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Smart crypto price formatting with subscript-zero notation for micro-prices.
 *
 * - >= 1000:  "$1,234.56"       (2 decimals)
 * - >= 1:     "$1.2345"         (4 decimals)
 * - >= 0.01:  "$0.012345"       (6 decimals)
 * - < 0.01:   "$0.0{5}1234"     (subscript zeros + 4 sig digits)
 *
 * The subscript notation matches CoinGecko/DEXScreener style:
 * $0.00000123 → "$0.0₅123" meaning 5 zeros then significant digits.
 */

const SUBSCRIPT_DIGITS = [
  '\u2080',
  '\u2081',
  '\u2082',
  '\u2083',
  '\u2084',
  '\u2085',
  '\u2086',
  '\u2087',
  '\u2088',
  '\u2089',
]

function toSubscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join('')
}

const highFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format a price for display in the terminal UI.
 * Returns a plain string for most prices, or a string with Unicode subscript
 * digits for micro-prices (< $0.01).
 */
export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '$0.00'
  if (price >= 1000) return highFormatter.format(price)
  if (price >= 1) return `$${price.toFixed(4)}`
  if (price >= 0.01) {
    // Show up to 6 decimals but trim trailing zeros (keep at least 2)
    const fixed = price.toFixed(6)
    const trimmed = fixed.replace(/0+$/, '')
    const decLen = (trimmed.split('.')[1] ?? '').length
    return `$${decLen < 2 ? price.toFixed(2) : trimmed}`
  }

  // Micro-price: count leading zeros after "0." and use subscript notation
  // e.g. 0.00000123 → zeroCount=5, significant="1234"
  const zeroCount = Math.floor(-Math.log10(price)) // number of leading zeros after "0."

  // Extract 4 significant digits from the mantissa (works at any magnitude)
  const raw = price.toPrecision(4) // e.g. "1.234e-8" or "0.0001234"
  const mantissa = raw.split('e')[0] // strip exponent if present
  const sigDigits = mantissa.replace(/^0\.0*/, '').replace('.', '') // just digits

  if (zeroCount < 3) {
    // Not enough zeros to warrant subscript — just show decimals
    const decimals = Math.min(20, zeroCount + 4)
    return `$${price.toFixed(decimals)}`
  }

  return `$0.0${toSubscript(zeroCount)}${sigDigits}`
}

/**
 * The same price, denominated in a token rather than in dollars.
 *
 * For a pool quoted in something that is not a dollar: a Solana map is mostly
 * SOL-quoted pairs, and "1 NVDA = 0.0₆2873 SOL" is the number that chain
 * actually trades in. It is `formatPrice` without the currency, and it matters
 * that it is not `formatAmount`, which falls back to `toPrecision` and renders
 * a micro-price as `2.873e-7`.
 */
export function formatTokenPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '0'
  // The dollar sign is the only difference, and stripping it keeps the two
  // functions from drifting apart over the four branches above.
  return formatPrice(price).replace('$', '')
}

/**
 * Format a price for the chart Y-axis / crosshair (no $ prefix, more decimals).
 */
export function formatChartPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2)
  if (price >= 1) return price.toFixed(4)
  if (price >= 0.01) return price.toFixed(6)
  return price.toFixed(8)
}

/**
 * Format a price for the order book (compact, no $ prefix).
 */
export function formatBookPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  if (price >= 1) return price.toFixed(4)
  if (price >= 0.01) return price.toFixed(6)
  return price.toFixed(8)
}

// ── Prediction markets ───────────────────────────────────────────────
//
// A prediction outcome's price is a probability in collateral units: 0.53
// means "53% and one contract pays $1". Every venue in the category quotes it
// in cents, and so does every trader talking about one, so the terminal does
// too — a book column reading "0.5300" is arithmetically identical and
// unreadable next to a Kalshi screen.
//
// Callers decide which family to use; nothing here sniffs the instrument. The
// signal is the active pair being a prediction outcome (`usePredictionPair`),
// which the caller already knows.

/** Cent granularity below which a venue's tick is a fraction of a cent. */
const SUB_CENT_THRESHOLD = 10

function centsOf(price: number): number {
  return price * 100
}

/**
 * A probability price as cents: `53¢`, `4.5¢`, `0.5¢`.
 *
 * One decimal below 10¢ and whenever the value is not a whole cent — Kalshi
 * ticks at 1¢ but Polymarket quotes tenths, and rounding 0.5¢ to "1¢" doubles
 * the price of the cheapest contracts on the board.
 */
export function formatPredictionPrice(price: number): string {
  if (!Number.isFinite(price)) return '—'
  const cents = centsOf(price)
  if (cents === 0) return '0¢'
  const abs = Math.abs(cents)
  if (abs < SUB_CENT_THRESHOLD || Math.abs(cents - Math.round(cents)) > 1e-9) {
    // toFixed(1) rather than a variable precision: a column of prices that
    // disagree about their decimal count does not align, and the axis labels
    // below share this formatter.
    return `${cents.toFixed(1)}¢`
  }
  return `${Math.round(cents)}¢`
}

/**
 * The same value for the chart's price axis and crosshair.
 *
 * It keeps the `¢`, unlike `formatChartPrice`, which drops the `$`: the unit
 * IS the reading here. A prediction axis spans 0–100¢, so the longest label is
 * four characters ("100¢") — comfortably inside the gutter the desktop pane
 * (74px default) and the mobile chart (56px, ~5 digits) reserve.
 */
export function formatPredictionChartPrice(price: number): string {
  return formatPredictionPrice(price)
}

/** Book/depth/trades columns — same reading, no separate rounding rule. */
export function formatPredictionBookPrice(price: number): string {
  return formatPredictionPrice(price)
}

/**
 * A large USD figure at a glance: `$1.3B`, `$62.9M`, `$4.5K`.
 *
 * One shared `Intl.NumberFormat` because constructing one is the expensive
 * part and three panes were each building their own identical instance —
 * market caps in the heatmap and the top-coins table, event volume in the
 * prediction browser. Pinned to `en-US` like the two it replaces: these are
 * abbreviations, and a locale-following one would render a "B" the reader's
 * own number formatting does not otherwise use.
 */
const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCompactUsd(value: number): string {
  return Number.isFinite(value) ? compactUsdFormatter.format(value) : '—'
}

/**
 * Format a portfolio value with compact K/M notation and a currency symbol
 * prefix (e.g. "$1.23M", "€4.56K"). Used by the accounts page and the
 * portfolio pane.
 */
export function formatValue(symbol: string, v: number): string {
  if (v >= 1_000_000) return `${symbol}${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${symbol}${(v / 1_000).toFixed(2)}K`
  return `${symbol}${v.toFixed(2)}`
}

/**
 * Format an asset amount with compact K/M notation (no currency symbol).
 */
export function formatAmount(v: number): string {
  // Billions and trillions are not an edge case here: a memecoin supply runs to
  // ten figures routinely, and without these two branches a pool reserve read
  // "6843.77M", which is a number nobody can size at a glance.
  if (v >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(2)}T`
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`
  if (v >= 1) return v.toFixed(4)
  return v.toPrecision(4)
}
