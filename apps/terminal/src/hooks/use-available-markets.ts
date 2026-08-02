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
    }))

    return { markets, defaultMarket: markets[0]?.value ?? 'okx' }
  }, [availableMarkets])
}
