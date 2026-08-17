// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which Solana node the terminal's Solana code talks to.
 *
 * The Jupiter connector takes an `rpcUrl` and, left alone, defaults to the
 * public mainnet node. That default is why a Solana wallet intermittently reads
 * as empty: `api.mainnet-beta.solana.com` sheds load with a bare 403. So the
 * endpoint is resolved from the `rpc:solana` capability instead, and the same
 * URL serves every Solana read AND every send — balances, resting trigger
 * orders, LP positions, swap submission. One provider, one budget, one place a
 * user's own key takes effect.
 *
 * FIRST-PARTY ONLY, deliberately. `endpoint` hands back a URL with the user's
 * API key in it, which is why the capability is denied to the community plugin
 * tier and why this module is the single caller: everything else that needs to
 * ask the chain a question should go through the capability's `call` action,
 * which is paced and never exposes the key.
 *
 * The plugin is resolved directly rather than through `pluginManager.execute`.
 * That helper walks a fallback chain on error and reads a shared mutable market
 * context, and neither is wanted here: if the resolved provider cannot answer,
 * the honest result is "no endpoint" and the connector keeps its own default.
 */
import type { PluginManager } from '@pairlens/plugin-system'

import { getCountrySetting } from '@/lib/region-settings'

/** The Solana market id in the chain catalog. */
const SOLANA_MARKET = 'jupiter'

export type SolanaRpcEndpoint = {
  /** Full JSON-RPC URL, API key embedded. Never logged, never persisted. */
  url: string
  /** Provider id, so the UI can say which node is answering. */
  provider: string
}

/**
 * Resolve the endpoint, or null when nothing provides one.
 *
 * Null is a real answer: a deployment that excluded the `dex` family has no
 * `rpc:solana` provider at all, and the connector's own default is then the
 * right behaviour rather than a failure. `https` is required because the only
 * thing that would arrive over plaintext here is a mistake or a downgrade, and
 * a swap gets submitted through this URL.
 */
export async function resolveSolanaRpcEndpoint(
  pluginManager: PluginManager,
): Promise<SolanaRpcEndpoint | null> {
  const plugin = pluginManager.getPluginForCapability(
    'rpc:solana',
    SOLANA_MARKET,
  )
  if (!plugin) return null
  try {
    const result = (await plugin.execute({
      capability: 'rpc:solana',
      params: { action: 'endpoint' },
      context: {
        pair: '',
        market: SOLANA_MARKET,
        timeframe: '',
        // Nothing on this path is account-scoped; paper keeps it clear of any
        // live-only branch a provider might add later.
        mode: 'paper' as const,
        country: getCountrySetting(),
      },
    })) as Partial<SolanaRpcEndpoint> | null
    const url = result?.url
    if (typeof url !== 'string' || !url.startsWith('https://')) return null
    return { url, provider: String(result?.provider ?? plugin.manifest.id) }
  } catch {
    return null
  }
}
