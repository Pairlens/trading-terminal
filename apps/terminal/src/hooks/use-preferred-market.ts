// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useMemo } from 'react'

import { resolveMarketForAssetClass } from '@/lib/market-asset-classes'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'

/**
 * Which venue a discovery row should price itself against.
 *
 * Starts from the market the user last charted, then steps off it when the
 * instrument's asset class says it has to: an equity can't stream from a
 * crypto exchange. Venues this build cannot reach are excluded outright —
 * a browser resolving to a desktop-only connector would just fail every call.
 */
export function usePreferredMarketResolver(): (assetClass?: string) => string {
  const { markets, defaultMarket } = useAvailableMarkets()
  const { availableMarkets: adapterInfos } = useMarketData()
  const [preferred] = usePersistedState('terminal.market', defaultMarket)

  const reachable = useMemo(
    () => markets.filter((m) => !m.desktopOnly).map((m) => m.value),
    [markets],
  )
  const validPreferred = reachable.includes(preferred)
    ? preferred
    : defaultMarket

  return useCallback(
    (assetClass?: string) =>
      resolveMarketForAssetClass(
        validPreferred,
        reachable,
        assetClass,
        adapterInfos,
      ),
    [validPreferred, reachable, adapterInfos],
  )
}
