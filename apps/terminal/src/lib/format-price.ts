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
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`
  if (v >= 1) return v.toFixed(4)
  return v.toPrecision(4)
}
