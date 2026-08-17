// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which sector each asset belongs to, from the instrument catalog.
 *
 * Sector membership is curated metadata, not market data: it changes when the
 * catalog ships, not when a price does. So it is fetched once, in a single
 * discovery call, and shared by every pane that needs it — the sector tape,
 * the dossier's sector tile and the peers rail all read this one query rather
 * than each asking discovery for their own slice.
 *
 * The catalog lists PAIRS (BTC-USDT, BTC-USDC, …) and a sector is about the
 * ASSET, so rows collapse to their base symbol. First occurrence wins, and the
 * catalog is rank-ordered, so a category's member list comes out with the
 * largest asset first — which is the order the peers rail and the sector chips
 * both want.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type {
  InstrumentCategory,
  InstrumentPage,
} from '@pairlens/shared/instrument-types'

import { usePairlens } from '@/lib/pairlens-provider'

/**
 * Deliberately generous and deliberately finite. The bundled catalog is a few
 * hundred pairs; a deeper index behind the same capability would be paged
 * forever, and a sector tape does not become more truthful past the first few
 * hundred assets by capitalisation.
 */
const CATALOG_LIMIT = 1000

export type SectorMembership = {
  /** Base symbol → its categories, in catalog order. */
  categoriesOf: ReadonlyMap<string, ReadonlyArray<InstrumentCategory>>
  /** Category → base symbols, largest first. */
  membersOf: ReadonlyMap<InstrumentCategory, ReadonlyArray<string>>
  /** The catalog answered. False while loading, and when nothing serves it. */
  ready: boolean
}

const EMPTY: SectorMembership = {
  categoriesOf: new Map(),
  membersOf: new Map(),
  ready: false,
}

export function useSectorMembership(): SectorMembership {
  const { pluginManager, pluginStateVersion, pluginsReady } = usePairlens()

  const hasDiscovery = useMemo(
    () =>
      pluginManager.getPluginForCapability('market-data:discovery') !== null,
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const { data } = useQuery({
    queryKey: ['sector-membership', pluginStateVersion],
    queryFn: async () => {
      const page = (await pluginManager.execute('market-data:discovery', {
        assetClass: 'crypto',
        offset: 0,
        limit: CATALOG_LIMIT,
      })) as InstrumentPage
      return page.items ?? []
    },
    enabled: hasDiscovery && pluginsReady,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  })

  return useMemo(() => {
    if (!data) return EMPTY
    const categoriesOf = new Map<string, Array<InstrumentCategory>>()
    const membersOf = new Map<InstrumentCategory, Array<string>>()

    for (const instrument of data) {
      const base = instrument.base?.toUpperCase()
      if (!base || categoriesOf.has(base)) continue
      const categories = instrument.categories ?? []
      categoriesOf.set(base, categories)
      for (const category of categories) {
        const members = membersOf.get(category)
        if (members) members.push(base)
        else membersOf.set(category, [base])
      }
    }

    return { categoriesOf, membersOf, ready: true }
  }, [data])
}
