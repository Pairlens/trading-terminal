// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'

import type { InstrumentPage } from '@pairlens/shared/instrument-types'

import { usePairlens } from '@/lib/pairlens-provider'

const PAGE_SIZE = 50

type UseMarketInstrumentsOptions = {
  market?: string
  category?: string
  assetClass?: string
  q?: string
  symbols?: string
}

export function useMarketInstruments(
  options: UseMarketInstrumentsOptions = {},
) {
  const { pluginManager, pluginStateVersion, pluginsReady } = usePairlens()
  const { market, category, assetClass, q, symbols } = options

  const hasDiscovery = useMemo(
    () =>
      pluginManager.getPluginForCapability('market-data:discovery') !== null,
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const query = useInfiniteQuery({
    queryKey: [
      'instruments',
      market,
      category,
      assetClass,
      q,
      symbols,
      pluginStateVersion,
    ],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, unknown> = {
        offset: pageParam.offset,
        limit: PAGE_SIZE,
      }
      if (market) params['market'] = market
      if (category) params['category'] = category
      if (assetClass) params['assetClass'] = assetClass
      if (q) params['q'] = q
      if (symbols) params['symbols'] = symbols

      const result = await pluginManager.execute(
        'market-data:discovery',
        params,
      )
      return result as InstrumentPage
    },
    initialPageParam: { offset: 0 },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore) return undefined
      return { offset: lastPageParam.offset + PAGE_SIZE }
    },
    enabled: hasDiscovery,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  )

  const total = query.data?.pages[0]?.total ?? 0

  return useMemo(
    () => ({
      items,
      total,
      hasNextPage: query.hasNextPage,
      fetchNextPage: query.fetchNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      isLoading: query.isLoading,
      hasDiscovery,
      pluginsReady,
    }),
    [
      items,
      total,
      query.hasNextPage,
      query.fetchNextPage,
      query.isFetchingNextPage,
      query.isLoading,
      hasDiscovery,
      pluginsReady,
    ],
  )
}

/** Fetch specific instruments by symbol list (for watchlist/favorites) */
export function useInstrumentsBySymbols(symbolList: Array<string>) {
  const symbols = symbolList.join(',')
  return useMarketInstruments({ symbols: symbols || undefined })
}
