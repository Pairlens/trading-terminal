// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { TopCoin } from '@pairlens/shared/instrument-types'
import { appServerUrl } from '@/lib/api'
import { fetchTopCoinsWithFallback } from '@/lib/public-market-data'

/** One query entry, shared by both hooks below — never two fetches. */
function useTopCoinsQuery() {
  return useQuery({
    queryKey: ['top-coins-snapshot'],
    queryFn: () =>
      fetchTopCoinsWithFallback((path) => fetch(`${appServerUrl}${path}`)),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  })
}

/**
 * Shared 5-minute snapshot of the top-coins feed, keyed by base symbol
 * ('BTC' → TopCoin). Powers the price/24h columns in the markets scanner
 * without opening a socket per row. App Server first, CoinGecko fallback —
 * works signed-out and without any Pairlens backend.
 */
export function useTopCoinsSnapshot(): Map<string, TopCoin> {
  const { data } = useTopCoinsQuery()

  return useMemo(() => {
    const map = new Map<string, TopCoin>()
    for (const coin of data?.coins ?? []) {
      map.set(coin.symbol.toUpperCase(), coin)
    }
    return map
  }, [data])
}

export type TopCoinsSnapshotState = 'loading' | 'ready' | 'unavailable'

/**
 * Why the snapshot is empty, for the panes that are nothing without it.
 *
 * A markets table with an empty snapshot still has rows and simply shows no
 * price. The pulse strip, the movers table and the sector tape have no other
 * source, so "still arriving" and "both sources refused" have to look
 * different: the first is a skeleton, the second is a stated failure. Reading
 * the same query key costs no extra request.
 */
export function useTopCoinsSnapshotState(): TopCoinsSnapshotState {
  const { data, isError } = useTopCoinsQuery()
  if (data && data.coins.length > 0) return 'ready'
  if (isError || (data && data.coins.length === 0)) return 'unavailable'
  return 'loading'
}
