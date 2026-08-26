// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mint-keyed chart source wins on the `jupiter` venue, and only there.
 *
 * Solana memecoin charts moved from GeckoTerminal's pool-keyed OHLCV to
 * Jupiter's mint-keyed one, because a token still on its bonding curve has no
 * AMM pool to resolve and the chart was blank for exactly the tokens the New
 * and Graduating columns surface. The move is expressed as nothing but a
 * priority number on a market-scoped declaration, which makes it worth pinning
 * from the resolver's side: the whole behaviour rests on 4 beating 5 for one
 * market and on the scope not leaking to the other five chains the memecoin
 * board opens rows on.
 *
 * The fallback ordering matters as much as the winner. Jupiter's endpoint is
 * undocumented and throws on any failure, so GeckoTerminal has to be sitting
 * behind it as a runner-up rather than absent from the result.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import { PluginResolver } from '../resolver'
import type { PluginInstance, PluginManifest } from '../types'

function candleProvider(
  id: string,
  markets: Array<string>,
  priority: number,
): PluginInstance {
  const manifest = {
    id,
    name: id,
    version: '1.0.0',
    author: 'test',
    description: '',
    metadata: { assetClass: 'dex' },
    capabilities: [
      {
        id: 'market-data:candles',
        singleton: false,
        markets,
        priority,
        streaming: true,
      },
    ],
    config: {},
  } as unknown as PluginManifest
  return { manifest, status: 'active', config: {} } as PluginInstance
}

let resolver: PluginResolver

beforeEach(() => {
  resolver = new PluginResolver()
  // The real declarations, verbatim: GeckoTerminal is the wildcard primary at
  // 5, Jupiter is scoped to its own venue at 4.
  resolver.registerPlugin(
    candleProvider('geckoterminal-data-provider', ['*'], 5),
  )
  resolver.registerPlugin(
    candleProvider('jupiter-dex-connector', ['jupiter'], 4),
  )
})

describe('memecoin candle precedence', () => {
  it('serves the jupiter venue from the mint-keyed source', () => {
    const resolved = resolver.resolve({
      capability: 'market-data:candles',
      market: 'jupiter',
    })
    expect(resolved?.plugin.manifest.id).toBe('jupiter-dex-connector')
  })

  it('keeps GeckoTerminal behind it, because the endpoint is undocumented', () => {
    // A failure throws rather than answering empty, and the manager walks to
    // the runner-up. If GeckoTerminal were not in `fallbacks`, a shape change
    // at jup.ag would take every Solana chart down with it.
    const resolved = resolver.resolve({
      capability: 'market-data:candles',
      market: 'jupiter',
    })
    expect(resolved?.fallbacks.map((p) => p.manifest.id)).toContain(
      'geckoterminal-data-provider',
    )
  })

  it('does not touch the other chains a memecoin board opens rows on', () => {
    // Legendary rows resolve to whichever chain a coin trades deepest on, and
    // PEPE is Ethereum-native. Those charts are pool-keyed and must stay so:
    // the Jupiter endpoint is a Solana token API.
    for (const market of ['ethereum', 'base', 'arbitrum', 'bsc', 'polygon']) {
      const resolved = resolver.resolve({
        capability: 'market-data:candles',
        market,
      })
      expect(resolved?.plugin.manifest.id).toBe('geckoterminal-data-provider')
    }
  })

  it('does not shadow the global provider on an unspecified market', () => {
    // A market-scoped declaration must never win a wildcard request, or a
    // niche connector answers for every venue in the terminal.
    const resolved = resolver.resolve({ capability: 'market-data:candles' })
    expect(resolved?.plugin.manifest.id).toBe('geckoterminal-data-provider')
  })
})
