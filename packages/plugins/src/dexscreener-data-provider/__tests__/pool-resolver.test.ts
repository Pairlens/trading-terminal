// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the resolver picks, and what it refuses to pick.
 *
 * The ranking rules exist because of rows the live API really returns, so the
 * fixtures are those rows: `/token-pairs/v1` hands back WETH's Base pools with
 * the deepest one FOURTH, and `/latest/dex/search` hands back three Solana
 * "SOL/USDC" pools reporting a billion dollars of liquidity against forty trades
 * a day while the real market appears nowhere in the result.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import {
  clearTokenDirectory,
  registerToken,
} from '@pairlens/market-engine/token-directory'

import { clearPoolCache, resolvePool, selectPool } from '../pool-resolver'
import { BASE_WETH_TOKEN_PAIRS, HOSTILE_SEARCH_ROWS } from './fixtures'

afterEach(() => {
  clearTokenDirectory()
  clearPoolCache()
})

describe('selectPool', () => {
  it('ranks by traded volume, not by the order the endpoint returned', () => {
    // The deepest and busiest WETH/USDC pool on Base is the FOURTH row.
    const picked = selectPool(BASE_WETH_TOKEN_PAIRS, { chainId: 'base' })
    expect(picked?.pairAddress).toBe(
      '0xd0b53D9277642d899DF5C87A3966A349A798F224',
    )
  })

  it('prefers the requested quote leg', () => {
    // The DEGEN-quoted pool out-volumes two of the three USDC pools; a pair key
    // that says USDC means the USDC market.
    const picked = selectPool(BASE_WETH_TOKEN_PAIRS, {
      chainId: 'base',
      quote: 'DEGEN',
    })
    expect(picked?.quoteToken?.symbol).toBe('DEGEN')
  })

  it('falls back to the deepest pool when the quote leg has none', () => {
    // Any liquid quote tracks the same price, so a pool is a better answer than
    // no pool at all.
    const picked = selectPool(BASE_WETH_TOKEN_PAIRS, {
      chainId: 'base',
      quote: 'USDT',
    })
    expect(picked?.pairAddress).toBe(
      '0xd0b53D9277642d899DF5C87A3966A349A798F224',
    )
  })

  it('matches the quote symbol case-insensitively but exactly', () => {
    expect(
      selectPool(BASE_WETH_TOKEN_PAIRS, { chainId: 'base', quote: 'usdc' })
        ?.quoteToken?.symbol,
    ).toBe('USDC')
    // Not a prefix match: USDC must never be answered by USDC.e or USDCET.
    expect(
      selectPool(BASE_WETH_TOKEN_PAIRS, { chainId: 'base', quote: 'USD' })
        ?.quoteToken?.symbol,
    ).toBe('USDC') // falls back to deepest, rather than treating USD as a match
  })

  it('drops rows from another chain and rows with no address', () => {
    const rows = [
      ...HOSTILE_SEARCH_ROWS,
      { chainId: 'base', pairAddress: undefined, volume: { h24: 1e12 } },
    ]
    expect(selectPool(rows, { chainId: 'base' })).toBeNull()
  })

  it('never lets reported liquidity outrank volume', () => {
    // The three hostile rows differ by billions in reported liquidity and by
    // almost nothing in volume. Ranking by liquidity would pick the second;
    // ranking by volume picks the first, which is the only one that traded more.
    const picked = selectPool(HOSTILE_SEARCH_ROWS, { chainId: 'solana' })
    expect(picked?.pairAddress).toBe(
      '7DYVdkbhQ5ZgeJNhVBBDnvhbfoJeGrF46EGeDaohT6Hu',
    )
  })

  it('is null for an empty candidate set', () => {
    expect(selectPool([], { chainId: 'base' })).toBeNull()
  })
})

describe('resolvePool', () => {
  const stubFetch = (body: unknown) => {
    const calls: Array<string> = []
    const original = globalThis.fetch
    globalThis.fetch = ((url: string) => {
      calls.push(String(url))
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
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

  it('resolves through the token endpoint when the base leg is an address', async () => {
    const stub = stubFetch(BASE_WETH_TOKEN_PAIRS)
    try {
      const pool = await resolvePool(
        '0x4200000000000000000000000000000000000006-USDC',
        'base',
      )
      expect(pool?.pairAddress).toBe(
        '0xd0b53D9277642d899DF5C87A3966A349A798F224',
      )
      expect(stub.calls[0]).toContain(
        '/token-pairs/v1/base/0x4200000000000000000000000000000000000006',
      )
    } finally {
      stub.restore()
    }
  })

  it('resolves a symbol the token directory has already pinned', async () => {
    registerToken({
      network: 'base',
      symbol: 'WETH',
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    })
    const stub = stubFetch(BASE_WETH_TOKEN_PAIRS)
    try {
      const pool = await resolvePool('WETH-USDC', 'base')
      expect(pool?.dexId).toBe('uniswap')
      expect(stub.calls.length).toBe(1)
    } finally {
      stub.restore()
    }
  })

  it('refuses a bare symbol it has no address for, without asking', async () => {
    // The measured reason: `/latest/dex/search?q=WETH USDC` returns thirty rows
    // and not one is on Ethereum, and `SOL USDC` returns three Solana pools that
    // are not the market. Ranking a text index would be picking a pool and
    // calling it the market, so there is no request to make.
    const stub = stubFetch(BASE_WETH_TOKEN_PAIRS)
    try {
      expect(await resolvePool('WETH-USDC', 'base')).toBeNull()
      expect(stub.calls).toEqual([])
    } finally {
      stub.restore()
    }
  })

  it('drops rows where the pinned token is neither leg', async () => {
    const stub = stubFetch([
      {
        chainId: 'base',
        pairAddress: '0xNotTheToken',
        baseToken: { address: '0xdead', symbol: 'FAKE' },
        quoteToken: { address: '0xbeef', symbol: 'USDC' },
        volume: { h24: 1e9 },
      },
    ])
    try {
      const pool = await resolvePool(
        '0x4200000000000000000000000000000000000006-USDC',
        'base',
      )
      expect(pool).toBeNull()
    } finally {
      stub.restore()
    }
  })

  it('is null for a pair key that is not two legs', async () => {
    const stub = stubFetch([])
    try {
      expect(await resolvePool('WETH', 'base')).toBeNull()
      expect(await resolvePool('', 'base')).toBeNull()
      expect(stub.calls).toEqual([])
    } finally {
      stub.restore()
    }
  })

  it('caches the resolution, so a poll does not re-resolve every minute', async () => {
    const stub = stubFetch(BASE_WETH_TOKEN_PAIRS)
    try {
      const key = '0x4200000000000000000000000000000000000006-USDC'
      await resolvePool(key, 'base')
      await resolvePool(key, 'base')
      await resolvePool(key, 'base')
      expect(stub.calls.length).toBe(1)
    } finally {
      stub.restore()
    }
  })
})
