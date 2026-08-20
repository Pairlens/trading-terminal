// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Cross-chain transfers through the LI.FI aggregator: quotes, execution and
 * transfer tracking across the five EVM chains the terminal trades and Solana.
 *
 * Split across two capabilities on purpose. `market-data:bridge` quotes a route
 * and polls a transfer's status; both are public reads that must work with the
 * vault sealed and no wallet connected, because a user comparing chains has not
 * decided to move anything yet. `trading:bridge` signs, is declared
 * `sideEffect: true` so the plugin manager never retries it against another
 * plugin, and refuses everything it cannot verify (`bridge-executor.ts` for EVM
 * legs, `solana-executor.ts` for Solana ones).
 *
 * TWO wallets, which is what makes a Solana leg possible at all. The manifest
 * declares `walletChain: ['ethereum', 'solana']`, so the terminal provisions
 * this connector with both keys the user has connected, and a slot records
 * which family it belongs to. A route then binds each end to the slot that can
 * sign or receive on that end: an EVM-to-EVM transfer sends to itself, and a
 * cross-family transfer sends from one key to the other, with both addresses
 * anchored into the quote. A missing slot on either end is a refusal, never a
 * fallback to the wrong family's address.
 *
 * The EVM RPC is the chain's own default rather than a config field per chain.
 * The Solana RPC arrives the way every Solana connector's does: the terminal
 * pushes it through `initialize`, already re-pointed at the user's own node if
 * they enrolled one, and the public endpoint is the fallback.
 */
import { BRIDGE_MARKETS, isRefused, refuse, resolveBridgeRoute } from './routes'
import { fetchBridgeRoute } from './quote-client'
import { fetchBridgeStatus } from './status-client'
import { acceptableRequote, executeBridgeTransfer } from './bridge-executor'
import { executeSolanaBridgeTransfer } from './solana-executor'
import { resolveBridgeToken } from './tokens'
import { setLifiApiKey } from './rate-limiter'
import type { BridgeChain, BridgeChainFamily } from './chains'
import type { BridgeToken } from './tokens'
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

/** Public Solana endpoint, used until the terminal pushes a better one. */
const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com'

/**
 * Addresses a quote is priced against when no wallet of that family is
 * connected. LI.FI accepts any address for a read, and each chain's burn
 * address is the honest placeholder: it is never an address a transfer is
 * signed with, because `execute` re-quotes for the wallet slots.
 */
const PROBE_ADDRESS: Record<BridgeChainFamily, string> = {
  evm: '0x000000000000000000000000000000000000dEaD',
  svm: '1nc1nerator11111111111111111111111111111111',
}

export const lifiBridgeConnectorManifest: PluginManifest = {
  id: 'lifi-bridge-connector',
  name: 'LI.FI Bridge',
  version: '0.2.0',
  author: 'Pairlens',
  description:
    'Move one asset between Ethereum, Base, Arbitrum, BNB Chain, Polygon and Solana. Quotes the best bridge for the size, states the fee, the source gas and the time to land, and tracks the transfer until it arrives. Signs with the wallets you already connected, and dry-runs every Solana transfer against the chain before it asks for your key.',
  homepage: 'https://li.fi',
  icon: '/posters/lifi-bridge-connector.png',
  metadata: {
    family: 'dex',
    assetClass: 'dex',
    // Both families. One EVM key covers every EVM chain; Solana signs with its
    // own. The terminal's wallet provisioning matches on this list and hands
    // this plugin a slot per connected wallet whose chain appears in it.
    walletChain: ['ethereum', 'solana'],
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
  from: BridgeChain
  to: BridgeChain
  fromToken: BridgeToken
  toToken: BridgeToken
}

/** A wallet the terminal has provisioned, and the key accessor bound to it. */
type WalletSlot = {
  walletId: string
  address: string
  /** Which signing family this key belongs to. Never inferred from the address. */
  family: BridgeChainFamily
  getPrivateKey: (() => Promise<string | null>) | null
}

function param(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The wallet chain the terminal provisions with, mapped to a signing family.
 *
 * Unknown chains map to null and get no slot: a Bitcoin key must never end up
 * in the EVM slot because the string was not recognised.
 */
function familyOfWalletChain(chain: unknown): BridgeChainFamily | null {
  if (chain === 'ethereum') return 'evm'
  if (chain === 'solana') return 'svm'
  return null
}

export function createLifiBridgeConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  const walletSlots = new Map<string, WalletSlot>()
  let solanaRpcUrl = DEFAULT_SOLANA_RPC

  /**
   * The slot that signs or receives on one family.
   *
   * `walletId` names the SOURCE wallet, so it is only honoured for the family
   * it actually belongs to: a walletId of the wrong family returns null rather
   * than the other family's slot, which is the same fail-closed rule the swap
   * path applies to an unknown id.
   */
  function slotFor(
    family: BridgeChainFamily,
    walletId?: string,
  ): WalletSlot | null {
    if (walletId) {
      const slot = walletSlots.get(walletId)
      return slot && slot.family === family ? slot : null
    }
    for (const slot of walletSlots.values()) {
      if (slot.family === family) return slot
    }
    return null
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
    // different asset, or nothing at all — and across families it is not even
    // the same kind of string.
    const toToken = await resolveBridgeToken(route.to, fromToken.symbol)
    if (!toToken) {
      return refuse('unknown-token', route.to.market, fromToken.symbol)
    }
    return { from: route.from, to: route.to, fromToken, toToken }
  }

  async function quote(
    params: PluginExecuteParams,
  ): Promise<BridgeQuoteResponse> {
    const p = params.params
    const fromMarket = param(p, 'fromMarket') || params.context.market
    const legs = await resolveLegs(
      fromMarket,
      param(p, 'toMarket'),
      param(p, 'symbol'),
    )
    if (isRefused(legs)) return legs

    const walletId = param(p, 'walletId') || undefined
    // Each end priced for the address that would actually be on it. A caller
    // may pass either explicitly (the pane passes the source it has on screen);
    // otherwise the slot answers, and the probe address is the last resort.
    const fromAddress =
      param(p, 'address') ||
      slotFor(legs.from.family, walletId)?.address ||
      PROBE_ADDRESS[legs.from.family]
    const toAddress =
      param(p, 'destinationAddress') ||
      slotFor(legs.to.family)?.address ||
      (legs.to.family === legs.from.family
        ? fromAddress
        : PROBE_ADDRESS[legs.to.family])

    const route = await fetchBridgeRoute({
      from: legs.from,
      to: legs.to,
      fromToken: legs.fromToken,
      toToken: legs.toToken,
      amount: param(p, 'amount') || '0',
      fromAddress,
      toAddress,
    })
    return isRefused(route) ? route : route.quote
  }

  async function send(
    params: PluginExecuteParams,
  ): Promise<BridgeExecutionResult> {
    const p = params.params
    const legs = await resolveLegs(
      param(p, 'fromMarket') || params.context.market,
      param(p, 'toMarket'),
      param(p, 'symbol'),
    )
    if (isRefused(legs)) {
      return { success: false, error: 'This route cannot be bridged.' }
    }

    const walletId = param(p, 'walletId') || undefined
    const source = slotFor(legs.from.family, walletId)
    if (!source) {
      return {
        success: false,
        error: walletId
          ? `Unknown wallet '${walletId}' for ${legs.from.displayName}`
          : `No ${legs.from.displayName} wallet is connected`,
      }
    }
    // The end that RECEIVES. Within one family it is the same key; across
    // families it is the other wallet, and there is no sane default for a
    // missing one — an EVM address on Solana is not an address at all.
    const destination =
      legs.to.family === legs.from.family ? source : slotFor(legs.to.family)
    if (!destination) {
      return {
        success: false,
        error: `Connect a ${legs.to.displayName} wallet to receive this transfer.`,
      }
    }
    const getKey = source.getPrivateKey
    if (!getKey) {
      return { success: false, error: 'Wallet key retriever not configured' }
    }

    // Re-quote for the slots' own addresses. Nothing the pane sent is signed;
    // what it sent is an intent, and the floor it agreed to.
    const route = await fetchBridgeRoute({
      from: legs.from,
      to: legs.to,
      fromToken: legs.fromToken,
      toToken: legs.toToken,
      amount: param(p, 'amount') || '0',
      fromAddress: source.address,
      toAddress: destination.address,
    })
    if (isRefused(route)) {
      return {
        success: false,
        error: 'The bridge has no route for this transfer any more.',
      }
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
    if (!check.ok) return { success: false, error: check.error }

    // Direction, stated. The SOURCE family decides which executor signs; the
    // destination only ever contributed an address, whichever family it is.
    if (legs.from.family === 'svm') {
      return executeSolanaBridgeTransfer({
        route,
        walletAddress: source.address,
        getPrivateKey: getKey,
        rpcUrl: solanaRpcUrl,
      })
    }
    return executeBridgeTransfer({
      chain: legs.from.evm,
      route,
      walletAddress: source.address,
      getPrivateKey: getKey,
      rpcUrl: legs.from.evm.rpcUrl,
    })
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
      if (action === 'quote' || action === '') return quote(params)
      throw new Error(`Unsupported bridge action '${action}'`)
    }

    if (capability === 'trading:bridge') {
      if (action !== 'execute') {
        return {
          success: false,
          error: `Unsupported bridge action '${action}'`,
        } satisfies BridgeExecutionResult
      }
      return send(params)
    }

    return null
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,

    async initialize(config: Record<string, unknown>) {
      // Merge, never reset: this runs once for the plugin's own config, again
      // for the Solana endpoint, and again for every wallet the terminal
      // provisions. Each call carries only its own fields.
      if (typeof config['apiKey'] === 'string') {
        setLifiApiKey(config['apiKey'])
      }
      if (typeof config['rpcUrl'] === 'string' && config['rpcUrl']) {
        // Endpoint only. Slots keep the key accessor they were provisioned
        // with, so a user enrolling their own node mid-session re-points where
        // transfers are simulated and sent without touching any key binding.
        solanaRpcUrl = config['rpcUrl']
      }
      const getKey =
        typeof config['getPrivateKey'] === 'function'
          ? (config['getPrivateKey'] as (id: string) => Promise<string | null>)
          : null
      const walletId = config['walletId'] as string | undefined
      const address = config['address'] as string | undefined
      const family = familyOfWalletChain(config['chain'])
      if (walletId && address && family) {
        // The accessor from THIS call is bound to THIS wallet id only; a later
        // provisioning never re-points an existing slot.
        walletSlots.set(walletId, {
          walletId,
          address,
          family,
          getPrivateKey: getKey ? () => getKey(walletId) : null,
        })
      }
    },

    // Nothing streams: quotes are pulled by the pane's own query and transfer
    // status is polled by the tracker, so this plugin owns no socket.
    subscribe: () => () => {},

    async destroy() {
      walletSlots.clear()
      solanaRpcUrl = DEFAULT_SOLANA_RPC
      setLifiApiKey(null)
    },
  }
}

export { BRIDGE_MARKETS } from './routes'
