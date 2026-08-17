// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Cross-chain transfers through the LI.FI aggregator: quotes, execution and
 * transfer tracking for the five EVM chains the terminal trades.
 *
 * Split across two capabilities on purpose. `market-data:bridge` quotes a route
 * and polls a transfer's status; both are public reads that must work with the
 * vault sealed and no wallet connected, because a user comparing chains has not
 * decided to move anything yet. `trading:bridge` signs, is declared
 * `sideEffect: true` so the plugin manager never retries it against another
 * plugin, and refuses everything it cannot verify (see `bridge-executor.ts`).
 *
 * The wallet is the EVM connectors' wallet: the manifest declares
 * `walletChain: 'ethereum'`, which is what the terminal's wallet provisioning
 * matches on, so the same key that swaps on Base bridges out of it with no
 * second connect step and no second copy of the private key.
 *
 * The RPC is the chain's own default rather than a config field per chain. A
 * transfer is sent on the market's canonical endpoint, the one already pinned in
 * the desktop CSP, and a user who wants their own endpoint sets it where the
 * rest of that chain's transactions are built: on the chain's DEX connector.
 */
import { BRIDGE_MARKETS, isRefused, refuse, resolveBridgeRoute } from './routes'
import { fetchBridgeRoute } from './quote-client'
import { fetchBridgeStatus } from './status-client'
import { acceptableRequote, executeBridgeTransfer } from './bridge-executor'
import { resolveBridgeToken } from './tokens'
import { setLifiApiKey } from './rate-limiter'
import type { BridgeToken } from './tokens'
import type { EvmChainConfig } from '../evm-dex-connector/chains'
import type {
  BridgeExecutionResult,
  BridgeQuoteResponse,
  BridgeRouteRefused,
} from '@pairlens/shared/instrument-types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

/** Default tolerance for the signing-time re-quote, in basis points. */
const DEFAULT_REQUOTE_TOLERANCE_BPS = 50

export const lifiBridgeConnectorManifest: PluginManifest = {
  id: 'lifi-bridge-connector',
  name: 'LI.FI Bridge',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Move one asset between Ethereum, Base, Arbitrum, BNB Chain and Polygon. Quotes the best bridge for the size, states the fee, the source gas and the time to land, and tracks the transfer until it arrives. Signs with the EVM wallet you already connected.',
  homepage: 'https://li.fi',
  metadata: {
    family: 'dex',
    assetClass: 'dex',
    // One EVM key covers every EVM chain, which is what the terminal's wallet
    // provisioning matches on to hand this plugin a slot.
    walletChain: 'ethereum',
  },
  capabilities: [
    {
      id: 'market-data:bridge',
      singleton: false,
      markets: BRIDGE_MARKETS,
      priority: 5,
      streaming: false,
    },
    {
      id: 'trading:bridge',
      singleton: false,
      markets: BRIDGE_MARKETS,
      priority: 5,
      streaming: false,
      sideEffect: true,
    },
  ],
  config: {
    apiKey: {
      type: 'secret',
      label: 'LI.FI API Key (optional)',
      required: false,
    },
  },
}

/** Both ends of a resolved route: the chains, and the asset on each of them. */
type BridgeLegs = {
  from: EvmChainConfig
  to: EvmChainConfig
  fromToken: BridgeToken
  toToken: BridgeToken
}

/** A wallet the terminal has provisioned, and the key accessor bound to it. */
type WalletSlot = {
  walletId: string
  address: string
  getPrivateKey: (() => Promise<string | null>) | null
}

function param(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function createLifiBridgeConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const walletSlots = new Map<string, WalletSlot>()

  function getSlot(params: PluginExecuteParams): WalletSlot | null {
    const walletId = params.params['walletId'] as string | undefined
    // Fail closed, exactly as the swap path does: a provided-but-unknown
    // walletId must never fall back to another slot, or a transfer could be
    // signed by an account the user did not choose.
    if (walletId) return walletSlots.get(walletId) ?? null
    const first = walletSlots.values().next()
    return first.done ? null : first.value
  }

  /** Resolve both legs of a route, or the refusal that names the bad one. */
  async function resolveLegs(
    fromMarket: string,
    toMarket: string,
    symbol: string,
  ): Promise<BridgeLegs | BridgeRouteRefused> {
    if (!symbol) return refuse('unknown-token', fromMarket, symbol)
    const route = resolveBridgeRoute(fromMarket, toMarket)
    if (isRefused(route)) return route

    const fromToken = await resolveBridgeToken(route.from, symbol)
    if (!fromToken) return refuse('unknown-token', route.from.market, symbol)
    // The destination leg is resolved by TICKER on its own chain, never by
    // reusing the source contract: the same address on another chain is a
    // different asset, or nothing at all.
    const toToken = await resolveBridgeToken(route.to, fromToken.symbol)
    if (!toToken) {
      return refuse('unknown-token', route.to.market, fromToken.symbol)
    }
    return { from: route.from, to: route.to, fromToken, toToken }
  }

  async function quote(
    params: PluginExecuteParams,
    address: string,
  ): Promise<BridgeQuoteResponse> {
    const p = params.params
    const fromMarket = param(p, 'fromMarket') || params.context.market
    const legs = await resolveLegs(
      fromMarket,
      param(p, 'toMarket'),
      param(p, 'symbol'),
    )
    if (isRefused(legs)) return legs

    const route = await fetchBridgeRoute({
      from: legs.from,
      to: legs.to,
      fromToken: legs.fromToken,
      toToken: legs.toToken,
      amount: param(p, 'amount') || '0',
      address,
    })
    return isRefused(route) ? route : route.quote
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params
    const action = param(p, 'action')

    if (capability === 'market-data:bridge') {
      if (action === 'status') {
        const txHash = param(p, 'txHash')
        if (!txHash) throw new Error('bridge status requires a txHash')
        return fetchBridgeStatus(txHash)
      }
      if (action === 'quote' || action === '') {
        // A quote needs an address to build calldata for, and the slot's is the
        // right one when there is a wallet. With none connected the pane still
        // gets a price: LI.FI accepts any address for a read, and the burn
        // address is the honest placeholder — it is never the address a
        // transfer is signed with, because `execute` re-quotes for the slot.
        const slot = getSlot(params)
        const address =
          param(p, 'address') ||
          slot?.address ||
          '0x000000000000000000000000000000000000dEaD'
        return quote(params, address)
      }
      throw new Error(`Unsupported bridge action '${action}'`)
    }

    if (capability === 'trading:bridge') {
      if (action !== 'execute') {
        return {
          success: false,
          error: `Unsupported bridge action '${action}'`,
        } satisfies BridgeExecutionResult
      }
      const slot = getSlot(params)
      if (!slot) {
        return {
          success: false,
          error: p['walletId']
            ? `Unknown wallet '${String(p['walletId'])}'`
            : 'No wallet configured',
        } satisfies BridgeExecutionResult
      }
      const getKey = slot.getPrivateKey
      if (!getKey) {
        return {
          success: false,
          error: 'Wallet key retriever not configured',
        } satisfies BridgeExecutionResult
      }

      const legs = await resolveLegs(
        param(p, 'fromMarket') || params.context.market,
        param(p, 'toMarket'),
        param(p, 'symbol'),
      )
      if (isRefused(legs)) {
        return {
          success: false,
          error: 'This route cannot be bridged.',
        } satisfies BridgeExecutionResult
      }

      // Re-quote for the slot's own address. Nothing the pane sent is signed;
      // what it sent is an intent, and the floor it agreed to.
      const route = await fetchBridgeRoute({
        from: legs.from,
        to: legs.to,
        fromToken: legs.fromToken,
        toToken: legs.toToken,
        amount: param(p, 'amount') || '0',
        address: slot.address,
      })
      if (isRefused(route)) {
        return {
          success: false,
          error: 'The bridge has no route for this transfer any more.',
        } satisfies BridgeExecutionResult
      }

      const accepted = p['acceptedAmountOutMin']
      const tolerance =
        typeof p['maxSlippageBps'] === 'number'
          ? p['maxSlippageBps']
          : DEFAULT_REQUOTE_TOLERANCE_BPS
      const check = acceptableRequote({
        accepted: typeof accepted === 'number' ? accepted : 0,
        requoted: route.quote.amountOutMin,
        maxSlippageBps: tolerance,
      })
      if (!check.ok) {
        return {
          success: false,
          error: check.error,
        } satisfies BridgeExecutionResult
      }

      return executeBridgeTransfer({
        chain: legs.from,
        route,
        walletAddress: slot.address,
        getPrivateKey: getKey,
        rpcUrl: legs.from.rpcUrl,
      })
    }

    return null
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,

    async initialize(config: Record<string, unknown>) {
      // Merge, never reset: this runs once for the plugin's own config and again
      // for every wallet the terminal provisions, and the second call carries no
      // API key.
      if (typeof config['apiKey'] === 'string') {
        setLifiApiKey(config['apiKey'])
      }
      const getKey =
        typeof config['getPrivateKey'] === 'function'
          ? (config['getPrivateKey'] as (id: string) => Promise<string | null>)
          : null
      const walletId = config['walletId'] as string | undefined
      const address = config['address'] as string | undefined
      if (walletId && address) {
        // The accessor from THIS call is bound to THIS wallet id only; a later
        // provisioning never re-points an existing slot.
        walletSlots.set(walletId, {
          walletId,
          address,
          getPrivateKey: getKey ? () => getKey(walletId) : null,
        })
      }
    },

    // Nothing streams: quotes are pulled by the pane's own query and transfer
    // status is polled by the tracker, so this plugin owns no socket.
    subscribe: () => () => {},

    async destroy() {
      walletSlots.clear()
      setLifiApiKey(null)
    },
  }
}

export { BRIDGE_MARKETS } from './routes'
