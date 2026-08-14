// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The deep-search consent choke point. "Search stays on this device" is a
 * privacy promise: with the gate closed, NO discovery path may put
 * user-typed text on the wire — not the search capability, not a discovery
 * browse carrying a `q` filter. With the gate open, search prefers the deep
 * endpoint and falls back to the legacy catalog route on servers that
 * predate it (404).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  createPairlensIntelligencePlugin,
  pairlensIntelligenceManifest,
} from '../pairlens-intelligence'
import type { PluginContext } from '@pairlens/plugin-system/types'

const context: PluginContext = {
  pair: 'BTC-USDT',
  market: 'okx',
  timeframe: '1h',
  mode: 'paper',
  country: 'US',
}

const realFetch = globalThis.fetch
let fetchCalls: Array<string>
let responder: (url: string) => Response | null

beforeEach(() => {
  fetchCalls = []
  responder = () => null
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input)
    fetchCalls.push(url)
    const response = responder(url)
    if (response) return Promise.resolve(response)
    return Promise.reject(new Error('network disabled in test'))
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

async function pluginWithGate(allowed: () => boolean) {
  const plugin = createPairlensIntelligencePlugin(pairlensIntelligenceManifest)
  await plugin.initialize?.({
    appServerUrl: 'https://api.example.test',
    discoverySearchAllowed: allowed,
  })
  return plugin
}

describe('deep-search consent gate', () => {
  test('gate closed: search answers locally, nothing on the wire', async () => {
    const plugin = await pluginWithGate(() => false)
    const result = (await plugin.execute({
      capability: 'market-data:discovery:search',
      params: { query: 'btc' },
      context,
    })) as { items: Array<{ symbol: string }> }

    expect(result.items.some((i) => i.symbol === 'BTC-USDT')).toBe(true)
    expect(fetchCalls).toEqual([])
  })

  test('gate closed: a discovery browse with a q filter stays local too', async () => {
    const plugin = await pluginWithGate(() => false)
    await plugin.execute({
      capability: 'market-data:discovery',
      params: { market: 'okx', q: 'pepe' },
      context,
    })
    expect(fetchCalls).toEqual([])
  })

  test('gate closed: a browse WITHOUT typed text may still reach the server', async () => {
    const plugin = await pluginWithGate(() => false)
    await plugin
      .execute({
        capability: 'market-data:discovery',
        params: { market: 'okx' },
        context,
      })
      .catch(() => null)
    expect(fetchCalls.length).toBe(1)
    expect(fetchCalls[0]).not.toContain('q=')
  })

  test('gate open: search hits the deep endpoint', async () => {
    responder = (url) =>
      url.includes('/api/instruments/search')
        ? Response.json({
            schemaVersion: 1,
            query: 'turbo',
            items: [
              {
                id: 'TURBO-USDT',
                kind: 'cex-pair',
                market: '',
                symbol: 'TURBO-USDT',
                name: 'TURBO',
                base: 'TURBO',
                quote: 'USDT',
                assetClass: 'crypto',
                categories: [],
                rank: 1_000_000,
                featured: false,
              },
            ],
            listings: {},
          })
        : null
    const plugin = await pluginWithGate(() => true)
    const result = (await plugin.execute({
      capability: 'market-data:discovery:search',
      params: { query: 'turbo' },
      context,
    })) as { items: Array<{ symbol: string; kind: string }> }

    expect(fetchCalls).toEqual([
      'https://api.example.test/api/instruments/search?q=turbo',
    ])
    expect(result.items[0]?.symbol).toBe('TURBO-USDT')
    expect(result.items[0]?.kind).toBe('cex-pair')
  })

  test('gate open: a 404 from an older server falls back to the legacy route', async () => {
    responder = (url) => {
      if (url.includes('/api/instruments/search')) {
        return Response.json({ error: 'not found' }, { status: 404 })
      }
      if (url.includes('/api/instruments?')) {
        return Response.json([
          {
            id: 'okx:BTC-USDT',
            market: 'okx',
            symbol: 'BTC-USDT',
            name: 'Bitcoin',
            base: 'BTC',
            quote: 'USDT',
            assetClass: 'crypto',
            categories: [],
            rank: 1,
            featured: true,
          },
        ])
      }
      return null
    }
    const plugin = await pluginWithGate(() => true)
    const result = (await plugin.execute({
      capability: 'market-data:discovery:search',
      params: { query: 'btc' },
      context,
    })) as { items: Array<{ symbol: string; kind: string }> }

    expect(fetchCalls).toHaveLength(2)
    // Legacy rows predate the union — the wire boundary stamps a kind.
    expect(result.items[0]?.kind).toBe('cex-pair')
  })
})
