// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the plugin answers and what it refuses.
 *
 * The refusals are the interesting half. This provider serves one of the four
 * pool-stats actions, and the other three have to fail rather than return null:
 * a null reads as "this chain has no pools", which is how an empty rail gets
 * latched, while a throw is a failure the plugin manager walks past.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import {
  createDexscreenerDataProviderPlugin,
  dexscreenerDataProviderManifest as manifest,
} from '../index'
import { clearPoolCache } from '../pool-resolver'
import { ORCA_SOL_USDC } from './fixtures'
import type { PoolStats } from '@pairlens/shared/instrument-types'

const CONTEXT = {
  pair: 'SOL-USDC',
  market: 'jupiter',
  timeframe: '1h',
  mode: 'paper' as const,
  country: 'US',
}

function stubFetch(body: unknown, status = 200) {
  const calls: Array<string> = []
  const original = globalThis.fetch
  globalThis.fetch = ((url: string) => {
    calls.push(String(url))
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof globalThis.fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

afterEach(() => {
  clearPoolCache()
})

describe('manifest', () => {
  it('serves pool state and nothing it cannot back', () => {
    // Declaring candles or a ticker would win a resolution this provider cannot
    // serve: DexScreener publishes no OHLCV at all.
    expect(manifest.capabilities.map((c) => c.id)).toEqual([
      'market-data:pool-stats',
    ])
  })

  it('sits behind both existing providers in the pool-stats chain', () => {
    // GeckoTerminal is 5, DexPaprika 6. The reserve supplement reaches this
    // plugin directly rather than through the chain, so its priority only
    // decides who answers when the other two have failed.
    const pool = manifest.capabilities[0]
    expect(pool.priority).toBe(7)
    expect(pool.markets).toEqual(['*'])
    expect(pool.streaming).toBe(false)
  })

  it('is a member of the dex family, so a deployment can drop it with the class', () => {
    expect(manifest.metadata?.['family']).toBe('dex')
    expect(manifest.metadata?.['assetClass']).toBe('dex')
  })

  it('declares no credentials and no config', () => {
    // Keyless: the reason it can serve a browser at all.
    expect(manifest.config).toEqual({})
  })
})

describe('execute — stats', () => {
  it('reads the exact pool it is handed, with no resolution', async () => {
    const plugin = createDexscreenerDataProviderPlugin(manifest)
    const stub = stubFetch({ pair: ORCA_SOL_USDC })
    try {
      const stats = (await plugin.execute({
        capability: 'market-data:pool-stats',
        params: {
          action: 'stats',
          market: 'jupiter',
          pair: 'SOL-USDC',
          poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
        context: CONTEXT,
      })) as PoolStats

      // One request, straight to the pool endpoint: the caller already decided
      // which pool the answer is about.
      expect(stub.calls).toEqual([
        'https://api.dexscreener.com/latest/dex/pairs/solana/58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      ])
      expect(stats.baseReserve).toBe(208666)
      expect(stats.quoteReserve).toBe(9863877)
      expect(stats.source).toBe('dexscreener')
    } finally {
      stub.restore()
    }
  })

  it('answers null for a pool DexScreener does not know', async () => {
    // The endpoint returns 200 with `pair: null`, which is an answer, not a
    // failure: this pool simply is not indexed.
    const plugin = createDexscreenerDataProviderPlugin(manifest)
    const stub = stubFetch({ schemaVersion: '1.0.0', pairs: null, pair: null })
    try {
      const stats = await plugin.execute({
        capability: 'market-data:pool-stats',
        params: {
          action: 'stats',
          market: 'ethereum',
          pair: 'WETH-USDC',
          poolAddress: '0x0000000000000000000000000000000000000000',
        },
        context: CONTEXT,
      })
      expect(stats).toBeNull()
    } finally {
      stub.restore()
    }
  })

  it('prefers the market param over the manager s shared context', async () => {
    // The manager's context carries the terminal's own current venue, which for
    // a pool pane on a second chain is a different chain entirely.
    const plugin = createDexscreenerDataProviderPlugin(manifest)
    const stub = stubFetch({ pair: ORCA_SOL_USDC })
    try {
      await plugin.execute({
        capability: 'market-data:pool-stats',
        params: { action: 'stats', market: 'base', poolAddress: '0xabc' },
        context: CONTEXT,
      })
      expect(stub.calls[0]).toContain('/latest/dex/pairs/base/0xabc')
    } finally {
      stub.restore()
    }
  })

  it('refuses a market it has no chain id for', async () => {
    const plugin = createDexscreenerDataProviderPlugin(manifest)
    await expect(
      plugin.execute({
        capability: 'market-data:pool-stats',
        params: { action: 'stats', market: 'coinbase', pair: 'BTC-USDT' },
        context: { ...CONTEXT, market: 'coinbase' },
      }),
    ).rejects.toThrow(/no chain id/)
  })
})

describe('execute — refusals', () => {
  it('throws for the three actions it cannot serve', async () => {
    const plugin = createDexscreenerDataProviderPlugin(manifest)
    for (const action of ['trades', 'pools', 'networks']) {
      await expect(
        plugin.execute({
          capability: 'market-data:pool-stats',
          params: { action, market: 'jupiter' },
          context: CONTEXT,
        }),
        action,
      ).rejects.toThrow(/does not publish/)
    }
  })

  it('answers null for a capability it never declared', async () => {
    const plugin = createDexscreenerDataProviderPlugin(manifest)
    expect(
      await plugin.execute({
        capability: 'market-data:candles',
        params: {},
        context: CONTEXT,
      }),
    ).toBeNull()
  })

  it('subscribes to nothing, and unsubscribing is safe', () => {
    const plugin = createDexscreenerDataProviderPlugin(manifest)
    const unsubscribe = plugin.subscribe?.(
      { capability: 'market-data:pool-stats', params: {}, context: CONTEXT },
      () => {},
    )
    expect(typeof unsubscribe).toBe('function')
    unsubscribe?.()
  })
})
