// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which (from, to) pairs this connector will quote, and the refusal for the
 * ones it will not.
 *
 * EVM to EVM only. LI.FI does route Solana, but a Solana leg needs a Solana
 * signer, a different transaction shape and a different address for the same
 * user — none of which this connector has. So a route with Solana on either
 * side comes back as a typed refusal the pane can put a sentence to, rather
 * than as a quote that would fail at signing time or, worse, an empty panel
 * that reads as "this asset cannot be bridged".
 *
 * Chain facts come from the EVM connector's own config: same package, one
 * table, so the chain id a bridge quote is built for is the chain id a swap on
 * that market would use.
 */
import { EVM_CHAINS } from '../evm-dex-connector/chains'
import type { EvmChainConfig } from '../evm-dex-connector/chains'
import type { BridgeRouteRefused } from '@pairlens/shared/instrument-types'

/** The markets this connector declares. Ordered as the chain rail orders them. */
export const BRIDGE_MARKETS: Array<string> = [
  'ethereum',
  'base',
  'arbitrum',
  'bsc',
  'polygon',
]

/**
 * Markets that are chains the terminal draws but this connector cannot sign
 * for. `jupiter` is the Solana connector's market id; 'solana' is accepted too
 * because that is the name a saved layout or an assistant call may use.
 */
const NON_EVM_MARKETS: ReadonlySet<string> = new Set(['jupiter', 'solana'])

export type BridgeRoute = { from: EvmChainConfig; to: EvmChainConfig }

export function refuse(
  reason: BridgeRouteRefused['reason'],
  market: string | null = null,
  symbol: string | null = null,
): BridgeRouteRefused {
  return { refused: true, reason, market, symbol }
}

export function isRefused(value: unknown): value is BridgeRouteRefused {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { refused?: unknown }).refused === true
  )
}

/**
 * Resolve both legs, or say which one is the problem.
 *
 * The order of the checks is what makes the message useful: a Solana leg is
 * named as non-EVM rather than as an unknown market, and a same-chain request
 * is called out as a swap rather than quoted as a zero-distance bridge.
 */
export function resolveBridgeRoute(
  fromMarket: string,
  toMarket: string,
): BridgeRoute | BridgeRouteRefused {
  for (const market of [fromMarket, toMarket]) {
    if (NON_EVM_MARKETS.has(market)) return refuse('non-evm-chain', market)
  }
  const from = EVM_CHAINS[fromMarket]
  if (!from) return refuse('unknown-market', fromMarket)
  const to = EVM_CHAINS[toMarket]
  if (!to) return refuse('unknown-market', toMarket)
  if (from.market === to.market) return refuse('same-chain', fromMarket)
  return { from, to }
}

/** Chains a transfer out of `fromMarket` can land on. */
export function bridgeDestinations(fromMarket: string): Array<EvmChainConfig> {
  return BRIDGE_MARKETS.filter((market) => market !== fromMarket)
    .map((market) => EVM_CHAINS[market])
    .filter((chain): chain is EvmChainConfig => Boolean(chain))
}
