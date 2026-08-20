// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which read outranks which, on the one provider the whole DEX Discovery board
 * shares.
 *
 * The board opens by asking for a chain aggregate per chain in its rail and
 * three pages of pools for the selected chain, and only THEN, once the map has
 * ranked a chain and picked a pool, for that pool's state and its swap tape.
 * Served first come, first served, the two panes the reader is looking at were
 * ninth and tenth in a queue paced at 1.2 seconds a request.
 *
 * These pin the assignment, not the queue: the queue's own behaviour is covered
 * in rate-limiter.test.ts. What is easy to lose here is the mapping, because it
 * lives in one branch each and nothing else would fail if a branch dropped its
 * argument.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  createGeckoterminalDataProviderPlugin,
  geckoterminalDataProviderManifest,
} from '../index'
import { clearListingCache } from '../pool-listing-client'
import { clearPoolCache } from '../pool-resolver'
import { geckoLimiter } from '../rate-limiter'
import type { PluginExecuteParams } from '@pairlens/plugin-system/types'
import type { RequestPriority } from '../rate-limiter'

const realFetch = globalThis.fetch
const realAcquire = geckoLimiter.acquire

/** Priorities in the order the transport asked for admission. */
let asked: Array<RequestPriority> = []

const POOL_ROW = {
  id: 'base_pool1',
  attributes: {
    address: 'pool1',
    name: 'WETH / USDC',
    base_token_price_usd: '3000',
    volume_usd: { h24: '1000000' },
    reserve_in_usd: '5000000',
  },
  relationships: { dex: { data: { id: 'uniswap' } } },
}

const context = {
  pair: 'WETH-USDC',
  market: 'base',
  timeframe: '1h',
  mode: 'paper' as const,
  country: 'US',
}

const plugin = createGeckoterminalDataProviderPlugin(
  geckoterminalDataProviderManifest,
)

const run = (params: Record<string, unknown>) =>
  plugin.execute({
    capability: 'market-data:pool-stats',
    params,
    context,
  } as unknown as PluginExecuteParams)

beforeEach(() => {
  asked = []
  clearListingCache()
  clearPoolCache()
  // Admission is instant here: what is under test is the argument, and a real
  // 1.2s spacing would make this suite spend ten seconds proving a mapping.
  geckoLimiter.acquire = ((priority: RequestPriority = 'normal') => {
    asked.push(priority)
    return Promise.resolve()
  }) as typeof geckoLimiter.acquire
  globalThis.fetch = mock(
    async (url: unknown) =>
      new Response(
        JSON.stringify(
          String(url).includes('/trades')
            ? { data: [] }
            : String(url).includes('/pools?') ||
                String(url).includes('/new_pools')
              ? { data: [POOL_ROW] }
              : { data: POOL_ROW },
        ),
        { status: 200 },
      ),
  ) as unknown as typeof fetch
})

afterEach(() => {
  geckoLimiter.acquire = realAcquire
  globalThis.fetch = realFetch
})

describe('what the reader is looking at', () => {
  it('asks for the selected pool s swap tape at high priority', async () => {
    // Last thing the board can ask for, first thing it needs: nothing can
    // request a pool's swaps until the map has picked one.
    await run({
      action: 'trades',
      market: 'base',
      pair: 'WETH-USDC',
      poolAddress: 'pool1',
    })
    expect(asked).toEqual(['high'])
  })

  it('asks for the selected pool s state at high priority', async () => {
    await run({
      action: 'stats',
      market: 'base',
      pair: 'WETH-USDC',
      poolAddress: 'pool1',
    })
    expect(asked).toEqual(['high'])
  })
})

describe('the listing walk', () => {
  it('puts page one ahead of the depth pages behind it', async () => {
    // Page one is what the map paints and what seeds the board's selection;
    // pages two and three only widen a ranking that is already on screen. The
    // panes downstream wait on the first and not on the rest.
    await run({ action: 'pools', market: 'base', sort: 'volume', depth: 3 })
    expect(asked).toEqual(['normal', 'low', 'low'])
  })

  it('asks for a single page at normal, with nothing to deprioritize', async () => {
    await run({ action: 'pools', market: 'base' })
    expect(asked).toEqual(['normal'])
  })
})

describe('the background sweeps', () => {
  it('samples every chain in the rail at low priority', async () => {
    // Six requests in one tick for chains the reader is not looking at. The
    // rail filling in late costs nothing; the map, the detail pane and the flow
    // chart queued behind it cost the whole board.
    await run({
      action: 'networks',
      market: 'base',
      markets: ['base', 'ethereum', 'arbitrum'],
      displayNames: { base: 'Base' },
    })
    expect(asked).toEqual(['low', 'low', 'low'])
  })

  it('asks for the new-pools feed at low priority', async () => {
    await run({ action: 'new-pools', market: 'base' })
    expect(asked).toEqual(['low'])
  })
})
