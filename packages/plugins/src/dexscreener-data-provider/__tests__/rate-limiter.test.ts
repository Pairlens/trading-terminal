// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The DexScreener budget and its 429 classification.
 *
 * The sliding window itself is tested in `@pairlens/market-engine`; what is
 * DexScreener's here is the size of the budget and the fact that a limit becomes
 * a typed, REGISTERED throttle rather than an empty answer. Everything runs on a
 * virtual clock, so a window boundary costs microseconds instead of a minute.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import {
  isProviderThrottled,
  resetProviderThrottles,
} from '@pairlens/market-engine/provider-throttle'
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'

import {
  DEXSCREENER_PROVIDER,
  RATE_LIMIT_CAPACITY,
  RATE_LIMIT_WINDOW_MS,
  createDexscreenerFetch,
} from '../rate-limiter'

function virtualClock(start = 1_000_000) {
  let t = start
  const waits: Array<number> = []
  return {
    now: () => t,
    delay: (ms: number) => {
      waits.push(ms)
      t += ms
      return Promise.resolve()
    },
    waits,
  }
}

const limiterOn = (clock: ReturnType<typeof virtualClock>, capacity = 3) =>
  createRequestLimiter({
    capacity,
    windowMs: 1_000,
    now: clock.now,
    delay: clock.delay,
  })

const stubFetch = (
  responses: Array<{ status: number; headers?: Record<string, string> }>,
) => {
  const calls: Array<string> = []
  const original = globalThis.fetch
  let index = 0
  globalThis.fetch = ((url: string) => {
    calls.push(String(url))
    const spec = responses[Math.min(index, responses.length - 1)]
    index += 1
    return Promise.resolve(
      new Response(spec.status === 200 ? '{}' : '', {
        status: spec.status,
        headers: spec.headers,
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

afterEach(() => {
  resetProviderThrottles()
})

describe('the budget', () => {
  it('is set under the documented limit, not at it', () => {
    // DexScreener documents 300 a minute for the pair, token and search
    // endpoints. Sitting on the ceiling means a second Pairlens window on the
    // same IP puts us over it.
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000)
    expect(RATE_LIMIT_CAPACITY).toBeLessThan(300)
    expect(RATE_LIMIT_CAPACITY).toBeGreaterThanOrEqual(120)
  })

  it('is far larger than GeckoTerminal s, which is the point of using it', () => {
    // A supplement that had to queue behind the primary's own budget would make
    // reserves the slowest cell on the pane.
    expect(RATE_LIMIT_CAPACITY).toBeGreaterThan(25)
  })
})

describe('dexscreenerFetch', () => {
  it('passes a 2xx straight through', async () => {
    const paced = createDexscreenerFetch(limiterOn(virtualClock()))
    const stub = stubFetch([{ status: 200 }])
    try {
      const res = await paced(
        'https://api.dexscreener.com/latest/dex/pairs/x/y',
      )
      expect(res.status).toBe(200)
      expect(stub.calls.length).toBe(1)
      expect(isProviderThrottled(DEXSCREENER_PROVIDER)).toBe(false)
    } finally {
      stub.restore()
    }
  })

  it('turns a 429 into a typed throttle, registers it, and holds the queue', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    const paced = createDexscreenerFetch(limiter)
    const stub = stubFetch([{ status: 429, headers: { 'retry-after': '11' } }])
    try {
      let thrown: unknown
      try {
        await paced('https://api.dexscreener.com/latest/dex/pairs/x/y')
      } catch (e) {
        thrown = e
      }
      expect(isProviderThrottledError(thrown)).toBe(true)
      // Registered, which is what stops the pane reading the silence as a pool
      // that publishes no reserves.
      expect(isProviderThrottled(DEXSCREENER_PROVIDER)).toBe(true)
      await limiter.acquire()
      expect(clock.waits).toEqual([11_000])
    } finally {
      stub.restore()
    }
  })

  it('treats a 5xx as transient, with a shorter hold', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    const paced = createDexscreenerFetch(limiter)
    const stub = stubFetch([{ status: 502 }])
    try {
      await expect(
        paced('https://api.dexscreener.com/latest/dex/pairs/x/y'),
      ).rejects.toThrow(/temporarily unavailable/)
      await limiter.acquire()
      expect(clock.waits).toEqual([3_000])
    } finally {
      stub.restore()
    }
  })

  it('does not retry on its own: one acquire, one request', async () => {
    const paced = createDexscreenerFetch(limiterOn(virtualClock()))
    const stub = stubFetch([{ status: 429 }])
    try {
      await paced('https://api.dexscreener.com/latest/dex/pairs/x/y').catch(
        () => undefined,
      )
      expect(stub.calls.length).toBe(1)
    } finally {
      stub.restore()
    }
  })

  it('leaves a 404 alone, so "no such pool" stays an answer', async () => {
    const paced = createDexscreenerFetch(limiterOn(virtualClock()))
    const stub = stubFetch([{ status: 404 }])
    try {
      const res = await paced(
        'https://api.dexscreener.com/latest/dex/pairs/x/y',
      )
      expect(res.status).toBe(404)
      expect(isProviderThrottled()).toBe(false)
    } finally {
      stub.restore()
    }
  })
})
