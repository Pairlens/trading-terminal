// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Open perpetual-futures positions, per connected futures account.
 *
 * "Connected" is simpler here than on the prediction family: every v1 futures
 * venue trades from an API credential, so accounts are enumerated from the
 * credential store alone. The alias fan-out in `market-data-provider` is what
 * makes that true for Binance and KuCoin, whose futures connector is
 * provisioned from the SPOT credential — so the account listed here is keyed
 * on `credentialAlias` where the venue declares one, and on its own market id
 * where it does not (Kraken, whose futures keys are separate from spot).
 *
 * No per-tick subscriptions, by design. Mark price, liquidation price and
 * unrealised PnL all arrive inside the venue's own `fetchPositions` payload,
 * so a socket per row would buy nothing but re-renders. Positions move when an
 * order fills, and the query refetches on that cadence.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { NormalizedPosition } from '@pairlens/market-engine/types'

import { usePairlens } from '@/lib/pairlens-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { useCredentialsStore } from '@/stores/credentials-store'
import { getCountrySetting } from '@/lib/region-settings'
import { futuresPluginsFor } from '@/lib/venues/venue-plugins'
import { credentialsForMarket } from '@/lib/venues/credential-alias'

export type FuturesAccount = {
  /** Venue market id, e.g. 'binance-futures'. */
  market: string
  venueLabel: string
  /** Credential id — the connector's slot key. */
  credentialId: string
  accountLabel: string
  mode: 'paper' | 'live'
  plugin: PluginInstance
}

export type FuturesAccountPositions = {
  account: FuturesAccount
  positions: Array<NormalizedPosition>
  /** What the venue said went wrong, verbatim. */
  error: string | null
}

export function useFuturesAccounts(): Array<FuturesAccount> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const { availableMarkets } = useMarketData()
  const credentials = useCredentialsStore((s) => s.credentials)

  return useMemo(() => {
    const venues = futuresPluginsFor(
      pluginManager.getActivePlugins(),
      'trading:positions',
    )
    const accounts: Array<FuturesAccount> = []

    for (const { plugin, market, label } of venues) {
      const info = availableMarkets.find((m) => m.marketId === market)
      // The adapter's display name when the venue is streaming, the manifest's
      // when it is merely installed — a positions pane must list an account
      // whose connector has not been reached yet.
      const venueLabel = info?.displayName ?? label
      // The shared resolver, not a local re-read of the manifest: a futures
      // venue trades from exactly ONE credential market (its own, or the spot
      // one it aliases), and a local version that accepted both listed a
      // Binance Futures account twice the moment a `binance-futures` key
      // existed alongside the spot one.
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

/**
 * One query PER ACCOUNT, not one over all of them.
 *
 * A single fan-out query is only as fast as its slowest venue, and its cache
 * key is the whole account list — so connecting a second exchange discarded
 * the first one's rows and blanked the pane while a cold venue answered. Per
 * account, each row lands when its own venue answers and survives its
 * neighbours changing.
 */
export function useFuturesPositions(accounts: Array<FuturesAccount>) {
  return useQueries({
    queries: accounts.map((account) => ({
      queryKey: [
        'futures-positions',
        account.market,
        account.credentialId,
        account.mode,
      ],
      queryFn: async (): Promise<FuturesAccountPositions> => {
        try {
          const result = await account.plugin.execute({
            capability: 'trading:positions',
            params: { credentialId: account.credentialId },
            context: {
              pair: '',
              market: account.market,
              timeframe: '',
              // The connector routes paper to the venue's sandbox host, so
              // the credential's own mode has to travel with the read or a
              // paper account would be asked about its live positions.
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
      // Positions move when an order fills, not per tick. Refetched on focus
      // so a fill placed from the ticket shows up without a manual reload.
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
    combine: (results) => ({
      // Rows as they land: a venue still in flight contributes nothing rather
      // than holding the whole pane at its loading state.
      data: results
        .map((r) => r.data)
        .filter((d): d is FuturesAccountPositions => d != null),
      isPending: results.length > 0 && results.every((r) => r.isPending),
      refetch: () => {
        for (const r of results) void r.refetch()
      },
    }),
  })
}
