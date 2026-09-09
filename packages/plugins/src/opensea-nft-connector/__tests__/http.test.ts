// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The read budget, over a virtual clock.
 *
 * Nothing here touches the network: what is pinned is the SHAPE of the pacing,
 * because the bug it replaces was a limiter whose window could not express the
 * ceiling it was sized against (100 a minute is 6000 an hour against a ~600
 * budget, so it never engaged and the user met OpenSea's real limit instead).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { resetAuth, resolveKey, setUserKey } from '../auth'
import {
  BURST_BUDGET,
  HOURLY_BUDGET,
  createOpenSeaBudget,
  isMissingKeyError,
  openSeaFetch,
} from '../http'

/**
 * A clock that only moves when something waits, so an hour of pacing costs a
 * test nothing and the delays are readable afterwards.
 */
function virtualClock() {
  let now = 0
  const waits: Array<number> = []
  return {
    waits,
    now: () => now,
    delay: async (ms: number) => {
      waits.push(ms)
      now += ms
    },
  }
}

describe('the read budget', () => {
  test('is sized under the hourly ceiling, not ten times over it', () => {
    expect(HOURLY_BUDGET).toBeLessThanOrEqual(600)
    expect(HOURLY_BUDGET).toBeGreaterThanOrEqual(400)
  })

  test('a cold board opens without being paced', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    for (let i = 0; i < BURST_BUDGET; i += 1) await budget.acquire()
    expect(clock.waits).toHaveLength(0)
    expect(clock.now()).toBe(0)
  })

  test('the read past the burst is spaced, not refused', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    for (let i = 0; i < BURST_BUDGET + 1; i += 1) await budget.acquire()
    expect(clock.waits).toHaveLength(1)
    // Only until the oldest read leaves the short window, never the hour.
    expect(clock.now()).toBeLessThan(60_000)
  })

  test('the hourly ceiling is what actually binds a steady state', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    for (let i = 0; i < HOURLY_BUDGET; i += 1) await budget.acquire()
    const spentOnBursts = clock.now()
    // The whole hourly budget went out inside a few minutes of burst pacing,
    // which is exactly what a per-minute limiter would have allowed forever.
    expect(spentOnBursts).toBeLessThan(600_000)

    await budget.acquire()
    // The next read waits out the rest of the hour instead of spending a key
    // the board would then have to show throttle banners for.
    expect(clock.now()).toBeGreaterThanOrEqual(3_600_000)
  })

  test('a 429 stops both windows, it does not merely slow one', async () => {
    const clock = virtualClock()
    const budget = createOpenSeaBudget(clock)
    budget.cooldown(30_000)
    await budget.acquire()
    expect(clock.now()).toBeGreaterThanOrEqual(30_000)
  })
})

/**
 * The other half of the budget story: a key that is simply gone.
 *
 * A 401 used to be terminal, because the only key there could be was one the
 * user had pasted. It is not any more, so the shape worth pinning is that the
 * recovery is bounded: exactly one replacement, never a loop against a venue
 * that is telling us no.
 */
describe('a key that comes back rejected', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    resetAuth()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    resetAuth()
  })

  test('is retired, replaced and the read is made again', async () => {
    const sent: Array<string> = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/keys')) {
        return new Response(JSON.stringify({ api_key: 'fresh' }), {
          status: 200,
        })
      }
      const key = new Headers(init?.headers).get('x-api-key') ?? ''
      sent.push(key)
      return key === 'fresh'
        ? new Response('{"ok":true}', { status: 200 })
        : new Response('unauthorized', { status: 401 })
    }) as typeof globalThis.fetch

    setUserKey('revoked')
    expect(await openSeaFetch<{ ok: boolean }>('revoked', '/anything')).toEqual(
      {
        ok: true,
      },
    )
    // The dead key once, its replacement once. No third attempt.
    expect(sent).toEqual(['revoked', 'fresh'])
  })

  test('a 403 is not a dead key, and does not spend a mint proving it', async () => {
    let mints = 0
    globalThis.fetch = (async (input: unknown) => {
      if (String(input).endsWith('/auth/keys')) {
        mints += 1
        return new Response(JSON.stringify({ api_key: 'fresh' }), {
          status: 200,
        })
      }
      return new Response('forbidden', { status: 403 })
    }) as typeof globalThis.fetch

    setUserKey('good-key')
    const failure = await openSeaFetch('good-key', '/anything').catch(
      (err: unknown) => err,
    )
    expect(isMissingKeyError(failure)).toBe(true)
    // OpenSea issues two keys a day per address. A geo block, a WAF rule and a
    // free-tier endpoint all answer 403, and a new key fixes none of them.
    expect(mints).toBe(0)
    expect(await resolveKey()).toBe('good-key')
  })

  test('refuses with the typed error when there is nothing to replace it with', async () => {
    let reads = 0
    globalThis.fetch = (async (input: unknown) => {
      if (String(input).endsWith('/auth/keys')) {
        return new Response('no', {
          status: 429,
          headers: { 'retry-after': '600' },
        })
      }
      reads += 1
      return new Response('unauthorized', { status: 401 })
    }) as typeof globalThis.fetch

    setUserKey('revoked')
    const failure = await openSeaFetch('revoked', '/anything').catch(
      (err: unknown) => err,
    )
    expect(isMissingKeyError(failure)).toBe(true)
    // The read is not repeated against a key nothing replaced.
    expect(reads).toBe(1)
  })
})
