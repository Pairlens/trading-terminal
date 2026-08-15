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

import { lookupPredictionOutcome } from '@/stores/prediction-directory-store'
import { splitPairAssets } from '@/lib/pairs'

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
  pair: string // BASE-QUOTE, or BASE-QUOTE-SETTLE for a perpetual future
  size: number
  /** True when `size` is denominated in the quote currency (tgtCcy quote_ccy). */
  quoteDenominated: boolean
  /** Price in quote per base (limit price, or the live last price). */
  price: number | null
  /**
   * Base units per contract, for perp venues that do not quote in the base
   * asset (KuCoin's XBTUSDTM is 0.001 BTC). Ignored for spot. Absent means 1,
   * which is what Binance and Kraken linear perps use.
   */
  contractSize?: number
}

/**
 * Compute an order's notional value in USD, or null if it can't be priced
 * (unknown quote/base USD price). Fail-open: callers treat null as "skip".
 */
export function orderNotionalUsd(
  input: OrderNotionalInput,
  priceUsd: Map<string, number>,
): number | null {
  if (!(input.size > 0)) return null

  // Prediction outcomes are not BASE-QUOTE: the pair key is an opaque outcome
  // id whose dash-split yields garbage "currencies", which made this guard
  // fail open for every prediction order. The directory pin identifies them,
  // collateral is USD/USDC ($1), size is a contract count, and a contract
  // never costs more than $1 — so an unknown price uses $1 as the notional's
  // upper bound rather than skipping the check.
  if (lookupPredictionOutcome(input.pair)) {
    const perContract =
      input.price != null && input.price > 0 && input.price <= 1
        ? input.price
        : 1
    return input.size * perContract
  }

  // One uppercase, one split, for both arms: this runs on every portfolio tick
  // behind the ticket's risk row, not only at submit.
  const upper = input.pair.toUpperCase()
  const legs = splitPairAssets(upper)

  // Perpetual futures: BASE-QUOTE-SETTLE. Its dash-split reads as base/quote
  // plus a stray third leg, and the spot arm below would then price a CONTRACT
  // COUNT as if it were a base amount — off by the contract size on every
  // venue that does not quote in the base asset, and priced against the wrong
  // currency map entry. Leverage deliberately plays no part: it changes the
  // margin posted, not the exposure taken, and the cap is on exposure.
  if (legs.settle) {
    const settleUsd = priceUsdFor(legs.settle, priceUsd)
    // A quote-denominated size on a linear perp is ALREADY the settle amount
    // (the exposure the user typed in USDT), so multiplying by the price would
    // report it as if each unit were a contract at that price.
    if (input.quoteDenominated) return input.size * (settleUsd ?? 1)
    const contractSize =
      input.contractSize != null && input.contractSize > 0
        ? input.contractSize
        : 1
    // A perp is the one instrument where an unpriced order is the dangerous
    // one, so this arm never returns null on a settle currency it does not
    // recognise: every v1 venue settles in USDT or USD, and $1 is the right
    // answer for all of them. Without any price at all it still falls back to
    // the base asset's own USD price the way the spot arm does, rather than
    // waving a leveraged order through unchecked.
    const perpPrice =
      input.price != null && input.price > 0
        ? input.price * (settleUsd ?? 1)
        : priceUsdFor(legs.base, priceUsd)
    if (perpPrice == null) return null
    return input.size * contractSize * perpPrice
  }

  // A key with no quote leg at all is a bare equity ticker, whose quote comes
  // from the venue rather than the string — unpriceable from here.
  if (!upper.includes('-')) return null
  const { base, quote } = legs

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
