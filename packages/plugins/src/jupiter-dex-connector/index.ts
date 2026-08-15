// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  clearTokenCache,
  getTopTokens,
  resolvePairMints,
  resolveToken,
  searchTokens,
} from './token-registry'
import { executeSwap, getQuote } from './swap-executor'
import {
  cancelTriggerOrder,
  createTriggerOrder,
  listTriggerOrders,
} from './trigger-client'
import { fetchBalances } from './balance-client'
import type { Instrument } from '@pairlens/market-engine/types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { JupiterToken, WalletSlot } from './types'

/**
 * Token-arm identity: every discovery row carries the exact mint it
 * displayed, so selection can pin `(solana, address)` and never re-resolve
 * by symbol (see-what-you-trade).
 */
function toInstrument(t: JupiterToken): Instrument {
  return {
    id: `${t.symbol}-USDC`,
    kind: 'token',
    chain: 'solana',
    address: t.address,
    decimals: t.decimals,
    market: 'jupiter',
    symbol: `${t.symbol}/USDC`,
    name: `${t.name} / USD Coin`,
    base: t.symbol,
    quote: 'USDC',
    assetClass: 'dex',
    categories: [],
    rank: 100_000,
    featured: false,
  }
}

export const jupiterDexConnectorManifest: PluginManifest = {
  id: 'jupiter-dex-connector',
  name: 'Jupiter DEX Connector',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Solana DEX aggregator — best price routing across all Solana DEXs',
  homepage: 'https://jup.ag',
  icon: 'https://cryptologos.cc/logos/jupiter-ag-jup-logo.png?v=040',
  metadata: {
    family: 'dex',
    assetClass: 'dex',
    walletChain: 'solana',
    dexLimitOrders: true,
    gradient: 'from-emerald-400 to-teal-500',
    abbr: 'JUP',
    logoUrl: 'https://cryptologos.cc/logos/jupiter-ag-jup-logo.png?v=040',
  },
  capabilities: [
    {
      id: 'market-data:discovery',
      singleton: false,
      markets: ['jupiter'],
      priority: 1,
      streaming: false,
    },
    {
      id: 'market-data:discovery:search',
      singleton: false,
      markets: ['jupiter'],
      priority: 1,
      streaming: false,
    },
    {
      id: 'trading:orders',
      singleton: false,
      markets: ['jupiter'],
      priority: 1,
      streaming: false,
    },
    {
      id: 'trading:balances',
      singleton: false,
      markets: ['jupiter'],
      priority: 1,
      streaming: false,
    },
  ],
  config: {
    rpcUrl: {
      type: 'string',
      label: 'Solana RPC URL',
      required: false,
      default: 'https://api.mainnet-beta.solana.com',
    },
    slippageBps: {
      type: 'number',
      label: 'Default Slippage (bps)',
      required: false,
      default: 50,
    },
  },
}

export function createJupiterDexConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const walletSlots = new Map<string, WalletSlot>()

  // Default config
  let rpcUrl = 'https://api.mainnet-beta.solana.com'
  let defaultSlippageBps = 50

  function getSlot(params: PluginExecuteParams): WalletSlot | null {
    const walletId = params.params['walletId'] as string | undefined
    // Fail closed: a provided-but-unknown walletId must never fall
    // back to another slot — an order could hit the wrong account/mode.
    if (walletId) return walletSlots.get(walletId) ?? null
    const first = walletSlots.values().next()
    return first.done ? null : first.value
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params

    if (capability === 'market-data:discovery') {
      const offset = typeof p['offset'] === 'number' ? p['offset'] : 0
      const limit = typeof p['limit'] === 'number' ? p['limit'] : 50
      const tokens = await getTopTokens(200)
      const instruments: Array<Instrument> = []
      // Generate {token}/USDC pairs for discovery (USDC is the canonical quote).
      // If the token fetch failed this list is empty and discovery returns an
      // empty page rather than throwing.
      for (const t of tokens) {
        if (t.symbol.toUpperCase() === 'USDC') continue
        instruments.push(toInstrument(t))
      }
      const page = instruments.slice(offset, offset + limit)
      return {
        items: page,
        total: instruments.length,
        hasMore: offset + limit < instruments.length,
      }
    }

    if (capability === 'market-data:discovery:search') {
      const query = String(p['q'] ?? p['query'] ?? '')
      if (!query) return { items: [], total: 0, hasMore: false }

      const tokens = await searchTokens(query, 50)
      const items = tokens.map((t) => toInstrument(t))
      return { items, total: items.length, hasMore: false }
    }

    if (capability === 'trading:orders') {
      const action = String(p['action'] ?? 'place')

      if (action === 'list') {
        // Market swaps are atomic, but resting Trigger (limit) orders
        // persist on-chain — surface them in the orders pane.
        const slot = getSlot(params)
        if (!slot) return { open: [], history: [] }
        return listTriggerOrders(slot.address)
      }

      if (action === 'cancel') {
        const slot = getSlot(params)
        if (!slot) {
          return {
            success: false,
            error: p['walletId']
              ? `Unknown wallet '${String(p['walletId'])}'`
              : 'No wallet configured',
          }
        }
        const cancelKey = slot.getPrivateKey
        if (!cancelKey) {
          return {
            success: false,
            error: 'Wallet key retriever not configured',
          }
        }
        const orderId = String(p['orderId'] ?? '')
        if (!orderId) return { success: false, error: 'Missing orderId' }
        return cancelTriggerOrder({
          order: orderId,
          walletAddress: slot.address,
          getPrivateKey: cancelKey,
        })
      }

      // Place order (market swap or resting limit order)
      const slot = getSlot(params)
      if (!slot) {
        return {
          success: false,
          error: p['walletId']
            ? `Unknown wallet '${String(p['walletId'])}'`
            : 'No wallet configured',
        }
      }

      const pair = String(p['pair'] ?? '')
      const side = String(p['side'] ?? 'buy') as 'buy' | 'sell'
      const size = String(p['size'] ?? '0')
      const slippageBps =
        typeof p['slippageBps'] === 'number'
          ? p['slippageBps']
          : slot.slippageBps

      const getKey = slot.getPrivateKey
      if (!getKey) {
        return {
          success: false,
          error: 'Wallet key retriever not configured',
        }
      }

      if (String(p['type'] ?? 'market') === 'limit') {
        const price = String(p['price'] ?? '')
        if (!(Number(price) > 0)) {
          return { success: false, error: 'Limit orders require a price' }
        }
        return createTriggerOrder({
          pair,
          side,
          size,
          price,
          walletAddress: slot.address,
          getPrivateKey: getKey,
        })
      }

      // Resolve tokens for mint addresses + decimal scaling
      const mints = await resolvePairMints(pair)
      if (!mints) {
        return { success: false, error: `Cannot resolve pair: ${pair}` }
      }

      // Scale amount to token's smallest unit (e.g. SOL → lamports)
      const [base, quote_] = pair.split('-')
      const inputSymbol = side === 'buy' ? quote_ : base
      const inputToken = await resolveToken(inputSymbol)
      if (!inputToken) {
        return {
          success: false,
          error: `Cannot resolve token: ${inputSymbol}`,
        }
      }
      const scaledAmount = String(
        Math.round(parseFloat(size) * 10 ** inputToken.decimals),
      )

      // Get quote (getQuote validates the response against the request)
      const quote = await getQuote(pair, side, scaledAmount, slippageBps)
      if (!quote) {
        return { success: false, error: 'Failed to get Jupiter quote' }
      }

      // Execute swap
      return executeSwap(quote, slot.address, getKey, slot.rpcUrl)
    }

    if (capability === 'trading:balances') {
      const slot = getSlot(params)
      if (!slot) return []
      return fetchBalances(slot.address, slot.rpcUrl)
    }

    return null
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,

    async initialize(config: Record<string, unknown>) {
      // Update config
      if (typeof config['rpcUrl'] === 'string') rpcUrl = config['rpcUrl']
      if (typeof config['slippageBps'] === 'number')
        defaultSlippageBps = config['slippageBps']
      const getKey =
        typeof config['getPrivateKey'] === 'function'
          ? (config['getPrivateKey'] as (id: string) => Promise<string | null>)
          : null

      // Wallet provisioning — create slot. The key accessor from THIS
      // initialize call is bound to THIS wallet id only; later
      // provisioning calls never re-point existing slots.
      const walletId = config['walletId'] as string | undefined
      const address = config['address'] as string | undefined
      if (walletId && address) {
        walletSlots.set(walletId, {
          walletId,
          address,
          rpcUrl,
          slippageBps: defaultSlippageBps,
          getPrivateKey: getKey ? () => getKey(walletId) : null,
        })
      }
    },

    async destroy() {
      walletSlots.clear()
      clearTokenCache()
    },
  }
}
