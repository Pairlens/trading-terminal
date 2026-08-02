// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { TopCoin } from '@pairlens/shared/instrument-types'
import { appServerUrl } from '@/lib/api'
import { fetchTopCoinsWithFallback } from '@/lib/public-market-data'

/**
 * Shared 5-minute snapshot of the top-coins feed, keyed by base symbol
 * ('BTC' → TopCoin). Powers the price/24h columns in the markets scanner
 * without opening a socket per row. App Server first, CoinGecko fallback —
 * works signed-out and without any Pairlens backend.
 */
export function useTopCoinsSnapshot(): Map<string, TopCoin> {
  const { data } = useQuery({
    queryKey: ['top-coins-snapshot'],
    queryFn: () =>
      fetchTopCoinsWithFallback((path) => fetch(`${appServerUrl}${path}`)),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  })

  return useMemo(() => {
    const map = new Map<string, TopCoin>()
    for (const coin of data?.coins ?? []) {
      map.set(coin.symbol.toUpperCase(), coin)
    }
    return map
  }, [data])
}
