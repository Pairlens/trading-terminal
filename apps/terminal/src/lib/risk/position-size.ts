// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Per-order position-size limit.
//
// `maxPositionSize` is configured as a PERCENT of total portfolio value
// ("max size for a single position as a percentage of portfolio"). Enforcing
// it needs the order's notional and the portfolio value in the same unit (USD).
// Portfolio value comes from usePortfolioValue (prices every held asset via WS
// tickers, stablecoins = $1). The ratio is currency-invariant, so we compute it
// in USD regardless of the user's display currency.

export const USD_PEGGED = new Set([
  'USDT',
  'USDC',
  'USD',
  'DAI',
  'BUSD',
  'TUSD',
  'USDD',
  'USDP',
  'FDUSD',
  'PYUSD',
])

/** USD price for a currency: 1 for USD-pegged stablecoins, else from the map. */
export function priceUsdFor(
  currency: string,
  priceUsd: Map<string, number>,
): number | null {
  const c = currency.toUpperCase()
  if (USD_PEGGED.has(c)) return 1
  return priceUsd.get(c) ?? null
}

export type OrderNotionalInput = {
  pair: string // BASE-QUOTE
  size: number
  /** True when `size` is denominated in the quote currency (tgtCcy quote_ccy). */
  quoteDenominated: boolean
  /** Price in quote per base (limit price, or the live last price). */
  price: number | null
}

/**
 * Compute an order's notional value in USD, or null if it can't be priced
 * (unknown quote/base USD price). Fail-open: callers treat null as "skip".
 */
export function orderNotionalUsd(
  input: OrderNotionalInput,
  priceUsd: Map<string, number>,
): number | null {
  const [base, quote] = input.pair.toUpperCase().split('-')
  if (!base || !quote || !(input.size > 0)) return null

  const quoteUsd = priceUsdFor(quote, priceUsd)

  if (input.quoteDenominated) {
    return quoteUsd != null ? input.size * quoteUsd : null
  }

  // Base-denominated: prefer (price in quote) × (quote→USD); fall back to a
  // direct base→USD price from the portfolio map.
  if (input.price != null && input.price > 0 && quoteUsd != null) {
    return input.size * input.price * quoteUsd
  }
  const baseUsd = priceUsdFor(base, priceUsd)
  return baseUsd != null ? input.size * baseUsd : null
}

export type PositionSizeVerdict = {
  exceeds: boolean
  /** Order notional as a percent of portfolio (0 when not computable). */
  ratioPct: number
}

/**
 * Evaluate an order's notional against maxPositionSize (% of portfolio).
 * Fail-open: returns exceeds=false when the limit is off or inputs are unknown,
 * so missing price data never blocks a legitimate order.
 */
export function evaluatePositionSize(
  notionalUsd: number | null,
  portfolioValueUsd: number,
  maxPositionSizePct: number,
): PositionSizeVerdict {
  if (
    maxPositionSizePct <= 0 ||
    !(portfolioValueUsd > 0) ||
    notionalUsd == null ||
    !(notionalUsd > 0)
  ) {
    return { exceeds: false, ratioPct: 0 }
  }
  const ratioPct = (notionalUsd / portfolioValueUsd) * 100
  return { exceeds: ratioPct > maxPositionSizePct, ratioPct }
}
