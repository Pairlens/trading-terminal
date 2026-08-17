// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Money and share counts, for figures that can be negative.
 *
 * `formatPrice` is the terminal's price formatter and it clamps anything at or
 * below zero to '$0.00' — correct for a price, which cannot be negative, and
 * silently wrong for a PnL, which is the number a position pane leads with. A
 * position down $638 rendering as $0.00 is not a formatting nit: it is a
 * losing trade displayed as flat.
 *
 * Two decimals rather than the price formatter's four, because these are
 * amounts of money and not quotes: '+$3,722.40' is a PnL, '+$3,722.4000' is a
 * spreadsheet. Prices keep using `formatPrice`.
 *
 * USD is hardcoded, which is honest for now: every venue this module serves is
 * a US broker settling in dollars. A second one settling elsewhere makes the
 * currency a parameter, not a guess.
 */

const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** '$26,642.00' — an amount, not a quote. */
export function formatMoney(value: number): string {
  return Number.isFinite(value) ? MONEY.format(value) : MONEY.format(0)
}

/** '+$3,722.40' / '-$638.00' / '$0.00'. */
export function formatSignedMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return MONEY.format(0)
  const magnitude = MONEY.format(Math.abs(value))
  return value > 0 ? `+${magnitude}` : `-${magnitude}`
}

/**
 * A share count: whole where it is whole, up to four decimals where it is not.
 *
 * Fractional shares are real at a US broker (a $100 order on a $600 stock),
 * so the count cannot simply be rounded — but '220.0000 shares' is a quantity
 * pretending to be a price.
 */
export function formatShares(count: number): string {
  if (!Number.isFinite(count)) return '0'
  if (Number.isInteger(count)) return count.toLocaleString('en-US')
  return String(Number(count.toFixed(4)))
}
