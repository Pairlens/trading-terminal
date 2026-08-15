// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'

import type {
  Instrument,
  InstrumentPage,
} from '@pairlens/shared/instrument-types'

import { usePairlens } from '@/lib/pairlens-provider'
import { normalizePairKey } from '@/lib/pairs'
import { usePredictionDirectoryStore } from '@/stores/prediction-directory-store'

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

/**
 * Fetch specific instruments by symbol list (for watchlist/favorites).
 *
 * Discovery answers from the instrument catalog, which holds spot pairs and
 * curated equities and nothing else — so a watched prediction outcome comes
 * back missing and its row is dropped entirely, not merely mislabelled. The
 * prediction directory is what the picker pinned when the user chose that
 * outcome, so the missing rows are rebuilt from it: the question they saw,
 * on the venue they saw it on.
 *
 * Only ever ADDS rows the catalog did not serve. A symbol discovery answered
 * is left exactly as discovery answered it.
 */
export function useInstrumentsBySymbols(symbolList: Array<string>) {
  const symbols = symbolList.join(',')
  const result = useMarketInstruments({ symbols: symbols || undefined })
  const directory = usePredictionDirectoryStore((s) => s.entries)

  const items = useMemo(() => {
    const served = new Set(result.items.map((i) => i.symbol))
    const extra: Array<Instrument> = []
    // The joined string, not the caller's array: callers rebuild that array
    // on reorder, and re-deriving on identity would hand every consumer a new
    // `items` reference for a list that did not change.
    for (const symbol of symbols ? symbols.split(',') : []) {
      if (served.has(symbol)) continue
      const pinned = directory[normalizePairKey(symbol)]
      if (!pinned) continue
      extra.push({
        id: `${pinned.market}:${symbol}`,
        kind: 'prediction',
        market: pinned.market,
        symbol,
        name: pinned.name,
        base: symbol,
        quote: '',
        assetClass: 'prediction',
        categories: [],
        rank: 100_000,
        featured: false,
        predictionMarketId: pinned.predictionMarketId,
        outcome: pinned.outcome,
        ...(pinned.eventId ? { eventId: pinned.eventId } : {}),
        ...(pinned.eventTitle ? { eventTitle: pinned.eventTitle } : {}),
        ...(typeof pinned.endMs === 'number' ? { endMs: pinned.endMs } : {}),
      })
    }
    return extra.length > 0 ? [...result.items, ...extra] : result.items
  }, [result.items, symbols, directory])

  return useMemo(() => ({ ...result, items }), [result, items])
}
