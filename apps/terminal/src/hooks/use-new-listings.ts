// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The new-listings feed: our own sweeper's CEX first-seen stamps, merged with
 * the chains' newly created pools.
 *
 * The two halves fail independently and the pane says so rather than going
 * blank. A standalone build (no App Server) has no CEX half at all and still
 * shows every new pool; a throttled provider drops the on-chain half and the
 * venue listings stand alone. Both refusing is the only empty state.
 *
 * The App Server half is a plain cached GET with no per-symbol cost, so a
 * generous stale window is purely about not asking again while someone flips
 * between tabs — the answer changes when the hourly sweep lands, not sooner.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { NewListingsResponse } from '@pairlens/shared/instrument-types'

import type { NewListingRow } from '@/lib/new-listings'
import { api } from '@/lib/api'
import { hasAppServer } from '@/lib/auth-client'
import { useNewPools } from '@/hooks/use-pool-stats'
import { mergeNewListings } from '@/lib/new-listings'

/** The window the tab asks for. The server clamps anything past 30 days. */
export const NEW_LISTINGS_DAYS = 14

/** The sweep runs hourly; asking more often than this cannot learn anything. */
const CEX_REFRESH_MS = 10 * 60_000

export type NewListingsFeed = {
  rows: Array<NewListingRow>
  isLoading: boolean
  /**
   * The venue half is missing: no App Server in this build, or it refused.
   * The pane notes it in one line rather than pretending the feed is complete.
   */
  cexUnavailable: boolean
  /** Every chain refused. Null while the on-chain half is answering. */
  dexError: string | null
  /** When first-seen tracking began. Null without the venue half. */
  trackingSince: number | null
}

export function useNewListings(enabled = true): NewListingsFeed {
  const cex = useQuery({
    queryKey: ['new-listings', NEW_LISTINGS_DAYS],
    queryFn: (): Promise<NewListingsResponse> =>
      api.getNewListings(NEW_LISTINGS_DAYS),
    enabled: enabled && hasAppServer,
    staleTime: CEX_REFRESH_MS,
    gcTime: 30 * 60_000,
    retry: false,
  })

  const dex = useNewPools(undefined, enabled)

  const rows = useMemo(
    () => mergeNewListings(cex.data?.entries ?? [], dex.pools),
    [cex.data, dex.pools],
  )

  return {
    rows,
    // Loading while EITHER half is still out: a list that grows a second
    // later reorders under the cursor, and the skeleton is cheaper than that.
    isLoading: enabled && (dex.isLoading || (hasAppServer && cex.isPending)),
    cexUnavailable: !hasAppServer || cex.isError,
    dexError: dex.error,
    trackingSince: cex.data?.trackingSince ?? null,
  }
}
