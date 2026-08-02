// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  clearTokenDirectory,
  lookupToken,
} from '@pairlens/market-engine/token-directory'
import {
  clearTokenCaches,
  getTopTokens,
  resolveToken,
  searchTokens,
} from '../token-client'
import { EVM_CHAINS } from '../chains'

const chain = EVM_CHAINS['base']

type Captured = { url: string }

function stubFetch(responseJson: unknown): { calls: Array<Captured> } {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown) => {
    calls.push({ url: String(url) })
    return new Response(JSON.stringify(responseJson), { status: 200 })
  }) as unknown as typeof fetch
  return { calls }
}

/** Build a GeckoTerminal JSON:API pool page with included token resources. */
function gtPoolPage(
  pools: Array<{ baseId: string; quoteId: string }>,
  tokens: Array<{
    id: string
    address: string
    symbol: string
    name: string
    decimals: number | null
  }>,
) {
  return {
    data: pools.map((p) => ({
      relationships: {
        base_token: { data: { id: p.baseId, type: 'token' } },
        quote_token: { data: { id: p.quoteId, type: 'token' } },
      },
    })),
    included: tokens.map((t) => ({
      id: t.id,
      type: 'token',
      attributes: {
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
      },
    })),
  }
}

const realFetch = globalThis.fetch
beforeEach(() => {
  clearTokenCaches()
  clearTokenDirectory()
})
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('searchTokens — network scoping, dedupe, directory pinning', () => {
  it('extracts base tokens, drops other networks, dedupes symbols', async () => {
    stubFetch(
      gtPoolPage(
        [
          { baseId: 'base_0xaaa2', quoteId: 'base_0xweth' },
          { baseId: 'eth_0xaaa1', quoteId: 'eth_0xweth' }, // wrong network
          { baseId: 'base_0xaaa3', quoteId: 'base_0xusdc' }, // colliding symbol
          { baseId: 'base_0xbbb1', quoteId: 'base_0xweth' },
        ],
        [
          {
            id: 'base_0xaaa2',
            address: '0xaaa2',
            symbol: 'PEPE',
            name: 'Pepe Base',
            decimals: 18,
          },
          {
            id: 'eth_0xaaa1',
            address: '0xaaa1',
            symbol: 'PEPE',
            name: 'Pepe',
            decimals: 18,
          },
          {
            id: 'base_0xaaa3',
            address: '0xaaa3',
            symbol: 'PEPE',
            name: 'Fake Pepe',
            decimals: 9,
          },
          {
            id: 'base_0xbbb1',
            address: '0xbbb1',
            symbol: 'WIF',
            name: 'dogwifhat',
            decimals: 6,
          },
        ],
      ),
    )

    const tokens = await searchTokens(chain, 'PEPE')
    expect(tokens.map((t) => t.address)).toEqual(['0xaaa2', '0xbbb1'])
  })

  it('pins searched tokens in the shared directory (first hit wins)', async () => {
    stubFetch(
      gtPoolPage(
        [
          { baseId: 'base_0xaaa2', quoteId: 'base_0xweth' },
          { baseId: 'base_0xaaa3', quoteId: 'base_0xusdc' },
        ],
        [
          {
            id: 'base_0xaaa2',
            address: '0xaaa2',
            symbol: 'PEPE',
            name: 'Pepe Base',
            decimals: 18,
          },
          {
            id: 'base_0xaaa3',
            address: '0xaaa3',
            symbol: 'PEPE',
            name: 'Fake Pepe',
            decimals: 9,
          },
        ],
      ),
    )

    await searchTokens(chain, 'PEPE')
    expect(lookupToken('base', 'pepe')?.address).toBe('0xaaa2')
  })
})

describe('getTopTokens — pool extraction + registration', () => {
  it('extracts unique base tokens from top pools and registers them', async () => {
    const { calls } = stubFetch(
      gtPoolPage(
        [
          { baseId: 'base_0xweth', quoteId: 'base_0xusdc' },
          { baseId: 'base_0xccc1', quoteId: 'base_0xweth' },
          { baseId: 'base_0xweth', quoteId: 'base_0xusdt' }, // dup base
        ],
        [
          {
            id: 'base_0xweth',
            address: '0xweth',
            symbol: 'WETH',
            name: 'Wrapped Ether',
            decimals: 18,
          },
          {
            id: 'base_0xusdc',
            address: '0xusdc',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
          {
            id: 'base_0xccc1',
            address: '0xccc1',
            symbol: 'BRETT',
            name: 'Brett',
            decimals: 18,
          },
        ],
      ),
    )

    const tokens = await getTopTokens(chain)
    expect(tokens.map((t) => t.symbol)).toEqual(['WETH', 'BRETT'])
    expect(lookupToken('base', 'BRETT')?.address).toBe('0xccc1')
    expect(calls[0].url).toContain('/networks/base/pools?')
  })
})

describe('resolveToken — shortcuts and fallbacks', () => {
  it('resolves the chain quote token without a network call', async () => {
    const { calls } = stubFetch({})
    const token = await resolveToken(chain, 'USDC')
    expect(token?.address).toBe(chain.quote.address)
    expect(token?.decimals).toBe(chain.quote.decimals)
    expect(calls).toHaveLength(0)
  })

  it('resolves wrapped native without a network call', async () => {
    const { calls } = stubFetch({})
    const token = await resolveToken(chain, 'WETH')
    expect(token?.address).toBe(chain.wrappedNativeAddress)
    expect(calls).toHaveLength(0)
  })

  it('resolves a contract address via the token endpoint and pins it', async () => {
    const address = '0x532f27101965dd16442E59d40670FaF5eBB142E4'
    stubFetch({
      data: {
        id: `base_${address.toLowerCase()}`,
        attributes: {
          address: address.toLowerCase(),
          symbol: 'BRETT',
          name: 'Brett',
          decimals: 18,
        },
      },
    })

    const token = await resolveToken(chain, address)
    expect(token?.symbol).toBe('BRETT')
    expect(lookupToken('base', 'BRETT')?.address).toBe(address.toLowerCase())
  })
})
