// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which routes this connector serves, and the refusal each of the others gets.
 *
 * Solana is a route now, not a refusal, and the case that used to assert the
 * refusal asserts the resolution instead: that is the whole shape of this
 * change, and a test that still expected `non-evm-chain` would pass forever
 * while the feature rotted.
 *
 * The refusals that remain are still the point. A pane renders a different
 * sentence for "that is the chain you are already on" than for "this bridge
 * does not cover okx", and both beat an empty quote panel.
 */
import { describe, expect, it } from 'bun:test'

import {
  BRIDGE_MARKETS,
  bridgeDestinations,
  isRefused,
  resolveBridgeRoute,
} from '../routes'
import { LIFI_SOLANA_CHAIN_ID, bridgeChain } from '../chains'
import { lifiBridgeConnectorManifest } from '../index'

describe('resolveBridgeRoute', () => {
  it('resolves an EVM pair to both chain configs', () => {
    const route = resolveBridgeRoute('base', 'arbitrum')
    expect(isRefused(route)).toBe(false)
    if (!isRefused(route)) {
      expect(route.from.lifiChainId).toBe(8453)
      expect(route.to.lifiChainId).toBe(42161)
      expect(route.from.family).toBe('evm')
    }
  })

  it('resolves Solana on either side, with its own chain id', () => {
    for (const [fromMarket, toMarket] of [
      ['jupiter', 'base'],
      ['base', 'jupiter'],
    ] as const) {
      const route = resolveBridgeRoute(fromMarket, toMarket)
      expect(isRefused(route)).toBe(false)
      if (isRefused(route)) continue
      const solana = route.from.family === 'svm' ? route.from : route.to
      expect(solana.lifiChainId).toBe(LIFI_SOLANA_CHAIN_ID)
      expect(solana.walletChain).toBe('solana')
    }
  })

  it('treats `solana` as another name for the same chain', () => {
    const route = resolveBridgeRoute('base', 'solana')
    expect(isRefused(route)).toBe(false)
    if (!isRefused(route)) expect(route.to.market).toBe('jupiter')
    // And therefore as the same chain twice, not a zero-distance bridge.
    const loop = resolveBridgeRoute('solana', 'jupiter')
    expect(isRefused(loop) && loop.reason).toBe('same-chain')
  })

  it('refuses a same-chain request as a swap, not a bridge', () => {
    const route = resolveBridgeRoute('base', 'base')
    expect(isRefused(route) && route.reason).toBe('same-chain')
  })

  it('refuses a market it has no chain for', () => {
    const route = resolveBridgeRoute('okx', 'base')
    expect(isRefused(route) && route.reason).toBe('unknown-market')
    expect(isRefused(route) && route.market).toBe('okx')
    // Including chains LI.FI itself routes but this connector does not carry.
    expect(
      isRefused(resolveBridgeRoute('base', 'avalanche')) &&
        resolveBridgeRoute('base', 'avalanche'),
    ).toBeTruthy()
  })
})

describe('bridgeChain', () => {
  it('resolves nothing for an empty or unknown market', () => {
    expect(bridgeChain(undefined)).toBeNull()
    expect(bridgeChain('')).toBeNull()
    expect(bridgeChain('bitcoin')).toBeNull()
  })
})

describe('bridgeDestinations', () => {
  it('offers every other chain, never the one you are on', () => {
    const destinations = bridgeDestinations('base').map((c) => c.market)
    expect(destinations).not.toContain('base')
    expect(destinations).toContain('jupiter')
    expect(destinations.length).toBe(BRIDGE_MARKETS.length - 1)
  })

  it('drops the Solana entry once, under either of its names', () => {
    for (const market of ['jupiter', 'solana']) {
      const destinations = bridgeDestinations(market).map((c) => c.market)
      expect(destinations).not.toContain('jupiter')
      expect(destinations.length).toBe(BRIDGE_MARKETS.length - 1)
    }
  })
})

describe('the manifest', () => {
  it('declares both capabilities over the same six markets', () => {
    const ids = lifiBridgeConnectorManifest.capabilities.map((c) => c.id)
    expect(ids).toEqual(['market-data:bridge', 'trading:bridge'])
    expect(BRIDGE_MARKETS).toContain('jupiter')
    expect(BRIDGE_MARKETS.length).toBe(6)
    for (const capability of lifiBridgeConnectorManifest.capabilities) {
      expect(capability.markets).toEqual(BRIDGE_MARKETS)
    }
  })

  it('declares `solana` nowhere, so one chain resolves through one market id', () => {
    expect(BRIDGE_MARKETS).not.toContain('solana')
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

  it('asks for both wallets rather than a third one of its own', () => {
    expect(lifiBridgeConnectorManifest.metadata?.['walletChain']).toEqual([
      'ethereum',
      'solana',
    ])
    expect(lifiBridgeConnectorManifest.metadata?.['family']).toBe('dex')
  })

  it('asks for no required config: the API key only raises a rate limit', () => {
    for (const field of Object.values(lifiBridgeConnectorManifest.config)) {
      expect(field.required).toBeFalsy()
    }
  })
})
