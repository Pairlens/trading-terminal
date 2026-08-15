// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Open contract positions, per connected prediction account.
 *
 * "Connected" means two different things on this family and both are here: a
 * Kalshi account is an API credential in the keychain, a Polymarket account is
 * a chain wallet. The connector keys its slots by whichever id provisioned it
 * (`credentialId` for keys, `walletId` for wallets) and reads BOTH out of the
 * `credentialId` execute param, so one call shape serves both — the accounts
 * are enumerated differently, addressed identically.
 *
 * The venue's own `error` string is data, not a failure: Polymarket answers
 * "no wallet address" that way, and a caller that turned it into an empty list
 * would tell the user they hold nothing.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { NormalizedPredictionPosition } from '@pairlens/plugins/prediction-connector'

import { usePairlens } from '@/lib/pairlens-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { useCredentialsStore } from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'
import { getCountrySetting } from '@/lib/region-settings'
import { predictionPluginsFor } from '@/lib/predictions/venue-plugins'

export type PredictionAccount = {
  /** Venue market id. */
  market: string
  venueLabel: string
  /** Credential id or wallet id — the connector's slot key either way. */
  accountId: string
  accountLabel: string
  plugin: PluginInstance
}

export type PredictionAccountPositions = {
  account: PredictionAccount
  positions: Array<NormalizedPredictionPosition>
  /** What the venue said went wrong, verbatim. */
  error: string | null
}

export function usePredictionAccounts(): Array<PredictionAccount> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const { availableMarkets } = useMarketData()
  const credentials = useCredentialsStore((s) => s.credentials)
  const wallets = useWalletsStore((s) => s.wallets)

  return useMemo(() => {
    const venues = predictionPluginsFor(
      pluginManager.getActivePlugins(),
      'trading:positions',
    )
    const accounts: Array<PredictionAccount> = []

    for (const { plugin, market, label } of venues) {
      const info = availableMarkets.find((m) => m.marketId === market)
      // The adapter's display name when the venue is streaming, the manifest's
      // when it is merely installed — a positions pane must list an account
      // whose connector has not been reached yet.
      const venueLabel = info?.displayName ?? label
      if (info?.walletChain) {
        for (const wallet of wallets) {
          if (wallet.chain !== info.walletChain) continue
          accounts.push({
            market,
            venueLabel,
            accountId: wallet.id,
            accountLabel: wallet.label,
            plugin,
          })
        }
        continue
      }
      for (const cred of credentials) {
        if (cred.market !== market) continue
        accounts.push({
          market,
          venueLabel,
          accountId: cred.id,
          accountLabel: cred.label,
          plugin,
        })
      }
    }
    return accounts
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [
    pluginManager,
    pluginStateVersion,
    availableMarkets,
    credentials,
    wallets,
  ])
}

export function usePredictionPositions(accounts: Array<PredictionAccount>) {
  const key = accounts.map((a) => `${a.market}:${a.accountId}`).join(',')

  return useQuery({
    queryKey: ['prediction-positions', key],
    queryFn: async (): Promise<Array<PredictionAccountPositions>> => {
      const country = getCountrySetting()
      return Promise.all(
        accounts.map(async (account) => {
          try {
            const result = (await account.plugin.execute({
              capability: 'trading:positions',
              params: { credentialId: account.accountId },
              context: {
                pair: '',
                market: account.market,
                timeframe: '',
                mode: 'paper' as const,
                country,
              },
            })) as {
              positions?: Array<NormalizedPredictionPosition>
              error?: string
            }
            return {
              account,
              positions: Array.isArray(result?.positions)
                ? result.positions
                : [],
              error: result?.error ?? null,
            }
          } catch (err) {
            return {
              account,
              positions: [],
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),
      )
    },
    enabled: accounts.length > 0,
    // Positions move when an order fills, not per tick. Refetched on focus so
    // a fill placed from the ticket shows up without a manual reload.
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
