// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Solana JSON-RPC as a capability, with Helius as its first provider.
 *
 * Every Solana surface in the terminal — balances, swap sends, resting trigger
 * orders, and now LP positions — needs a node, and until now each of them was
 * pointed at the public one by a hardcoded default. That default is the reason
 * a Solana wallet intermittently reads as empty: `api.mainnet-beta.solana.com`
 * sheds load with a bare 403 and no `Retry-After`.
 *
 * So the endpoint became a capability instead of a constant. `rpc:solana` has
 * exactly two actions and no venue knowledge, which is what makes it
 * provider-pluggable: a user who prefers QuickNode or their own validator
 * installs a plugin declaring the same id at a lower priority number and every
 * Solana read in the terminal follows, with no connector change.
 *
 * BYOK, and keyless still works. Without a key this plugin answers with the
 * public node and says so in `provider` — a clearly degraded mode, not a
 * refusal, because a fresh install must still be able to read a wallet.
 */
import {
  createEndpointLimiter,
  resolveEndpoint,
  solanaRpcCall,
} from './rpc-client'
import type { SolanaRpcEndpoint } from './rpc-client'
import type { RequestLimiter } from '@pairlens/market-engine/request-limiter'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const heliusRpcProviderManifest: PluginManifest = {
  id: 'helius-rpc-provider',
  name: 'Helius Solana RPC',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Solana JSON-RPC through Helius. Add your own key for a reliable node; without one it falls back to the public endpoint.',
  homepage: 'https://helius.dev',
  icon: '/posters/helius-rpc-provider.png',
  metadata: {
    family: 'dex',
    gradient: 'from-orange-400 to-amber-500',
    abbr: 'RPC',
  },
  capabilities: [
    {
      id: 'rpc:solana',
      singleton: false,
      // The Solana market id in the chain catalog. One market, because this
      // plugin knows one network.
      markets: ['jupiter'],
      priority: 5,
      streaming: false,
    },
  ],
  config: {
    apiKey: {
      type: 'secret',
      label: 'Helius API Key',
      // Deliberately optional. A required key would refuse activation, and a
      // keyless terminal would then have no `rpc:solana` provider at all —
      // which is worse than the public node it would otherwise use.
      required: false,
    },
  },
}

export function createHeliusRpcProviderPlugin(
  manifest: PluginManifest,
): PluginInstance {
  let endpoint: SolanaRpcEndpoint = resolveEndpoint(null)
  let limiter: RequestLimiter = createEndpointLimiter(endpoint.provider)

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params
    if (capability !== 'rpc:solana') {
      throw new Error(
        `helius-rpc-provider: unsupported capability '${capability}'`,
      )
    }

    const action = String(p['action'] ?? 'call')

    // The URL, API KEY INCLUDED.
    //
    // Consumed by first-party wiring only: the terminal resolves this once and
    // hands it to the Solana connectors as their `rpcUrl`, so a swap send and
    // an LP read ride the same node the user paid for. It is NOT a general
    // read — anything that only needs to ask the chain a question should use
    // `call` below, which never exposes the key and is paced. `rpc:solana` is
    // denied to the community plugin tier for this reason.
    if (action === 'endpoint') {
      return { url: endpoint.url, provider: endpoint.provider }
    }

    if (action === 'call') {
      const method = String(p['method'] ?? '')
      if (!method) throw new Error('rpc:solana call requires a method')
      const rpcParams = Array.isArray(p['params'])
        ? (p['params'] as Array<unknown>)
        : []
      return solanaRpcCall({ endpoint, limiter, method, params: rpcParams })
    }

    throw new Error(`helius-rpc-provider: unknown action '${action}'`)
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,

    async initialize(config: Record<string, unknown>) {
      const apiKey =
        typeof config['apiKey'] === 'string' ? config['apiKey'] : null
      const next = resolveEndpoint(apiKey)
      // The limiter is rebuilt only when the PROVIDER changes: its window is
      // the endpoint's budget, and re-creating it on every re-activation would
      // hand a fresh full budget to whatever was already being throttled.
      if (next.provider !== endpoint.provider) {
        limiter = createEndpointLimiter(next.provider)
      }
      endpoint = next
    },
  }
}
