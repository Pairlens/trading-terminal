// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One board opening costs ONE gems request, not three.
 *
 * The endpoint takes all three buckets in a single POST and always did, and
 * this provider spent a release asking for them one at a time: three round
 * trips on a cold open and three more every twenty seconds, against a keyless
 * budget the swap ticket on the same board is also spending.
 *
 * The reason this is a test rather than a comment is that un-batching it is
 * invisible. Every column still fills, the rows are identical, and the only
 * symptom is a board that throttles itself under a market that got busy. So
 * the request COUNT is pinned, and the body is checked for all three buckets
 * so a future edit cannot satisfy the count by dropping a column.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  clearGemsCache,
  createMemecoinDataProviderPlugin,
  memecoinDataProviderManifest,
} from '../index'
import { jupiterLimiter } from '../rate-limiter'
import { clearSolPriceCache } from '../jupiter-client'

const GEMS = 'https://datapi.jup.ag/v1/pools/gems'

/** One row per bucket, enough to parse and to prove the bucket was asked for. */
function pool(mint: string, graduated: boolean) {
  return {
    id: `pool-${mint}`,
    chain: 'solana',
    dex: 'pump.fun',
    createdAt: new Date().toISOString(),
    liquidity: 50_000,
    bondingCurve: graduated ? null : 80,
    baseAsset: {
      id: mint,
      name: mint,
      symbol: mint,
      decimals: 6,
      launchpad: 'pump.fun',
      mcap: 40_000,
      liquidity: 50_000,
      holderCount: 100,
      usdPrice: 0.00004,
      createdAt: new Date().toISOString(),
      ...(graduated ? { graduatedAt: new Date().toISOString() } : {}),
    },
  }
}

let realFetch: typeof globalThis.fetch
let bodies: Array<string>

beforeEach(() => {
  clearGemsCache()
  clearSolPriceCache()
  jupiterLimiter.reset()
  bodies = []
  realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : String((input as Request).url ?? input)
    // Foreign hosts must not land in this window, or the count is not ours.
    if (!url.startsWith(GEMS)) {
      throw new Error(`unexpected host in batching test: ${url}`)
    }
    bodies.push(String(init?.body ?? ''))
    return new Response(
      JSON.stringify({
        recent: { pools: [pool('NEWMINT', false)] },
        aboutToGraduate: { pools: [pool('GRADUATINGMINT', false)] },
        graduated: { pools: [pool('GRADUATEDMINT', true)] },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  clearGemsCache()
  clearSolPriceCache()
  jupiterLimiter.reset()
})

describe('launchpad columns share one gems request', () => {
  test('three columns read in one cycle cost one POST', async () => {
    const plugin = createMemecoinDataProviderPlugin(
      memecoinDataProviderManifest,
    )
    const read = (action: string) =>
      plugin.execute({
        capability: 'market-data:launchpad',
        params: { action },
        context: {} as never,
      })

    // Concurrently, which is how the board mounts them: the in-flight collapse
    // is the half that a TTL alone would not cover.
    const [nw, graduating, graduated] = (await Promise.all([
      read('new'),
      read('graduating'),
      read('graduated'),
    ])) as Array<{ tokens: Array<{ address: string }> }>

    expect(bodies).toHaveLength(1)

    const body = JSON.parse(bodies[0]) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([
      'aboutToGraduate',
      'graduated',
      'recent',
    ])

    // Each column got ITS bucket, not the first one that answered.
    expect(nw.tokens[0]?.address).toBe('NEWMINT')
    expect(graduating.tokens[0]?.address).toBe('GRADUATINGMINT')
    expect(graduated.tokens[0]?.address).toBe('GRADUATEDMINT')
  })

  test('a later cycle re-reads rather than latching the first answer', async () => {
    const plugin = createMemecoinDataProviderPlugin(
      memecoinDataProviderManifest,
    )
    const read = () =>
      plugin.execute({
        capability: 'market-data:launchpad',
        params: { action: 'new' },
        context: {} as never,
      })

    await read()
    expect(bodies).toHaveLength(1)

    // The cache is a per-cycle collapse, not a store. Past its TTL the next
    // read must go out, or the New column freezes on a launch from minutes ago.
    clearGemsCache()
    await read()
    expect(bodies).toHaveLength(2)
  })
})
