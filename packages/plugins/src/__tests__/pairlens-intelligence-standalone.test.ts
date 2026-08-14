// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  createPairlensIntelligencePlugin,
  pairlensIntelligenceManifest,
} from '../pairlens-intelligence'
import type { PluginContext } from '@pairlens/plugin-system/types'

// Standalone mode: VITE_APP_SERVER_URL explicitly empty means appServerUrl is
// '' — nullish coalescing must NOT swallow it into the cloud default, and no
// execute path may fetch (a relative URL would hit the hosting origin and
// leak search queries into its access logs).

const context: PluginContext = {
  pair: 'BTC-USDT',
  market: 'okx',
  timeframe: '1h',
  mode: 'paper',
  country: 'US',
}

const realFetch = globalThis.fetch
let fetchCalls: Array<string>

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = ((input: RequestInfo | URL) => {
    fetchCalls.push(String(input))
    return Promise.reject(new Error('network disabled in test'))
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

async function standalonePlugin() {
  const plugin = createPairlensIntelligencePlugin(pairlensIntelligenceManifest)
  await plugin.initialize?.({ appServerUrl: '' })
  return plugin
}

describe('pairlens-intelligence in standalone mode (empty appServerUrl)', () => {
  test('discovery serves the local catalog without fetching', async () => {
    const plugin = await standalonePlugin()
    const result = (await plugin.execute({
      capability: 'market-data:discovery',
      params: { market: 'okx', q: 'btc' },
      context,
    })) as { items: Array<{ symbol: string }>; total: number }

    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.some((i) => i.symbol === 'BTC-USDT')).toBe(true)
    expect(fetchCalls).toEqual([])
  })

  test('discovery search serves the local catalog without fetching', async () => {
    const plugin = await standalonePlugin()
    const result = (await plugin.execute({
      capability: 'market-data:discovery:search',
      params: { query: 'btc' },
      context,
    })) as { items: Array<{ symbol: string }> }

    expect(result.items.length).toBeGreaterThan(0)
    expect(fetchCalls).toEqual([])
  })

  test('discovery search with an empty query returns an empty page', async () => {
    const plugin = await standalonePlugin()
    const result = await plugin.execute({
      capability: 'market-data:discovery:search',
      params: { query: '' },
      context,
    })
    expect(result).toEqual({ items: [], total: 0, hasMore: false })
    expect(fetchCalls).toEqual([])
  })

  test('symbol-logo resolves to no logo without fetching', async () => {
    const plugin = await standalonePlugin()
    const result = await plugin.execute({
      capability: 'market-data:symbol-logo',
      params: { symbol: 'btc' },
      context,
    })
    expect(result).toEqual({ url: null })
    expect(fetchCalls).toEqual([])
  })

  test('ai:inference throws without fetching', async () => {
    const plugin = await standalonePlugin()
    await expect(
      plugin.execute({
        capability: 'ai:inference',
        params: { messages: [] },
        context,
      }),
    ).rejects.toThrow('standalone')
    expect(fetchCalls).toEqual([])
  })

  test('ai:web-search throws without fetching', async () => {
    const plugin = await standalonePlugin()
    await expect(
      plugin.execute({
        capability: 'ai:web-search',
        params: { objective: 'BTC catalysts' },
        context,
      }),
    ).rejects.toThrow('standalone')
    expect(fetchCalls).toEqual([])
  })

  test('getLanguageModel throws instead of building a relative baseURL', async () => {
    const plugin = await standalonePlugin()
    expect(() => plugin.getLanguageModel?.()).toThrow('standalone')
  })
})

describe('pairlens-intelligence with a configured App Server', () => {
  test('discovery fetches an absolute URL against the configured base', async () => {
    globalThis.fetch = ((input: RequestInfo | URL) => {
      fetchCalls.push(String(input))
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as typeof fetch

    const plugin = createPairlensIntelligencePlugin(
      pairlensIntelligenceManifest,
    )
    await plugin.initialize?.({ appServerUrl: 'https://api.example.test' })
    await plugin.execute({
      capability: 'market-data:discovery',
      params: { market: 'okx', q: 'btc' },
      context,
    })

    expect(fetchCalls).toEqual([
      'https://api.example.test/api/instruments?market=okx&q=btc',
    ])
  })
})
