// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Open stock positions, per connected brokerage account.
 *
 * Same shape as the futures hook and for the same reasons: accounts come from
 * the credential store (a broker account is an API key), the query is per
 * account rather than one fan-out, so a second broker landing does not blank
 * the first one's rows, and errors are DATA — "Alpaca said your account is not
 * authorized" is the answer, while an empty array would claim you hold
 * nothing.
 *
 * No per-row price subscription. The broker reports mark, market value and
 * both PnL figures inside the positions payload, so a socket per holding would
 * buy re-renders and nothing else; the chart is one click away for a live
 * price.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { NormalizedPosition } from '@pairlens/market-engine/types'

import { usePairlens } from '@/lib/pairlens-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { useCredentialsStore } from '@/stores/credentials-store'
import { getCountrySetting } from '@/lib/region-settings'
import { venuePluginsFor } from '@/lib/venues/venue-plugins'
import { credentialsForMarket } from '@/lib/venues/credential-alias'

export type EquityAccount = {
  /** Venue market id, e.g. 'alpaca'. */
  market: string
  venueLabel: string
  /** Credential id — the connector's slot key. */
  credentialId: string
  accountLabel: string
  mode: 'paper' | 'live'
  plugin: PluginInstance
}

export type EquityAccountPositions = {
  account: EquityAccount
  positions: Array<NormalizedPosition>
  /** What the broker said went wrong, verbatim. */
  error: string | null
}

/**
 * The first stock venue that can report holdings, credentials aside.
 *
 * Separate from the account list because the two answer different questions: a
 * sealed vault has zero accounts and a perfectly good broker, and telling that
 * user to "connect an account" would send them to enter keys they already own.
 */
export function useEquityTradingVenue(): {
  market: string
  label: string
} | null {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(() => {
    const venue = venuePluginsFor(
      pluginManager.getActivePlugins(),
      'trading:positions',
      'stocks',
    )[0]
    return venue ? { market: venue.market, label: venue.label } : null
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion])
}

export function useEquityAccounts(): Array<EquityAccount> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const { availableMarkets } = useMarketData()
  const credentials = useCredentialsStore((s) => s.credentials)

  return useMemo(() => {
    const venues = venuePluginsFor(
      pluginManager.getActivePlugins(),
      'trading:positions',
      'stocks',
    )
    const accounts: Array<EquityAccount> = []

    for (const { plugin, market, label } of venues) {
      const info = availableMarkets.find((m) => m.marketId === market)
      // The adapter's display name while the venue is streaming, the
      // manifest's while it is merely installed — a position pane has to name
      // an account whose connector has not been reached yet.
      const venueLabel = info?.displayName ?? label
      for (const cred of credentialsForMarket(credentials, market)) {
        accounts.push({
          market,
          venueLabel,
          credentialId: cred.id,
          accountLabel: cred.label,
          mode: cred.mode,
          plugin,
        })
      }
    }
    return accounts
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion, availableMarkets, credentials])
}

export function useEquityPositions(accounts: Array<EquityAccount>) {
  return useQueries({
    queries: accounts.map((account) => ({
      queryKey: [
        'equity-positions',
        account.market,
        account.credentialId,
        account.mode,
      ],
      queryFn: async (): Promise<EquityAccountPositions> => {
        try {
          const result = await account.plugin.execute({
            capability: 'trading:positions',
            params: { credentialId: account.credentialId },
            context: {
              pair: '',
              market: account.market,
              timeframe: '',
              // Paper and live are different accounts on different hosts, so
              // the credential's own mode travels with the read.
              mode: account.mode,
              country: getCountrySetting(),
            },
          })
          return {
            account,
            positions: Array.isArray(result)
              ? (result as Array<NormalizedPosition>)
              : [],
            error: null,
          }
        } catch (err) {
          return {
            account,
            positions: [],
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
      // Holdings move when an order fills, not per tick.
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
    combine: (results) => ({
      data: results
        .map((r) => r.data)
        .filter((d): d is EquityAccountPositions => d != null),
      isPending: results.length > 0 && results.every((r) => r.isPending),
      refetch: () => {
        for (const r of results) void r.refetch()
      },
    }),
  })
}

/**
 * The ticker a stock pair key names: 'NVDA-USD' and 'NVDA' are the same
 * holding.
 *
 * Both spellings are live in the app — the discovery catalog keys stock rows
 * by the bare ticker while the broker's own normalizer emits 'NVDA-USD' — so
 * a pane that compared pair keys directly would find no position on half the
 * routes it can be opened from.
 */
export function equityTickerOf(pairKey: string): string {
  return pairKey.trim().toUpperCase().split(/[-/]/)[0] ?? ''
}
