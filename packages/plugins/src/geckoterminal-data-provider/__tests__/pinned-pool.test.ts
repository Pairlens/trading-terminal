// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A caller that already knows its pool must not have one resolved for it.
 *
 * Two things ride on this. The cheap one is the request: pair resolution is a
 * round trip out of a ~25-a-minute budget that four panes share, spent to learn
 * something the discovery board's own listing already told it. The expensive
 * one is correctness. `resolvePool` picks the DEEPEST pool for the base token,
 * so on a chain listing a dozen pools for the same two tokens it can hand back
 * a different one than the tile the user clicked, and the detail pane then
 * quotes one pool's liquidity beside another's volume.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  createGeckoterminalDataProviderPlugin,
  geckoterminalDataProviderManifest as manifest,
} from '../index'
import { clearPoolCache, resolvePool } from '../pool-resolver'
import { fetchPoolStats } from '../pool-stats-client'
import { fetchPoolTrades } from '../pool-trades-client'
import { geckoLimiter } from '../rate-limiter'

const CONTEXT = {
  pair: 'NVDAMINT-SOL',
  market: 'jupiter',
  timeframe: '1h',
  mode: 'paper' as const,
  country: 'US',
}

const realFetch = globalThis.fetch

/** Every request answered; the URLs are what the assertions are about. */
function recordFetch(body: (url: string) => unknown) {
  const calls: Array<string> = []
  globalThis.fetch = mock(async (url: unknown) => {
    calls.push(String(url))
    return new Response(JSON.stringify(body(String(url))), { status: 200 })
  }) as unknown as typeof fetch
  return calls
}

const POOL_BODY = {
  data: {
    id: 'solana_PINNED',
    attributes: {
      address: 'PINNED',
      name: 'NVDA / SOL',
      base_token_price_usd: '0.0000155',
      volume_usd: { h24: '129494176' },
      reserve_in_usd: '304526.36',
      transactions: { h24: { buys: 12, sells: 9 } },
    },
    relationships: { dex: { data: { id: 'pumpswap' } } },
  },
}

const TRADES_BODY = {
  data: [
    {
      id: 'solana_1',
      attributes: {
        block_timestamp: '2026-08-19T10:00:00Z',
        kind: 'buy',
        volume_in_usd: '1200',
        from_token_amount: '15',
        to_token_amount: '900000',
      },
    },
  ],
}

beforeEach(() => {
  clearPoolCache()
  geckoLimiter.reset()
})

afterEach(() => {
  globalThis.fetch = realFetch
  clearPoolCache()
  geckoLimiter.reset()
})

describe('pinned pool reads', () => {
  it('reads state straight from the pinned address, with no resolution', () => {
    const calls = recordFetch(() => POOL_BODY)
    return fetchPoolStats('NVDAMINT-SOL', 'solana', 'PINNED').then((stats) => {
      expect(calls).toEqual([
        'https://api.geckoterminal.com/api/v2/networks/solana/pools/PINNED',
      ])
      expect(stats?.address).toBe('PINNED')
      expect(stats?.volume24hUsd).toBe(129494176)
    })
  })

  it('reads the tape straight from the pinned address too', async () => {
    const calls = recordFetch(() => TRADES_BODY)
    const trades = await fetchPoolTrades('NVDAMINT-SOL', 'solana', 0, 'PINNED')
    expect(calls).toEqual([
      'https://api.geckoterminal.com/api/v2/networks/solana/pools/PINNED/trades',
    ])
    expect(trades?.length).toBe(1)
  })

  it('still resolves the pair when nothing was pinned', async () => {
    const calls = recordFetch((url) =>
      url.includes('/pools/') && !url.includes('?')
        ? POOL_BODY
        : {
            data: [
              {
                id: 'solana_DEEPEST',
                attributes: {
                  address: 'DEEPEST',
                  name: 'NVDA / SOL',
                  volume_usd: { h24: '900' },
                },
              },
            ],
          },
    )
    await fetchPoolStats('NVDAMINT-SOL', 'solana')
    // Two requests: find a pool, then read it. That is the cost the pinned
    // path removes, and the pool it lands on is the resolver's pick.
    expect(calls.length).toBe(2)
    expect(calls[1]).toContain('/pools/DEEPEST')
  })

  it('hands the pinned pool to the resolver cache, so candles follow it', async () => {
    recordFetch(() => POOL_BODY)
    await fetchPoolStats('NVDAMINT-SOL', 'solana', 'PINNED')

    // A later reader of the same pair now costs no request at all, and gets
    // the board's pool rather than whatever the search would have ranked
    // first. `fetch` would throw the wrong body here if it were called.
    globalThis.fetch = mock(async () => {
      throw new Error('resolver should not have asked')
    }) as unknown as typeof fetch
    const pool = await resolvePool('NVDAMINT-SOL', 'solana')
    expect(pool?.address).toBe('PINNED')
    expect(pool?.dexName).toBe('pumpswap')
  })
})

describe('plugin wiring', () => {
  it('carries poolAddress through both actions', async () => {
    const plugin = createGeckoterminalDataProviderPlugin(manifest)
    const calls = recordFetch((url) =>
      url.endsWith('/trades') ? TRADES_BODY : POOL_BODY,
    )

    await plugin.execute({
      capability: 'market-data:pool-stats',
      params: {
        action: 'stats',
        market: 'jupiter',
        pair: 'NVDAMINT-SOL',
        poolAddress: 'PINNED',
      },
      context: CONTEXT,
    })
    await plugin.execute({
      capability: 'market-data:pool-stats',
      params: {
        action: 'trades',
        market: 'jupiter',
        pair: 'NVDAMINT-SOL',
        poolAddress: 'PINNED',
      },
      context: CONTEXT,
    })

    // Two reads, two requests. Unpinned this was four, and the two extra were
    // the ones a rate-limited provider refused first.
    expect(calls).toEqual([
      'https://api.geckoterminal.com/api/v2/networks/solana/pools/PINNED',
      'https://api.geckoterminal.com/api/v2/networks/solana/pools/PINNED/trades',
    ])
  })

  it('ignores an empty poolAddress rather than requesting /pools/', async () => {
    // A caller with no selection sends nothing; a caller mid-render can send
    // an empty string, and building a URL out of that asks the provider for
    // the chain's pool INDEX and parses the answer as one pool.
    const plugin = createGeckoterminalDataProviderPlugin(manifest)
    const calls = recordFetch(() => ({
      data: [
        {
          id: 'solana_DEEPEST',
          attributes: {
            address: 'DEEPEST',
            name: 'NVDA / SOL',
            volume_usd: { h24: '900' },
          },
        },
      ],
    }))

    await plugin.execute({
      capability: 'market-data:pool-stats',
      params: {
        action: 'stats',
        market: 'jupiter',
        pair: 'NVDAMINT-SOL',
        poolAddress: '',
      },
      context: CONTEXT,
    })
    // It resolved instead of building `/pools/` with nothing on the end.
    expect(calls[0]).toContain('/search/pools?')
    expect(calls.some((url) => url.endsWith('/pools/'))).toBe(false)
  })
})
