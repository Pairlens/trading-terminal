// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every NFT read, in one place.
 *
 * All of them go through `pluginManager.execute('market-data:nft', …)` with an
 * `action` rather than a fan-out, because — unlike a venue ladder, where each
 * venue is a separate answer — there is exactly one answer to "what is this
 * collection's floor". The resolver picks the highest-priority provider that
 * serves the chain, and a provider that cannot answer an action THROWS, which
 * is what makes the manager walk to the next one. A provider returning null
 * would end the walk with "there is nothing here", which is a different and
 * much worse claim (see the same reasoning in `use-pool-stats.ts`).
 *
 * `market` is passed explicitly on every call. The manager's shared context
 * carries the terminal's current venue, and an NFT board looking at a Base
 * collection while the chart sits on an Ethereum one would otherwise resolve
 * against the wrong chain.
 *
 * ## Cadences
 *
 * Set by what actually moves. A floor is a min over a listing set and changes
 * when someone lists or buys, so a minute is plenty; the tape wants to feel
 * live; rankings reorder over hours. Every query is `enabled`-gated, so a pane
 * nobody has open costs no requests out of a budget the whole board shares.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { isProviderThrottledError } from '@pairlens/market-engine/errors'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type {
  NftBook,
  NftChain,
  NftCollectionSort,
  NftCollectionSummary,
  NftCollectionsResult,
  NftHoldingsResult,
  NftItemsResult,
  NftListingsResult,
  NftMarketOverview,
  NftOffersResult,
  NftPriceSeries,
  NftSalesResult,
  NftTraitFloor,
} from '@pairlens/shared/nft-types'

import { usePairlens } from '@/lib/pairlens-provider'

/** A collection's own state: floor, volume, supply. Moves on every fill. */
const COLLECTION_REFRESH_MS = 60_000
/** The ladder. The number a trader is about to hit, so it leads the rest. */
const BOOK_REFRESH_MS = 20_000
/** The tape. */
const SALES_REFRESH_MS = 20_000
/** Rankings reorder over hours. */
const RANKINGS_REFRESH_MS = 5 * 60_000
/** Traits and items are close to static within a session. */
const SLOW_REFRESH_MS = 10 * 60_000

const THROTTLE_RETRIES = 2

/** Retry a provider throttle, and only a provider throttle. */
function retryOnThrottle(failureCount: number, error: unknown): boolean {
  return isProviderThrottledError(error) && failureCount <= THROTTLE_RETRIES
}

/** The provider's own advice where it gave any, a widening back-off otherwise. */
function throttleRetryDelay(attempt: number, error: unknown): number {
  const advised = isProviderThrottledError(error) ? error.retryAfterMs : 0
  return Math.min(Math.max(advised, 1_500 * 2 ** attempt), 10_000)
}

/**
 * How many rows the rankings table asks for. Exported so the Discovery panes
 * cannot drift apart: react-query keys on this value, and a pane asking for a
 * different depth opens a SECOND rankings query and spends the budget twice.
 */
export const NFT_RANKING_LIMIT = 50

export type NftQueryState = {
  isLoading: boolean
  error: string | null
  /** The failure is a provider rate limit, whose own message is readable. */
  throttled: boolean
  /** No provider installed serves NFT data at all. */
  unsupported: boolean
  /**
   * The provider is installed but has no key, so this is a configuration
   * state rather than an outage.
   *
   * Worth its own flag because the two look identical from a pane and read
   * completely differently to a user: "it usually recovers on the next
   * refresh" is a lie told to someone who needs to paste an API key, and they
   * will wait for a recovery that cannot come.
   */
  needsKey: boolean
}

/**
 * Duck-typed, not `instanceof`.
 *
 * The error is minted inside a plugin bundle and read here, and the two do not
 * share a class identity across that boundary. Same trick, and the same
 * reason, as the `__providerThrottled` sentinel in `market-engine`.
 */
function isMissingKey(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { __nftNeedsKey?: boolean }).__nftNeedsKey === true
  )
}

function stateOf(
  query: { isLoading: boolean; error: unknown; isFetching: boolean },
  enabled: boolean,
  hasProvider: boolean,
): NftQueryState {
  const error = query.error
  return {
    // A disabled query never reports pending, so an unmounted-but-gated pane
    // must not read as "loading forever".
    isLoading: enabled && hasProvider && query.isLoading,
    error: error ? messageOf(error) : null,
    throttled: isProviderThrottledError(error),
    unsupported: !hasProvider,
    needsKey: isMissingKey(error),
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Whether anything installed serves `market-data:nft`.
 *
 * Read off the live plugin set rather than assumed, because the NFT family is
 * a real install unit: uninstalling it is the user-level way to drop the asset
 * class, and every pane has to render "no provider" rather than "loading".
 */
export function useNftProviders(): Array<PluginInstance> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () =>
      pluginManager
        .getActivePlugins()
        .filter((p: PluginInstance) =>
          (p.manifest.capabilities ?? []).some(
            (c) => c.id === 'market-data:nft',
          ),
        ),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )
}

/** The chains an installed provider can actually answer for. */
export function useNftChains(): Array<NftChain> {
  const providers = useNftProviders()
  return useMemo(() => {
    const chains = new Set<NftChain>()
    for (const plugin of providers) {
      for (const capability of plugin.manifest.capabilities ?? []) {
        if (capability.id !== 'market-data:nft') continue
        for (const market of capability.markets ?? []) {
          if (market !== '*') chains.add(market as NftChain)
        }
      }
    }
    return [...chains]
  }, [providers])
}

type UseCollectionsArgs = {
  chain: NftChain | undefined
  sort?: NftCollectionSort
  limit?: number
  enabled?: boolean
}

export function useNftCollections({
  chain,
  sort = 'volume24h',
  limit = NFT_RANKING_LIMIT,
  enabled = true,
}: UseCollectionsArgs): {
  collections: Array<NftCollectionSummary>
} & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(enabled && pluginsReady && chain && providers.length)

  const query = useQuery({
    queryKey: ['nft-collections', chain, sort, limit],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'collections',
        market: chain,
        sort,
        limit,
      })) as NftCollectionsResult | null,
    enabled: active,
    staleTime: RANKINGS_REFRESH_MS,
    refetchInterval: RANKINGS_REFRESH_MS,
    gcTime: 15 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    collections: query.data?.collections ?? [],
    ...stateOf(query, active, providers.length > 0),
  }
}

export function useNftCollection(
  chain: NftChain | undefined,
  contract: string | undefined,
  enabled = true,
): { collection: NftCollectionSummary | null } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && contract && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-collection', chain, contract],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'collection',
        market: chain,
        contract,
      })) as NftCollectionSummary | null,
    enabled: active,
    staleTime: COLLECTION_REFRESH_MS,
    refetchInterval: COLLECTION_REFRESH_MS,
    gcTime: 15 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    collection: query.data ?? null,
    ...stateOf(query, active, providers.length > 0),
  }
}

/**
 * Both sides of the ladder, in one read.
 *
 * Deliberately not two queries the pane zips together: listings and offers
 * fetched independently settle at different instants, and a bid that was
 * withdrawn between them renders as a crossed book that never existed. The
 * connector reads both and stamps `asOfMs`, so the pane can say when.
 */
export function useNftBook(
  chain: NftChain | undefined,
  contract: string | undefined,
  enabled = true,
): { book: NftBook | null } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && contract && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-book', chain, contract],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'book',
        market: chain,
        contract,
      })) as NftBook | null,
    enabled: active,
    staleTime: BOOK_REFRESH_MS,
    refetchInterval: BOOK_REFRESH_MS,
    gcTime: 5 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    book: query.data ?? null,
    ...stateOf(query, active, providers.length > 0),
  }
}

export function useNftListings(
  chain: NftChain | undefined,
  contract: string | undefined,
  limit = 50,
  enabled = true,
): { listings: NftListingsResult['listings'] } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && contract && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-listings', chain, contract, limit],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'listings',
        market: chain,
        contract,
        limit,
      })) as NftListingsResult | null,
    enabled: active,
    staleTime: BOOK_REFRESH_MS,
    refetchInterval: BOOK_REFRESH_MS,
    gcTime: 5 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    listings: query.data?.listings ?? [],
    ...stateOf(query, active, providers.length > 0),
  }
}

export function useNftOffers(
  chain: NftChain | undefined,
  contract: string | undefined,
  limit = 50,
  enabled = true,
): { offers: NftOffersResult['offers'] } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && contract && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-offers', chain, contract, limit],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'offers',
        market: chain,
        contract,
        limit,
      })) as NftOffersResult | null,
    enabled: active,
    staleTime: BOOK_REFRESH_MS,
    refetchInterval: BOOK_REFRESH_MS,
    gcTime: 5 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    offers: query.data?.offers ?? [],
    ...stateOf(query, active, providers.length > 0),
  }
}

/**
 * The tape. `contract` absent means market-wide, which is what the Discovery
 * board's whale feed reads — the same action, unscoped.
 */
export function useNftSales(
  chain: NftChain | undefined,
  contract: string | undefined,
  limit = 50,
  enabled = true,
  minPriceUsd?: number,
): { sales: NftSalesResult['sales'] } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(enabled && pluginsReady && chain && providers.length)

  const query = useQuery({
    queryKey: ['nft-sales', chain, contract ?? null, limit, minPriceUsd ?? 0],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'sales',
        market: chain,
        ...(contract ? { contract } : {}),
        ...(minPriceUsd ? { minPriceUsd } : {}),
        limit,
      })) as NftSalesResult | null,
    enabled: active,
    staleTime: SALES_REFRESH_MS,
    refetchInterval: SALES_REFRESH_MS,
    gcTime: 5 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    sales: query.data?.sales ?? [],
    ...stateOf(query, active, providers.length > 0),
  }
}

export function useNftItems(
  chain: NftChain | undefined,
  contract: string | undefined,
  limit = 60,
  enabled = true,
): { items: NftItemsResult['items'] } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && contract && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-items', chain, contract, limit],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'items',
        market: chain,
        contract,
        limit,
      })) as NftItemsResult | null,
    enabled: active,
    staleTime: SLOW_REFRESH_MS,
    refetchInterval: SLOW_REFRESH_MS,
    gcTime: 20 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    items: query.data?.items ?? [],
    ...stateOf(query, active, providers.length > 0),
  }
}

export function useNftTraits(
  chain: NftChain | undefined,
  contract: string | undefined,
  enabled = true,
): { traits: Array<NftTraitFloor> } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && contract && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-traits', chain, contract],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'traits',
        market: chain,
        contract,
      })) as Array<NftTraitFloor> | null,
    enabled: active,
    staleTime: SLOW_REFRESH_MS,
    refetchInterval: SLOW_REFRESH_MS,
    gcTime: 20 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    traits: query.data ?? [],
    ...stateOf(query, active, providers.length > 0),
  }
}

/**
 * A collection's price history.
 *
 * The series carries its own `basis`, and panes must show it: a tracked floor
 * and an average of the sales tape are two different numbers, and a chart that
 * silently swaps one for the other when the provider changes is lying about
 * what it drew.
 */
export function useNftSeries(
  chain: NftChain | undefined,
  contract: string | undefined,
  days = 30,
  enabled = true,
): { series: NftPriceSeries | null } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && contract && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-series', chain, contract, days],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'series',
        market: chain,
        contract,
        days,
      })) as NftPriceSeries | null,
    enabled: active,
    staleTime: COLLECTION_REFRESH_MS,
    refetchInterval: COLLECTION_REFRESH_MS,
    gcTime: 20 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    series: query.data ?? null,
    ...stateOf(query, active, providers.length > 0),
  }
}

export function useNftOverview(enabled = true): {
  overview: NftMarketOverview | null
} & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(enabled && pluginsReady && providers.length)

  const query = useQuery({
    queryKey: ['nft-overview'],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'overview',
      })) as NftMarketOverview | null,
    enabled: active,
    staleTime: RANKINGS_REFRESH_MS,
    refetchInterval: RANKINGS_REFRESH_MS,
    gcTime: 15 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    overview: query.data ?? null,
    ...stateOf(query, active, providers.length > 0),
  }
}

/**
 * What a wallet owns. `contract` scopes it to one collection, which is what the
 * board's holdings pane wants; unscoped is the portfolio read.
 */
export function useNftHoldings(
  chain: NftChain | undefined,
  owner: string | undefined,
  contract?: string,
  enabled = true,
): { holdings: NftHoldingsResult['holdings'] } & NftQueryState {
  const { pluginManager, pluginsReady } = usePairlens()
  const providers = useNftProviders()
  const active = Boolean(
    enabled && pluginsReady && chain && owner && providers.length,
  )

  const query = useQuery({
    queryKey: ['nft-holdings', chain, owner, contract ?? null],
    queryFn: async () =>
      (await pluginManager.execute('market-data:nft', {
        action: 'holdings',
        market: chain,
        owner,
        ...(contract ? { contract } : {}),
      })) as NftHoldingsResult | null,
    enabled: active,
    staleTime: COLLECTION_REFRESH_MS,
    refetchInterval: COLLECTION_REFRESH_MS,
    gcTime: 15 * 60_000,
    retry: retryOnThrottle,
    retryDelay: throttleRetryDelay,
  })

  return {
    holdings: query.data?.holdings ?? [],
    ...stateOf(query, active, providers.length > 0),
  }
}
