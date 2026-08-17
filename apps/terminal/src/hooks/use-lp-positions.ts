// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A wallet's concentrated-liquidity positions, one query per chain.
 *
 * "Accounts" here are CHAINS, not credentials: the DEX family signs with a
 * single EVM key that is valid on all five chains, so what varies per query is
 * the connector being asked, and the address is the same everywhere. That is
 * also why only the address travels — a position read is public chain state and
 * must work with the vault sealed, so nothing on this path can ask for a key.
 *
 * Per chain rather than one fan-out, for the reason the futures pane learned:
 * a single query is only as fast as its slowest RPC, and its cache key is the
 * whole chain list, so installing a sixth connector blanked the rows that had
 * already arrived. Per chain, Base lands while Ethereum is still answering, and
 * an RPC that times out becomes one error row next to five working ones.
 *
 * The cadence is deliberately slow. An LP position changes when the pool price
 * moves through it, and the numbers that move — composition and claimable fees
 * — are recomputed from a fresh `slot0` on each refresh, not streamed. A socket
 * per position would buy re-renders and a rate-limited public RPC.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { LpPositionsResponse } from '@pairlens/shared/instrument-types'

import { useDexChains } from '@/hooks/use-dex-chains'
import { useDexConnectors } from '@/hooks/use-swap-route'
import { getCountrySetting } from '@/lib/region-settings'

/** Pool price moves; positions do not move fast enough to poll harder. */
const LP_STALE_MS = 45_000
const LP_REFRESH_MS = 60_000

export type LpChain = {
  market: string
  displayName: string
  iconUrl: string
  plugin: PluginInstance
}

export type LpChainResult = {
  chain: LpChain
  response: LpPositionsResponse | null
  /** What the chain said went wrong, verbatim. Never thrown at the pane. */
  error: string | null
}

/**
 * Chains that can answer a position read: an installed connector, and an EVM
 * signing family.
 *
 * Solana is excluded here rather than in the connector because Jupiter is an
 * aggregator with no position manager behind it at all: Orca and Raydium keep
 * liquidity in program accounts, which needs its own client. A chain whose
 * connector IS installed but which has no v3-family deployment answers with an
 * empty response, so the list is allowed to be optimistic.
 */
export function useLpChains(): Array<LpChain> {
  const chains = useDexChains()
  const connectors = useDexConnectors()
  return useMemo(() => {
    const rows: Array<LpChain> = []
    for (const chain of chains) {
      if (!chain.connected || chain.walletChain !== 'ethereum') continue
      const plugin = connectors.get(chain.market)
      if (!plugin) continue
      rows.push({
        market: chain.market,
        displayName: chain.displayName,
        iconUrl: chain.iconUrl,
        plugin,
      })
    }
    return rows
  }, [chains, connectors])
}

export type LpPositionsQuery = {
  results: Array<LpChainResult>
  /** Every position that arrived, chain order preserved. */
  positions: Array<LpPositionsResponse['positions'][number]>
  /** Positions the wallet holds beyond what the per-chain cap enumerated. */
  hiddenByCap: number
  isPending: boolean
  errors: Array<{ chain: string; message: string }>
  refetch: () => void
}

/**
 * `owner` gates everything. With no wallet connected the panes render their
 * connect state and no query runs, so a parked LP workspace with no account
 * costs nothing.
 *
 * `activePair` is passed only to the chain the pair is on. The connector uses it
 * to mark which positions belong to the pool on screen, and asking Base to
 * resolve an Ethereum pair's tickers would answer for a different token.
 */
export function useLpPositions(
  chains: Array<LpChain>,
  owner: string | null,
  activePair: { market: string; pairKey: string } | null,
  enabled = true,
): LpPositionsQuery {
  const query = useQueries({
    queries: chains.map((chain) => {
      const pair =
        activePair && activePair.market === chain.market
          ? activePair.pairKey
          : null
      return {
        queryKey: ['lp-positions', chain.market, owner, pair],
        queryFn: async (): Promise<LpChainResult> => {
          try {
            const response = (await chain.plugin.execute({
              capability: 'trading:orders',
              params: { action: 'lp-positions', owner, pair },
              context: {
                pair: pair ?? '',
                market: chain.market,
                timeframe: '',
                // Nothing on this path is account-scoped, but the connector's
                // context type requires a mode; paper keeps it away from any
                // live-only branch a venue might add later.
                mode: 'paper' as const,
                country: getCountrySetting(),
              },
            })) as LpPositionsResponse | null
            return { chain, response, error: null }
          } catch (err) {
            return {
              chain,
              response: null,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        },
        enabled: Boolean(enabled && owner),
        staleTime: LP_STALE_MS,
        refetchInterval: LP_REFRESH_MS,
        gcTime: 5 * 60_000,
        retry: false,
      }
    }),
    combine: (results) => {
      const rows = results
        .map((r) => r.data)
        .filter((d): d is LpChainResult => d != null)
      const errors: Array<{ chain: string; message: string }> = []
      for (const row of rows) {
        if (row.error) {
          errors.push({ chain: row.chain.displayName, message: row.error })
        }
        // The connector's own error rows: a manager whose pinned factory no
        // longer matches, an RPC that refused. Surfaced with the same weight as
        // a thrown one, because to the reader they are the same failure.
        for (const err of row.response?.errors ?? []) {
          errors.push({
            chain: err.manager
              ? `${row.chain.displayName} · ${err.manager}`
              : row.chain.displayName,
            message: err.message,
          })
        }
      }
      return {
        results: rows,
        positions: rows.flatMap((row) => row.response?.positions ?? []),
        // Against `listable`, never against `totalFound`: a wallet that has
        // ever provided liquidity holds a spent NFT per closed position, and
        // counting those as hidden would claim 34 missing rows on a wallet with
        // three live ranges.
        hiddenByCap: rows.reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              (row.response?.listable ?? 0) -
                (row.response?.positions.length ?? 0),
            ),
          0,
        ),
        isPending: results.length > 0 && results.every((r) => r.isPending),
        errors,
        refetch: () => {
          for (const r of results) void r.refetch()
        },
      }
    },
  })

  return query
}

/**
 * Order the rows the way the panes read them: this pool first, then this chain,
 * then everything else.
 *
 * Sorted on data refresh only, and the tail comparator is on identity
 * (`market`, then `tokenId`) rather than on a value, so rows keep their place
 * between refreshes instead of reshuffling as prices move.
 */
export function sortLpPositions<
  T extends { market: string; tokenId: string; matchesPair: boolean | null },
>(positions: Array<T>, activeMarket: string | undefined): Array<T> {
  return positions.slice().sort((a, b) => {
    const matchA = a.matchesPair === true ? 0 : 1
    const matchB = b.matchesPair === true ? 0 : 1
    if (matchA !== matchB) return matchA - matchB
    const chainA = a.market === activeMarket ? 0 : 1
    const chainB = b.market === activeMarket ? 0 : 1
    if (chainA !== chainB) return chainA - chainB
    if (a.market !== b.market) return a.market < b.market ? -1 : 1
    return a.tokenId.localeCompare(b.tokenId, 'en')
  })
}
