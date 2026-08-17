// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { EVM_CHAINS } from './chains'
import {
  clearTokenCaches,
  getTopTokens,
  resolveToken,
  searchTokens,
} from './token-client'
import { executeSwap, getRoute, scaleAmount } from './swap-executor'
import { fetchGasPriceWei, quoteSwapRoute } from './route-preview'
import { fetchLpPositions, isEvmAddress } from './lp-client'
import {
  cancelLimitOrder,
  createLimitOrder,
  listLimitOrders,
} from './limit-order-client'
import { fetchBalances } from './balance-client'
import type { EvmChainConfig } from './chains'
import type { Instrument } from '@pairlens/market-engine/types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { EvmToken, WalletSlot } from './types'

const CHAIN_GRADIENTS: Record<string, string> = {
  ethereum: 'from-indigo-400 to-purple-500',
  base: 'from-blue-500 to-blue-600',
  arbitrum: 'from-sky-400 to-blue-500',
  bsc: 'from-yellow-400 to-amber-500',
  polygon: 'from-purple-500 to-violet-600',
}

function createEvmDexManifest(chain: EvmChainConfig): PluginManifest {
  return {
    id: `${chain.market}-dex-connector`,
    name: `${chain.displayName} DEX Connector`,
    version: '0.1.0',
    author: 'Pairlens',
    description: `On-chain ${chain.displayName} swaps — best price routing across all ${chain.displayName} DEXs via the KyberSwap aggregator`,
    homepage: 'https://kyberswap.com',
    icon: chain.iconUrl,
    metadata: {
      family: 'dex',
      assetClass: 'dex',
      walletChain: 'ethereum',
      dexLimitOrders: true,
      market: chain.market,
      gradient: CHAIN_GRADIENTS[chain.market] ?? 'from-slate-400 to-slate-500',
      abbr: chain.abbr,
      logoUrl: chain.iconUrl,
    },
    capabilities: [
      {
        id: 'market-data:discovery',
        singleton: false,
        markets: [chain.market],
        priority: 1,
        streaming: false,
      },
      {
        id: 'market-data:discovery:search',
        singleton: false,
        markets: [chain.market],
        priority: 1,
        streaming: false,
      },
      {
        id: 'trading:orders',
        singleton: false,
        markets: [chain.market],
        priority: 1,
        streaming: false,
      },
      {
        id: 'trading:balances',
        singleton: false,
        markets: [chain.market],
        priority: 1,
        streaming: false,
      },
    ],
    config: {
      rpcUrl: {
        type: 'string',
        label: `${chain.displayName} RPC URL`,
        required: false,
        default: chain.rpcUrl,
      },
      slippageBps: {
        type: 'number',
        label: 'Default Slippage (bps)',
        required: false,
        default: 100,
      },
    },
  }
}

export const ethereumDexConnectorManifest = createEvmDexManifest(
  EVM_CHAINS['ethereum'],
)
export const baseDexConnectorManifest = createEvmDexManifest(EVM_CHAINS['base'])
export const arbitrumDexConnectorManifest = createEvmDexManifest(
  EVM_CHAINS['arbitrum'],
)
export const bscDexConnectorManifest = createEvmDexManifest(EVM_CHAINS['bsc'])
export const polygonDexConnectorManifest = createEvmDexManifest(
  EVM_CHAINS['polygon'],
)

/**
 * Token-arm identity: every discovery row carries the exact contract
 * address it displayed, so selection can pin `(chain, address)` and never
 * re-resolve by symbol (see-what-you-trade). `chain.market` doubles as the
 * token-directory network slug ('ethereum' | 'base' | ...).
 */
function toInstrument(token: EvmToken, chain: EvmChainConfig): Instrument {
  return {
    id: `${token.symbol}-${chain.quote.symbol}`,
    kind: 'token',
    chain: chain.market,
    address: token.address,
    decimals: token.decimals,
    market: chain.market,
    symbol: `${token.symbol}/${chain.quote.symbol}`,
    name: `${token.name} / ${chain.quote.symbol}`,
    base: token.symbol,
    quote: chain.quote.symbol,
    assetClass: 'dex',
    categories: [],
    rank: 100_000,
    featured: false,
  }
}

export function createEvmDexConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const market = String(manifest.metadata?.['market'] ?? '')
  const chain = EVM_CHAINS[market]
  if (!chain) {
    throw new Error(`evm-dex-connector: unknown market '${market}'`)
  }

  const walletSlots = new Map<string, WalletSlot>()
  let rpcUrl = chain.rpcUrl
  let defaultSlippageBps = 100

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
      const tokens = await getTopTokens(chain, 100)
      const instruments = tokens
        .filter(
          (t) => t.symbol.toUpperCase() !== chain.quote.symbol.toUpperCase(),
        )
        .map((t) => toInstrument(t, chain))
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
      const tokens = await searchTokens(chain, query, 50)
      const items = tokens
        .filter(
          (t) => t.symbol.toUpperCase() !== chain.quote.symbol.toUpperCase(),
        )
        .map((t) => toInstrument(t, chain))
      return { items, total: items.length, hasMore: false }
    }

    if (capability === 'trading:orders') {
      const action = String(p['action'] ?? 'place')

      // ── Read-only actions, before anything touches a wallet slot ──
      // A quote and a gas price are what the route pane, the impact tiers and
      // the chain ladder read, and none of them has (or should need) an
      // account. Both paths end at data: no approval, no calldata, no key.
      if (action === 'quote') {
        return quoteSwapRoute({
          chain,
          pair: String(p['pair'] ?? ''),
          side: String(p['side'] ?? 'buy') === 'sell' ? 'sell' : 'buy',
          size: String(p['size'] ?? '0'),
        })
      }

      if (action === 'gas') {
        const wei = await fetchGasPriceWei(rpcUrl)
        return {
          market: chain.market,
          nativeSymbol: chain.nativeSymbol,
          gasPriceWei: wei === null ? null : wei.toString(),
        }
      }

      // Concentrated-liquidity positions for an address. An action rather than
      // the `trading:positions` capability on purpose: every consumer of that
      // id reads a `NormalizedPosition` (entry price, leverage, liquidation),
      // and an LP position has none of those — declaring it would make the next
      // generic positions pane wrong instead of empty. See the wire types in
      // `@pairlens/shared/instrument-types`.
      //
      // The owner is a parameter and falls back to the wallet slot. Only the
      // ADDRESS is involved either way: public chain state, no key, and the
      // panes have to work while the vault is still sealed.
      if (action === 'lp-positions') {
        const requested = p['owner']
        const slot = getSlot(params)
        const owner = isEvmAddress(requested)
          ? requested
          : (slot?.address ?? '')
        return fetchLpPositions({
          chain,
          owner,
          rpcUrl: slot?.rpcUrl ?? rpcUrl,
          pair: typeof p['pair'] === 'string' ? p['pair'] : null,
          cap: typeof p['cap'] === 'number' ? p['cap'] : undefined,
        })
      }

      if (action === 'list') {
        // Market swaps are atomic, but resting KyberSwap limit orders
        // persist — surface them in the orders pane.
        const slot = getSlot(params)
        if (!slot) return { open: [], history: [] }
        return listLimitOrders(chain, slot.address)
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
        return cancelLimitOrder({
          chain,
          orderId,
          walletAddress: slot.address,
          getPrivateKey: cancelKey,
        })
      }

      const slot = getSlot(params)
      if (!slot) {
        return {
          success: false,
          error: p['walletId']
            ? `Unknown wallet '${String(p['walletId'])}'`
            : 'No wallet configured',
        }
      }
      const getKey = slot.getPrivateKey
      if (!getKey) {
        return { success: false, error: 'Wallet key retriever not configured' }
      }

      const pair = String(p['pair'] ?? '')
      const side = String(p['side'] ?? 'buy') as 'buy' | 'sell'
      const size = String(p['size'] ?? '0')
      const slippageBps =
        typeof p['slippageBps'] === 'number'
          ? p['slippageBps']
          : slot.slippageBps

      const [base, quote] = pair.split('-')
      if (!base || !quote) {
        return { success: false, error: `Invalid pair: ${pair}` }
      }

      if (String(p['type'] ?? 'market') === 'limit') {
        const price = String(p['price'] ?? '')
        if (!(Number(price) > 0)) {
          return { success: false, error: 'Limit orders require a price' }
        }
        return createLimitOrder({
          chain,
          pair,
          side,
          size,
          price,
          walletAddress: slot.address,
          getPrivateKey: getKey,
          rpcUrl: slot.rpcUrl,
        })
      }

      const baseToken = await resolveToken(chain, base)
      const quoteToken = await resolveToken(chain, quote)
      if (!baseToken || !quoteToken) {
        return { success: false, error: `Cannot resolve pair: ${pair}` }
      }

      // Size is denominated in the INPUT token: buy spends quote, sell
      // spends base (mirrors the Jupiter connector contract).
      const inputToken = side === 'buy' ? quoteToken : baseToken
      const outputToken = side === 'buy' ? baseToken : quoteToken
      const amountIn = scaleAmount(size, inputToken.decimals)
      if (amountIn <= 0n) {
        return { success: false, error: `Invalid size: ${size}` }
      }

      const route = await getRoute(
        chain,
        inputToken.address,
        outputToken.address,
        amountIn,
      )
      if (!route) {
        return {
          success: false,
          error: `No route found for ${pair} on ${chain.displayName}`,
        }
      }

      return executeSwap({
        chain,
        route,
        walletAddress: slot.address,
        getPrivateKey: getKey,
        rpcUrl: slot.rpcUrl,
        slippageBps,
      })
    }

    if (capability === 'trading:balances') {
      const slot = getSlot(params)
      if (!slot) return []

      // Make sure the on-screen pair's tokens are included in the scan
      const extraTokens: Array<EvmToken> = []
      const pair = typeof p['pair'] === 'string' ? p['pair'] : ''
      if (pair.includes('-')) {
        const [base, quote] = pair.split('-')
        for (const leg of [base, quote]) {
          if (!leg) continue
          const token = await resolveToken(chain, leg)
          if (token) extraTokens.push(token)
        }
      }

      return fetchBalances(chain, slot.address, slot.rpcUrl, extraTokens)
    }

    return null
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,

    async initialize(config: Record<string, unknown>) {
      if (typeof config['rpcUrl'] === 'string' && config['rpcUrl'])
        rpcUrl = config['rpcUrl']
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
      clearTokenCaches()
    },
  }
}
