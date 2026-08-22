// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Two asset classes can share a market id, and the resolver has to survive it.
 *
 * 'ethereum' is a DEX venue and an NFT venue. Both declare `trading:orders` on
 * it and both declare `market-data:candles` on it, so before this filter the
 * higher-priority DEX connector won every NFT order. Worse, `trading:orders` is
 * side-effecting, so the manager deliberately does not walk to a runner-up:
 * there was no recovery, and every NFT order came back "invalid pair".
 *
 * The rule is narrow on purpose. A query with no class matches everything, and
 * so does a plugin that declares none, so every caller that predates this
 * resolves exactly as it did. Both halves are pinned below, because a filter
 * that quietly started excluding unstamped plugins would break every connector
 * in the catalog at once.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import { PluginResolver } from '../resolver'
import type { PluginInstance, PluginManifest } from '../types'

function plugin(
  id: string,
  opts: { priority: number; assetClass?: string; markets?: Array<string> },
): PluginInstance {
  const manifest: PluginManifest = {
    id,
    name: id,
    version: '1.0.0',
    author: 'test',
    description: '',
    capabilities: [
      {
        id: 'trading:orders',
        singleton: false,
        markets: opts.markets ?? ['ethereum'],
        priority: opts.priority,
        streaming: false,
      },
    ],
    config: {},
    ...(opts.assetClass ? { metadata: { assetClass: opts.assetClass } } : {}),
  } as PluginManifest

  return {
    manifest,
    status: 'active',
    config: {},
    execute: async () => null,
  } as unknown as PluginInstance
}

let resolver: PluginResolver

beforeEach(() => {
  resolver = new PluginResolver()
})

describe('asset-class resolution', () => {
  it('picks the NFT venue for an NFT order on a shared chain', () => {
    // The DEX connector is priority 1 and would otherwise win outright.
    resolver.registerPlugin(
      plugin('ethereum-dex-connector', { priority: 1, assetClass: 'dex' }),
    )
    resolver.registerPlugin(
      plugin('opensea-nft-connector', { priority: 5, assetClass: 'nft' }),
    )

    const resolved = resolver.resolve({
      capability: 'trading:orders',
      market: 'ethereum',
      assetClass: 'nft',
    })

    expect(resolved?.plugin.manifest.id).toBe('opensea-nft-connector')
    // And nothing else is left to walk to, which is what we want on a
    // side-effecting capability: a swap router must never be a fallback for an
    // NFT order.
    expect(resolved?.fallbacks).toEqual([])
  })

  it('still picks the DEX venue when the class says dex', () => {
    resolver.registerPlugin(
      plugin('ethereum-dex-connector', { priority: 1, assetClass: 'dex' }),
    )
    resolver.registerPlugin(
      plugin('opensea-nft-connector', { priority: 5, assetClass: 'nft' }),
    )

    const resolved = resolver.resolve({
      capability: 'trading:orders',
      market: 'ethereum',
      assetClass: 'dex',
    })

    expect(resolved?.plugin.manifest.id).toBe('ethereum-dex-connector')
  })

  it('does not filter at all when the query names no class', () => {
    resolver.registerPlugin(
      plugin('ethereum-dex-connector', { priority: 1, assetClass: 'dex' }),
    )
    resolver.registerPlugin(
      plugin('opensea-nft-connector', { priority: 5, assetClass: 'nft' }),
    )

    const resolved = resolver.resolve({
      capability: 'trading:orders',
      market: 'ethereum',
    })

    // Priority alone, exactly as before this filter existed.
    expect(resolved?.plugin.manifest.id).toBe('ethereum-dex-connector')
    expect(resolved?.fallbacks.map((p) => p.manifest.id)).toEqual([
      'opensea-nft-connector',
    ])
  })

  it('keeps an unstamped plugin eligible for a classed query', () => {
    // The catalog is full of connectors that declare no asset class. Excluding
    // them the moment any caller names one would break every venue at once.
    resolver.registerPlugin(plugin('legacy-connector', { priority: 1 }))
    resolver.registerPlugin(
      plugin('opensea-nft-connector', { priority: 5, assetClass: 'nft' }),
    )

    const resolved = resolver.resolve({
      capability: 'trading:orders',
      market: 'ethereum',
      assetClass: 'nft',
    })

    expect(resolved?.plugin.manifest.id).toBe('legacy-connector')
    expect(resolved?.fallbacks.map((p) => p.manifest.id)).toEqual([
      'opensea-nft-connector',
    ])
  })

  it('excludes a wildcard provider of the wrong class', () => {
    // GeckoTerminal serves candles for every market at priority 5 and is
    // registered before the NFT group, so it won the tie on insertion order and
    // answered an NFT chart with an empty array, which ends the walk.
    resolver.registerPlugin(
      plugin('geckoterminal-data-provider', {
        priority: 5,
        assetClass: 'dex',
        markets: ['*'],
      }),
    )
    resolver.registerPlugin(
      plugin('opensea-nft-connector', { priority: 5, assetClass: 'nft' }),
    )

    const resolved = resolver.resolve({
      capability: 'trading:orders',
      market: 'ethereum',
      assetClass: 'nft',
    })

    expect(resolved?.plugin.manifest.id).toBe('opensea-nft-connector')
  })
})
