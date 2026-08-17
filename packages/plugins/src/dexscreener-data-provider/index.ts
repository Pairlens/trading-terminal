// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { chainIdForMarket } from './chains'
import { clearPoolCache } from './pool-resolver'
import { fetchPoolByAddress, fetchPoolStats } from './pool-stats-client'
import type { PoolStatsAction } from '@pairlens/shared/instrument-types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const dexscreenerDataProviderManifest: PluginManifest = {
  id: 'dexscreener-data-provider',
  name: 'DexScreener',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Pool reserves and pool stats from DexScreener. Keyless and CORS-open, so both-side reserves work in a browser. No candles and no ranked pool listings: this provider supplements the others, it does not replace them.',
  homepage: 'https://dexscreener.com',
  metadata: { family: 'dex', assetClass: 'dex' },
  // Priority 7 — last in the pool-stats chain, and reached two different ways.
  //
  // GeckoTerminal (5) answers pool state without per-token reserves, so the
  // manager never walks past it on a healthy day; the terminal's reserve
  // supplement calls this plugin DIRECTLY for the pool the primary already
  // resolved (see apps/terminal/src/hooks/use-pool-stats.ts). Behind DexPaprika
  // (6) rather than in front of it because DexPaprika publishes strictly more on
  // desktop (the 24h buy/sell notional split), and in a browser it is CORS-dead
  // and fails instantly, which puts this provider next in line anyway.
  //
  // Only pool-stats. Declaring candles or a ticker would win a resolution this
  // provider cannot serve: DexScreener publishes no OHLCV at all.
  capabilities: [
    {
      id: 'market-data:pool-stats',
      singleton: false,
      markets: ['*'],
      priority: 7,
      streaming: false,
    },
  ],
  config: {},
}

/**
 * Actions this provider refuses, and why refusing beats answering.
 *
 * DexScreener has no ranked per-chain pool listing, no chain-level aggregate and
 * no swap-by-swap tape. A null here would look like an ANSWER ("this chain has
 * no pools"), which is how an empty rail gets latched; a throw is a failure the
 * plugin manager walks past, and if this provider is the last candidate the
 * message says which read is missing rather than which chain is empty.
 */
function unsupported(action: string): never {
  throw new Error(
    `DexScreener does not publish '${action}'. It serves pool state only.`,
  )
}

export function createDexscreenerDataProviderPlugin(
  manifest: PluginManifest,
): PluginInstance {
  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p, context } = params
    if (capability !== 'market-data:pool-stats') return null

    // `params.market` FIRST, as in the sibling providers: the manager's context
    // carries the terminal's own current venue, which for a pool pane on a
    // second chain is a different chain entirely.
    const market = String(p['market'] ?? context.market ?? '')
    const action = String(p['action'] ?? 'stats') as PoolStatsAction

    if (action !== 'stats') unsupported(action)

    const chainId = chainIdForMarket(market)
    if (!chainId) {
      throw new Error(`DexScreener has no chain id for market '${market}'`)
    }

    // The pool the caller already identified, when it has one. This is the
    // supplement path: no resolution, so the reserves cannot belong to a
    // different pool than the figures they are merged into.
    const poolAddress = p['poolAddress']
    if (typeof poolAddress === 'string' && poolAddress.length > 0) {
      return fetchPoolByAddress(chainId, poolAddress)
    }

    return fetchPoolStats(String(p['pair'] ?? context.pair), market)
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
    // Nothing streams: pool state is polled by the caller's own query, and this
    // provider owns no socket and no poller.
    subscribe: () => () => {},
    async destroy() {
      clearPoolCache()
    },
  }
}
