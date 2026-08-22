// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The four memecoin columns, and one token lookup, through the plugin system.
 *
 * Every read here goes out as `market-data:launchpad` rather than as a fetch,
 * which is what makes the source swappable: the bundled keyless provider can
 * be outranked by a bring-your-own-key one without a pane changing. The panes
 * therefore never learn which host answered — only `token.source`, which they
 * spend on one thing (marking a reconstructed curve percentage as an estimate)
 * and nothing else.
 *
 * ## Cadence, and why the columns do not share one
 *
 * New turns over in seconds and Legendary turns over in days, so a single
 * interval would either burn a keyless budget on DOGE's market cap or show a
 * ten-minute-old launch as new. Each column names its own.
 *
 * ## Snapshot seeding
 *
 * Same contract as the DEX board, and for the same reason: a cold open on four
 * columns is four provider round trips before anything paints. Seeds are read
 * inside `initialData` during render, so they must be free — the cache module
 * parses localStorage once into a module-level Map. `initialDataUpdatedAt` is
 * load-bearing: without it React Query dates the seed to now, believes it is
 * fresh, and skips the refetch that was the point of showing it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import type {
  LaunchpadListing,
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

import { usePairlens } from '@/lib/pairlens-provider'
import {
  readDiscoverySnapshot,
  writeDiscoverySnapshot,
} from '@/lib/dex/discovery-cache'
/**
 * How often each column re-reads.
 *
 * New and Graduating are the two a trader actually watches move, so they poll
 * fastest; Graduated changes on the order of minutes; Legendary is a market-cap
 * ranking of coins measured in billions and is polled slowly on purpose, since
 * it is also the one column funded by the tightest budget in the terminal.
 */
const REFRESH_MS: Readonly<Record<LaunchpadStage, number>> = {
  new: 20_000,
  graduating: 20_000,
  graduated: 60_000,
  legendary: 300_000,
}

/** Snapshot key per column. Namespaced so it cannot collide with a pool key. */
function snapshotKey(stage: LaunchpadStage): string {
  return `launchpad:${stage}`
}

function seededFromSnapshot<T>(key: string): {
  initialData?: () => T
  initialDataUpdatedAt?: number
} {
  const seed = readDiscoverySnapshot<T>(key)
  if (!seed) return {}
  return { initialData: () => seed.data, initialDataUpdatedAt: seed.ts }
}

export type LaunchpadColumnState = {
  tokens: Array<LaunchpadToken>
  /** Nothing on screen yet and a read in flight. */
  isLoading: boolean
  /** Rows ARE on screen and a newer read is in flight. */
  revalidating: boolean
  /** True while the rows on screen came from localStorage, not this session. */
  fromSnapshot: boolean
  error: string | null
  throttled: boolean
  /**
   * A backed-off retry, which is NOT a first load. `isFetching` cannot tell
   * them apart: a focus-paused retry sits at `fetchStatus: 'paused'` and reads
   * as a pane that never started.
   */
  retrying: boolean
  retry: () => void
  /** When the rows on screen were read. Null before the first answer. */
  fetchedAt: number | null
}

export function useLaunchpadColumn(
  stage: LaunchpadStage,
): LaunchpadColumnState {
  const { pluginManager, pluginsReady } = usePairlens()
  const queryClient = useQueryClient()
  const key = snapshotKey(stage)
  // Captured once so a seeded query can tell "this is the seed I mounted with"
  // from "this is a read that landed since".
  const [mountedAt] = useState(() => Date.now())

  const query = useQuery({
    queryKey: ['launchpad', stage],
    enabled: pluginsReady,
    queryFn: async (): Promise<LaunchpadListing | null> => {
      const result = await pluginManager.execute('market-data:launchpad', {
        action: stage,
      })
      return (result as LaunchpadListing | null) ?? null
    },
    refetchInterval: REFRESH_MS[stage],
    staleTime: REFRESH_MS[stage] / 2,
    ...seededFromSnapshot<LaunchpadListing | null>(key),
  })

  const { data, dataUpdatedAt, isFetching, failureCount, fetchStatus, error } =
    query

  // In an effect, never during render: a snapshot write is a side effect, and
  // under StrictMode a render-time one runs twice.
  //
  // `updatedAt` is React Query's own `dataUpdatedAt`, which is the MEASUREMENT
  // time rather than the render time. A seeded query re-offers its seed on the
  // first render, so stamping that with the clock would make the snapshot
  // immortal, and the board would keep showing a launch from last week.
  useEffect(() => {
    if (!data) return
    writeDiscoverySnapshot(key, data, dataUpdatedAt)
  }, [key, data, dataUpdatedAt])

  const tokens = useMemo(() => data?.tokens ?? [], [data])
  const retry = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: ['launchpad', stage] })
  }, [queryClient, stage])

  const hasRows = tokens.length > 0
  return {
    tokens,
    isLoading: !hasRows && (isFetching || !pluginsReady),
    revalidating: hasRows && isFetching,
    fromSnapshot: hasRows && dataUpdatedAt < mountedAt,
    error: error ? (error.message ?? String(error)) : null,
    throttled: isProviderThrottledError(error),
    retrying: failureCount > 0 && fetchStatus !== 'idle',
    retry,
    fetchedAt: dataUpdatedAt || null,
  }
}

/**
 * One token, for the trade board's panes.
 *
 * Keyed on the MINT rather than the pair key: the pair key carries a quote leg
 * the launchpad feed knows nothing about, and two boards looking at the same
 * token against different quotes are one read, not two.
 */
export function useLaunchpadToken(address: string | null): {
  token: LaunchpadToken | null
  isLoading: boolean
  error: string | null
  throttled: boolean
} {
  const { pluginManager, pluginsReady } = usePairlens()

  const query = useQuery({
    queryKey: ['launchpad-token', address],
    enabled: pluginsReady && !!address,
    queryFn: async (): Promise<LaunchpadToken | null> => {
      const result = await pluginManager.execute('market-data:launchpad', {
        action: 'token',
        address,
      })
      return (result as LaunchpadToken | null) ?? null
    },
    // Slower than a column: these figures back a panel a trader reads before
    // an order, not a list they watch scroll.
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  return {
    token: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? (query.error.message ?? String(query.error)) : null,
    throttled: isProviderThrottledError(query.error),
  }
}
