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

describe('networkForMarket', () => {
  it('maps DEX venues to their networks', () => {
    expect(networkForMarket('jupiter')).toBe('solana')
    expect(networkForMarket('base')).toBe('base')
    expect(networkForMarket('bsc')).toBe('bsc')
  })

  it('defaults to solana for unknown/CEX markets', () => {
    expect(networkForMarket('okx')).toBe('solana')
    expect(networkForMarket(undefined)).toBe('solana')
  })
})

describe('resolvePool — majors fast path (symbol scan)', () => {
  it('matches the deepest pool by token symbols', async () => {
    const { calls } = stubFetchRoutes([
      {
        match: '/networks/solana/pools?',
        json: {
          pools: [
            {
              id: 'pool-sol-usdc',
              chain: 'solana',
              dex_name: 'Raydium',
              volume_usd: 1000,
              tokens: [{ symbol: 'SOL' }, { symbol: 'USDC' }],
            },
          ],
        },
      },
    ])

    const pool = await resolvePool('SOL-USDC', 'solana')
    expect(pool?.id).toBe('pool-sol-usdc')
    expect(calls).toHaveLength(1)
  })
})

describe('resolvePool — address-based long-tail path', () => {
  it('resolves directly by token address when the base IS an address', async () => {
    const address = '0x532f27101965dd16442E59d40670FaF5eBB142E4'
    const { calls } = stubFetchRoutes([
      {
        match: `/networks/base/tokens/${address}/pools`,
        json: {
          pools: [
            {
              id: 'pool-brett-weth',
              chain: 'base',
              dex_name: 'Uniswap',
              volume_usd: 900,
              tokens: [{ symbol: 'BRETT' }, { symbol: 'WETH' }],
            },
            {
              id: 'pool-brett-usdc',
              chain: 'base',
              dex_name: 'Aerodrome',
              volume_usd: 500,
              tokens: [{ symbol: 'BRETT' }, { symbol: 'USDC' }],
            },
          ],
        },
      },
    ])

    const pool = await resolvePool(`${address}-USDC`, 'base')
    // Prefers the pool quoted in the requested currency over the deepest one
    expect(pool?.id).toBe('pool-brett-usdc')
    // Address bases skip the top-pools symbol scan entirely
    expect(calls.every((c) => c.url.includes(`/tokens/${address}/pools`))).toBe(
      true,
    )
  })

  it('uses the shared token directory pin instead of the symbol scan', async () => {
    registerToken({
      network: 'base',
      symbol: 'BRETT',
      address: '0xccc1',
      decimals: 18,
    })

    const { calls } = stubFetchRoutes([
      {
        match: '/networks/base/tokens/0xccc1/pools',
        json: {
          pools: [
            {
              id: 'pool-pinned',
              chain: 'base',
              volume_usd: 100,
              tokens: [{ symbol: 'BRETT' }, { symbol: 'USDC' }],
            },
          ],
        },
      },
    ])

    const pool = await resolvePool('BRETT-USDC', 'base')
    expect(pool?.id).toBe('pool-pinned')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/tokens/0xccc1/pools')
  })

  it('falls back to network-filtered search for unpinned symbols', async () => {
    const { calls } = stubFetchRoutes([
      {
        match: '/networks/base/pools?',
        json: { pools: [] }, // symbol scan misses
      },
      {
        match: '/search?query=TOSHI',
        json: {
          tokens: [
            { id: '0xwrong', symbol: 'TOSHI', chain: 'bsc' },
            { id: '0xtoshi', symbol: 'TOSHI', chain: 'base' },
          ],
        },
      },
      {
        match: '/networks/base/tokens/0xtoshi/pools',
        json: {
          pools: [
            {
              id: 'pool-toshi',
              chain: 'base',
              volume_usd: 50,
              tokens: [{ symbol: 'TOSHI' }, { symbol: 'WETH' }],
            },
          ],
        },
      },
    ])

    const pool = await resolvePool('TOSHI-USDC', 'base')
    expect(pool?.id).toBe('pool-toshi')
    expect(calls).toHaveLength(3)
  })
})
