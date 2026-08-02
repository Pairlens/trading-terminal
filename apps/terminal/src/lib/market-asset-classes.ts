// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Dynamic asset class resolution from available markets.
 * Reads from MarketAdapterInfo (populated by connector plugins at runtime)
 * instead of a static hardcoded map.
 */

import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'

/** Returns the asset classes a market supports (empty array if unknown). */
export function getMarketAssetClasses(
  market: string,
  availableMarkets?: Array<MarketAdapterInfo>,
): Array<string> {
  if (!availableMarkets) return []
  const info = availableMarkets.find((m) => m.marketId === market)
  return info?.assetClasses ?? []
}

/** Returns whether a market supports a given asset class. */
export function marketSupportsAssetClass(
  market: string,
  assetClass: string,
  availableMarkets?: Array<MarketAdapterInfo>,
): boolean {
  if (!availableMarkets) return true
  const classes = getMarketAssetClasses(market, availableMarkets)
  // Unknown markets are assumed compatible (future-proof)
  if (classes.length === 0) return true
  return classes.includes(assetClass)
}

/**
 * Resolve the best market for fetching data for a given asset class.
 *
 * Priority:
 *   1. `preferred` if it supports the asset class
 *   2. First available market that supports the asset class
 *   3. `preferred` as last resort (let the server decide)
 */
export function resolveMarketForAssetClass(
  preferred: string,
  availableMarketIds: Array<string>,
  assetClass?: string,
  availableMarkets?: Array<MarketAdapterInfo>,
): string {
  if (!assetClass) return preferred

  if (marketSupportsAssetClass(preferred, assetClass, availableMarkets))
    return preferred

  const compatible = availableMarketIds.find((m) =>
    marketSupportsAssetClass(m, assetClass, availableMarkets),
  )
  return compatible ?? preferred
}
