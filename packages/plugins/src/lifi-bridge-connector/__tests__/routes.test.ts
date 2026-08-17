// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which routes this connector serves, and the refusal each of the others gets.
 *
 * The refusals are the point: a pane renders a different sentence for "Solana
 * is not bridgeable from here yet" than for "that is the chain you are already
 * on", and both beat an empty quote panel.
 */
import { describe, expect, it } from 'bun:test'

import {
  BRIDGE_MARKETS,
  bridgeDestinations,
  isRefused,
  resolveBridgeRoute,
} from '../routes'
import { lifiBridgeConnectorManifest } from '../index'

describe('resolveBridgeRoute', () => {
  it('resolves an EVM pair to both chain configs', () => {
    const route = resolveBridgeRoute('base', 'arbitrum')
    expect(isRefused(route)).toBe(false)
    if (!isRefused(route)) {
      expect(route.from.chainId).toBe(8453)
      expect(route.to.chainId).toBe(42161)
    }
  })

  it('refuses Solana on either side, and names it', () => {
    for (const route of [
      resolveBridgeRoute('jupiter', 'base'),
      resolveBridgeRoute('base', 'jupiter'),
      resolveBridgeRoute('base', 'solana'),
    ]) {
      expect(isRefused(route)).toBe(true)
      if (isRefused(route)) expect(route.reason).toBe('non-evm-chain')
    }
  })

  it('refuses a same-chain request as a swap, not a bridge', () => {
    const route = resolveBridgeRoute('base', 'base')
    expect(isRefused(route) && route.reason).toBe('same-chain')
  })

  it('refuses a market it has no chain for', () => {
    const route = resolveBridgeRoute('okx', 'base')
    expect(isRefused(route) && route.reason).toBe('unknown-market')
    expect(isRefused(route) && route.market).toBe('okx')
  })
})

describe('bridgeDestinations', () => {
  it('offers every other EVM chain, never the one you are on', () => {
    const destinations = bridgeDestinations('base').map((c) => c.market)
    expect(destinations).not.toContain('base')
    expect(destinations.length).toBe(BRIDGE_MARKETS.length - 1)
  })
})

describe('the manifest', () => {
  it('declares both capabilities over the same five markets', () => {
    const ids = lifiBridgeConnectorManifest.capabilities.map((c) => c.id)
    expect(ids).toEqual(['market-data:bridge', 'trading:bridge'])
    for (const capability of lifiBridgeConnectorManifest.capabilities) {
      expect(capability.markets).toEqual(BRIDGE_MARKETS)
    }
  })

  it('marks execution as a side effect so it is never retried elsewhere', () => {
    const trading = lifiBridgeConnectorManifest.capabilities.find(
      (c) => c.id === 'trading:bridge',
    )
    expect(trading?.sideEffect).toBe(true)
    const read = lifiBridgeConnectorManifest.capabilities.find(
      (c) => c.id === 'market-data:bridge',
    )
    expect(read?.sideEffect).toBeUndefined()
  })

  it('shares the EVM wallet rather than asking for a second one', () => {
    expect(lifiBridgeConnectorManifest.metadata?.['walletChain']).toBe(
      'ethereum',
    )
    expect(lifiBridgeConnectorManifest.metadata?.['family']).toBe('dex')
  })

  it('asks for no required config: the API key only raises a rate limit', () => {
    for (const field of Object.values(lifiBridgeConnectorManifest.config)) {
      expect(field.required).toBeFalsy()
    }
  })
})
