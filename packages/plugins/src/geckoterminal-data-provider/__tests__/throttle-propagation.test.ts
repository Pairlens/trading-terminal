// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A throttle has to reach the caller. That is the whole fix.
 *
 * Every read in this provider used to swallow a failed request: `fetchOhlcv`
 * returned `[]`, `resolvePool` returned `null`. Downstream, an empty candle
 * result is what the terminal reads as "this venue does not carry this pair"
 * and records for the session, and a null pool is what the pool panes render as
 * "no pool on this chain". So during a free-tier 429, SOL-USDC on Jupiter
 * reported itself unavailable and stayed that way after the limit had passed.
 *
 * These tests pin the one distinction that fixes it: an empty or absent answer
 * from a provider that ANSWERED is still a real answer, and a refused request
 * is not an answer at all.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  ProviderThrottledError,
  isProviderThrottledError,
} from '@pairlens/market-engine/errors'
import { resetProviderThrottles } from '@pairlens/market-engine/provider-throttle'

import { fetchOhlcv } from '../ohlcv-client'
import { clearPoolCache, resolvePool } from '../pool-resolver'
import { fetchPoolStats } from '../pool-stats-client'
import { clearListingCache, fetchTopPools } from '../pool-listing-client'
import { fetchPoolTrades } from '../pool-trades-client'
import { geckoLimiter } from '../rate-limiter'

const realFetch = globalThis.fetch

/**
 * Reject at the transport, which is what a 429 looks like once `geckoFetch` has
 * classified it. Rejecting here rather than returning a 429 keeps the SHARED
 * limiter's cool-off out of the test process: its own behaviour is covered in
 * rate-limiter.test.ts, and a real 15s hold would make every later test in this
 * process wait it out.
 */
const throttleEveryRequest = () => {
  const calls: Array<string> = []
  globalThis.fetch = mock(async (url: unknown) => {
    calls.push(String(url))
    throw new ProviderThrottledError('GeckoTerminal', 429, 15_000)
  }) as unknown as typeof fetch
  return calls
}

/** Answers, with nothing in it. The opposite case, and it must stay silent. */
const answerEmpty = (json: unknown) => {
  globalThis.fetch = mock(
    async () => new Response(JSON.stringify(json), { status: 200 }),
  ) as unknown as typeof fetch
}

const POOL_SEARCH = {
  data: [
    {
      id: 'solana_pool1',
      attributes: {
        address: 'pool1',
        name: 'SOL / USDC',
        volume_usd: { h24: '900' },
      },
      relationships: { dex: { data: { id: 'orca' } } },
    },
  ],
}

beforeEach(() => {
  clearPoolCache()
  clearListingCache()
  resetProviderThrottles()
  geckoLimiter.reset()
})

afterEach(() => {
  globalThis.fetch = realFetch
  clearPoolCache()
  clearListingCache()
  resetProviderThrottles()
  geckoLimiter.reset()
})

describe('a throttled request is not an answer', () => {
  it('resolvePool throws instead of reporting "no pool on this chain"', async () => {
    throttleEveryRequest()
    let thrown: unknown
    try {
      await resolvePool('SOL-USDC', 'solana')
    } catch (e) {
      thrown = e
    }
    expect(isProviderThrottledError(thrown)).toBe(true)
  })

  it('a throttled resolve is not cached as a resolution', async () => {
    throttleEveryRequest()
    await resolvePool('SOL-USDC', 'solana').catch(() => undefined)

    // The hour-long pool cache must not have learned anything from a refusal:
    // the next attempt has to go back out to the provider.
    answerEmpty(POOL_SEARCH)
    const pool = await resolvePool('SOL-USDC', 'solana')
    expect(pool?.address).toBe('pool1')
  })

  it('fetchOhlcv throws instead of returning an empty chart', async () => {
    // The load-bearing one. An empty candle array here is what the terminal's
    // availability probe reads as "unlisted", and the verdict it publishes
    // reaches every pane and outlives the limit.
    throttleEveryRequest()
    let thrown: unknown
    try {
      await fetchOhlcv('SOL-USDC', '15m', 500, 'solana')
    } catch (e) {
      thrown = e
    }
    expect(isProviderThrottledError(thrown)).toBe(true)
  })

  it('fetchOhlcv throws when the CANDLE request is the throttled one', async () => {
    // The pool resolves from cache or from a healthy request, and only the
    // OHLCV call is refused — the ordering the 15s poller actually hits, since
    // the pool is cached for an hour.
    let call = 0
    globalThis.fetch = mock(async (url: unknown) => {
      call += 1
      if (String(url).includes('/ohlcv/')) {
        throw new ProviderThrottledError('GeckoTerminal', 429, 15_000)
      }
      return new Response(JSON.stringify(POOL_SEARCH), { status: 200 })
    }) as unknown as typeof fetch

    await expect(fetchOhlcv('SOL-USDC', '15m', 500, 'solana')).rejects.toThrow(
      /rate limiting/,
    )
    expect(call).toBe(2)
  })

  it('the pool reads throw, so the panes retry instead of showing no pool', async () => {
    throttleEveryRequest()
    await expect(fetchPoolStats('SOL-USDC', 'solana')).rejects.toThrow(
      /rate limiting/,
    )
    await expect(fetchPoolTrades('SOL-USDC', 'solana')).rejects.toThrow(
      /rate limiting/,
    )
    await expect(fetchTopPools('solana')).rejects.toThrow(/rate limiting/)
  })
})

describe('an answer with nothing in it is still an answer', () => {
  it('resolvePool returns null when the search comes back empty', async () => {
    answerEmpty({ data: [] })
    expect(await resolvePool('NOPE-USDC', 'solana')).toBeNull()
  })

  it('fetchOhlcv returns an empty array when there is no pool', async () => {
    // No pool means nothing to chart, and the terminal SHOULD say so. Turning
    // this into a retry would trade a wrong verdict for an endless spinner.
    answerEmpty({ data: [] })
    expect(await fetchOhlcv('NOPE-USDC', '15m', 500, 'solana')).toEqual([])
  })

  it('an unknown timeframe still resolves to empty, not to an error', async () => {
    answerEmpty(POOL_SEARCH)
    expect(await fetchOhlcv('SOL-USDC', '3d', 500, 'solana')).toEqual([])
  })

  it('a non-throttle transport failure still degrades to empty', async () => {
    // Unchanged behaviour: only a THROTTLE is promoted to an exception. A DNS
    // failure or an abort keeps the old empty result.
    globalThis.fetch = mock(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchOhlcv('SOL-USDC', '15m', 500, 'solana')).toEqual([])
    expect(await resolvePool('SOL-USDC', 'solana')).toBeNull()
  })
})
