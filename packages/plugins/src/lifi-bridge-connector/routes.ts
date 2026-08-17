// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which (from, to) pairs this connector will quote, and the refusal for the
 * ones it will not.
 *
 * Six chains now, across two signing families: the five EVM chains and Solana.
 * Solana used to be refused here, not because LI.FI could not route it but
 * because this connector had no Solana signer and no place to put one. It has
 * both now (`solana-executor.ts`, and a manifest that asks for the Solana
 * wallet alongside the EVM one), so the refusal is gone and a Solana leg is a
 * route like any other.
 *
 * What survives is the shape of the answer. A route that cannot be quoted comes
 * back as a typed refusal naming the side at fault, because a pane renders a
 * different sentence for "that is the chain you are already on" than for "this
 * asset does not exist over there", and both beat an empty panel that reads as
 * "this asset cannot be bridged".
 */
import { BRIDGE_CHAINS, bridgeChain } from './chains'
import type { BridgeChain } from './chains'
import type { BridgeRouteRefused } from '@pairlens/shared/instrument-types'

/**
 * The markets this connector declares, ordered as the chain rail orders them.
 *
 * Solana is declared under `jupiter`, the market id the rest of the terminal
 * already uses for it. `solana` is accepted as an alias by `bridgeChain` but is
 * deliberately NOT declared: a capability market list is what the plugin
 * manager routes on, and two ids for one chain would make a route resolvable
 * twice.
 */
export const BRIDGE_MARKETS: Array<string> = BRIDGE_CHAINS.map((c) => c.market)

export type BridgeRoute = { from: BridgeChain; to: BridgeChain }

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
 * Order still matters: an unknown market is named before a same-chain request
 * is diagnosed, so `okx → base` says "okx is not a chain this bridge covers"
 * rather than something about swapping.
 */
export function resolveBridgeRoute(
  fromMarket: string,
  toMarket: string,
): BridgeRoute | BridgeRouteRefused {
  const from = bridgeChain(fromMarket)
  if (!from) return refuse('unknown-market', fromMarket)
  const to = bridgeChain(toMarket)
  if (!to) return refuse('unknown-market', toMarket)
  // Compared on the resolved market, not the requested one, so `solana → jupiter`
  // is correctly the same chain twice rather than a zero-distance bridge.
  if (from.market === to.market) return refuse('same-chain', fromMarket)
  return { from, to }
}

/** Chains a transfer out of `fromMarket` can land on. */
export function bridgeDestinations(fromMarket: string): Array<BridgeChain> {
  const from = bridgeChain(fromMarket)
  return BRIDGE_CHAINS.filter((chain) => chain.market !== from?.market)
}
