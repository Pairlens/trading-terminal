// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'

import type { AssetClass } from '@pairlens/market-engine'

import { useMarketData } from '@/lib/market-data-provider'

export type MarketOption = {
  value: string
  label: string
  iconUrl?: string
  assetClasses: Array<AssetClass>
  /** Unreachable from a browser build — see MarketAdapterInfo.requiresDesktop. */
  requiresDesktop?: boolean
}

export function useAvailableMarkets(): {
  markets: Array<MarketOption>
  defaultMarket: string
} {
  const { availableMarkets } = useMarketData()

  return useMemo(() => {
    const markets: Array<MarketOption> = availableMarkets.map((m) => ({
      value: m.marketId,
      label: m.displayName,
      iconUrl: m.iconUrl,
      assetClasses: m.assetClasses,
      requiresDesktop: m.requiresDesktop,
    }))

    // Never default into a venue this build cannot reach — that would open the
    // terminal on a dead chart for anyone whose first connector is desktop-only.
    const usable = markets.filter((m) => !m.requiresDesktop)
    return {
      markets,
      defaultMarket: (usable[0] ?? markets[0])?.value ?? 'okx',
    }
  }, [availableMarkets])
}
