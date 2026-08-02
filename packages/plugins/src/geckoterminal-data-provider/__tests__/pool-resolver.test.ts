// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  clearTokenDirectory,
  registerToken,
} from '@pairlens/market-engine/token-directory'
import { clearPoolCache, networkForMarket, resolvePool } from '../pool-resolver'

type Captured = { url: string }

/** Route fetches by URL substring → response JSON. */
function stubFetchRoutes(routes: Array<{ match: string; json: unknown }>): {
  calls: Array<Captured>
} {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown) => {
    const u = String(url)
    calls.push({ url: u })
    const route = routes.find((r) => u.includes(r.match))
    if (!route) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(route.json), { status: 200 })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
beforeEach(() => {
  clearPoolCache()
  clearTokenDirectory()
})
afterEach(() => {
  globalThis.fetch = realFetch
})

function gtPool(id: string, address: string, name: string, volume: number) {
  return {
    id,
    attributes: {
      address,
      name,
      volume_usd: { h24: String(volume) },
    },
    relationships: { dex: { data: { id: 'test-dex' } } },
  }
}

describe('networkForMarket — GeckoTerminal slugs', () => {
  it('maps markets to GeckoTerminal network slugs', () => {
    expect(networkForMarket('jupiter')).toBe('solana')
    expect(networkForMarket('ethereum')).toBe('eth')
    expect(networkForMarket('polygon')).toBe('polygon_pos')
    expect(networkForMarket('base')).toBe('base')
  })

  it('defaults to solana for unknown/CEX markets', () => {
    expect(networkForMarket('okx')).toBe('solana')
    expect(networkForMarket(undefined)).toBe('solana')
  })
})

describe('resolvePool — symbol search path', () => {
  it('picks the deepest same-network pool from search results', async () => {
    stubFetchRoutes([
      {
        match: '/search/pools?query=SOL%20USDC&network=solana',
        json: {
          data: [
            gtPool('eth_0xother', '0xother', 'SOL / USDC', 99999), // wrong network
            gtPool('solana_pool1', 'pool1', 'SOL / USDC', 500),
            gtPool('solana_pool2', 'pool2', 'SOL / USDC', 900),
          ],
        },
      },
    ])

    const pool = await resolvePool('SOL-USDC', 'solana')
    expect(pool?.address).toBe('pool2')
  })
})

describe('resolvePool — address-pinned path', () => {
  it('resolves by token address when the base IS an address', async () => {
    const address = '0x532f27101965dd16442E59d40670FaF5eBB142E4'
    const { calls } = stubFetchRoutes([
      {
        match: `/networks/base/tokens/${address}/pools`,
        json: {
          data: [
            gtPool('base_p1', 'p1', 'BRETT / WETH 1%', 900),
            gtPool('base_p2', 'p2', 'BRETT / USDC 0.3%', 500),
          ],
        },
      },
    ])

    const pool = await resolvePool(`${address}-USDC`, 'base')
    // Prefers the requested quote over the deepest pool
    expect(pool?.address).toBe('p2')
    expect(calls).toHaveLength(1)
  })

  it('uses the token directory pin, translating gecko slugs for lookup', async () => {
    // Directory is keyed by Pairlens network name ('ethereum'), while the
    // resolver receives the GeckoTerminal slug ('eth')
    registerToken({
      network: 'ethereum',
      symbol: 'MOG',
      address: '0xmog',
      decimals: 18,
    })

    const { calls } = stubFetchRoutes([
      {
        match: '/networks/eth/tokens/0xmog/pools',
        json: { data: [gtPool('eth_p1', 'p1', 'MOG / WETH 1%', 100)] },
      },
    ])

    const pool = await resolvePool('MOG-USDC', 'eth')
    expect(pool?.address).toBe('p1')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/networks/eth/tokens/0xmog/pools')
  })
})
