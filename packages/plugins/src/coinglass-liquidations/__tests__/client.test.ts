// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The envelope, which is the whole reason this client is not three lines of
 * `fetch().then(r => r.json())`.
 *
 * Coinglass answers HTTP 200 to a missing key and to a bad key. Every test in
 * the first block therefore builds a 200 response and asserts the client still
 * refuses — a regression here does not throw, it returns garbage that looks
 * like data, which is the failure mode worth a suite of its own.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'
import {
  COINGLASS_KEY_HEADER,
  createCoinglassClient,
  isCoinglassApiError,
  parseEnvelope,
} from '../client'
import {
  BODY_EXCHANGE_LIST,
  BODY_EXCHANGE_LIST_FULL,
  BODY_KEY_INVALID,
  BODY_KEY_MISSING,
  BODY_ORDER_SINGLE,
  BODY_RATE_LIMITED,
  ORDER_ROW_RECORDED,
} from './fixtures'
import type { CoinglassApiError } from '../client'

/**
 * A limiter on a virtual clock that the waits themselves ADVANCE.
 *
 * A frozen clock deadlocks the limiter rather than speeding it up: a cool-off
 * is `cooldownUntil - now()`, so with `now` pinned at 0 the wait never expires
 * and `admit` spins forever. Advancing the clock inside `delay` is what makes a
 * 30-second cool-off instant instead of infinite.
 */
function instantLimiter() {
  let clock = 0
  return createRequestLimiter({
    capacity: 1_000,
    windowMs: 60_000,
    now: () => clock,
    delay: async (ms) => {
      clock += Math.max(ms, 1)
    },
  })
}

function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
}

describe('parseEnvelope', () => {
  test('code "0" returns the payload', () => {
    const data = parseEnvelope<Array<unknown>>(BODY_ORDER_SINGLE, {
      endpoint: '/order',
      keyWorks: true,
    })
    expect(data).toHaveLength(1)
    expect(data[0]).toEqual(ORDER_ROW_RECORDED)
  })

  test('a numeric code is compared as a string', () => {
    const data = parseEnvelope<Array<number>>(
      { code: 0, msg: 'success', data: [1] },
      { endpoint: '/order', keyWorks: false },
    )
    expect(data).toEqual([1])
  })

  test('missing key is key_missing, not a success', () => {
    let thrown: unknown
    try {
      parseEnvelope(BODY_KEY_MISSING, { endpoint: '/order', keyWorks: false })
    } catch (e) {
      thrown = e
    }
    expect(isCoinglassApiError(thrown)).toBe(true)
    expect((thrown as CoinglassApiError).reason).toBe('key_missing')
  })

  test('an unproven key that is rejected is key_invalid', () => {
    let thrown: unknown
    try {
      parseEnvelope(BODY_KEY_INVALID, { endpoint: '/order', keyWorks: false })
    } catch (e) {
      thrown = e
    }
    expect((thrown as CoinglassApiError).reason).toBe('key_invalid')
    expect((thrown as CoinglassApiError).code).toBe('400')
  })

  test('a PROVEN key rejected on a paid endpoint is plan_required', () => {
    // Same body as the key_invalid case. The only difference is that the key
    // already answered on an all-plans endpoint, which is the whole
    // discriminator — and the message has to name the plan to be actionable.
    let thrown: unknown
    try {
      parseEnvelope(BODY_KEY_INVALID, {
        endpoint: '/api/futures/liquidation/order',
        keyWorks: true,
      })
    } catch (e) {
      thrown = e
    }
    expect((thrown as CoinglassApiError).reason).toBe('plan_required')
    expect((thrown as CoinglassApiError).message).toContain('Standard')
  })

  test('429 is rate_limited whichever key state it arrives in', () => {
    for (const keyWorks of [true, false]) {
      let thrown: unknown
      try {
        parseEnvelope(BODY_RATE_LIMITED, { endpoint: '/order', keyWorks })
      } catch (e) {
        thrown = e
      }
      expect((thrown as CoinglassApiError).reason).toBe('rate_limited')
    }
  })

  test('success with no data member is upstream, never an empty answer', () => {
    let thrown: unknown
    try {
      parseEnvelope(
        { code: '0', msg: 'success' },
        {
          endpoint: '/order',
          keyWorks: true,
        },
      )
    } catch (e) {
      thrown = e
    }
    expect((thrown as CoinglassApiError).reason).toBe('upstream')
  })

  test('a non-object body is upstream', () => {
    expect(() =>
      parseEnvelope('nope', { endpoint: '/order', keyWorks: true }),
    ).toThrow(/unreadable/)
  })
})

describe('createCoinglassClient', () => {
  test('sends the key on the documented header and never on the query', async () => {
    const seenUrls: Array<string> = []
    const seenKeys: Array<string | null> = []
    const client = createCoinglassClient({
      apiKey: 'k-123',
      limiter: instantLimiter(),
      fetchImpl: async (input, init) => {
        seenUrls.push(String(input))
        seenKeys.push(new Headers(init?.headers).get(COINGLASS_KEY_HEADER))
        return jsonResponse(BODY_EXCHANGE_LIST)
      },
    })
    await client.exchangeNames()
    expect(seenKeys).toEqual(['k-123'])
    // The key is a header, never a query parameter: URLs end up in logs.
    expect(seenUrls[0]).not.toContain('k-123')
    expect(seenUrls[0]).toContain('open-api-v4.coinglass.com')
  })

  test('a 200 carrying an auth error still refuses', async () => {
    const client = createCoinglassClient({
      apiKey: 'bad',
      limiter: instantLimiter(),
      fetchImpl: async () => jsonResponse(BODY_KEY_INVALID, { status: 200 }),
    })
    await expect(client.exchangeNames()).rejects.toThrow(/rejected the API key/)
  })

  test('the exchange list drops the synthetic "All" row', async () => {
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async () => jsonResponse(BODY_EXCHANGE_LIST_FULL),
    })
    expect(await client.exchangeNames()).toEqual(['Binance', 'Bybit', 'Kucoin'])
  })

  test('the exchange list is fetched once and cached', async () => {
    let calls = 0
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async () => {
        calls += 1
        return jsonResponse(BODY_EXCHANGE_LIST_FULL)
      },
    })
    await client.exchangeNames()
    await client.exchangeNames()
    expect(calls).toBe(1)
  })

  test('a failed exchange-list probe is NOT cached as an answer', async () => {
    let calls = 0
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async () => {
        calls += 1
        return calls === 1
          ? jsonResponse(BODY_RATE_LIMITED)
          : jsonResponse(BODY_EXCHANGE_LIST_FULL)
      },
    })
    await expect(client.exchangeNames()).rejects.toThrow()
    expect(await client.exchangeNames()).toContain('Binance')
  })

  test('a proven key turns a later refusal into plan_required', async () => {
    let calls = 0
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async () => {
        calls += 1
        return calls === 1
          ? jsonResponse(BODY_EXCHANGE_LIST_FULL)
          : jsonResponse(BODY_KEY_INVALID)
      },
    })
    await client.exchangeNames()
    let thrown: unknown
    try {
      await client.liquidationOrders({
        exchange: 'Binance',
        symbol: 'BTC',
        minLiquidationUsd: 1_000,
        startTime: 0,
        endTime: 1,
      })
    } catch (e) {
      thrown = e
    }
    expect((thrown as CoinglassApiError).reason).toBe('plan_required')
  })

  test('the request carries every mandatory liquidation-order parameter', async () => {
    const seen: Array<URL> = []
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async (input) => {
        seen.push(new URL(String(input)))
        return jsonResponse(BODY_ORDER_SINGLE)
      },
    })
    await client.liquidationOrders({
      exchange: 'Binance',
      symbol: 'BTC',
      minLiquidationUsd: 1_000,
      startTime: 1_745_216_000_000,
      endTime: 1_745_216_400_000,
    })
    const url = seen[0]
    expect(url.pathname).toBe('/api/futures/liquidation/order')
    expect(url.searchParams.get('exchange')).toBe('Binance')
    // A COIN, not a pair. Rows carry the pair and are filtered client-side.
    expect(url.searchParams.get('symbol')).toBe('BTC')
    expect(url.searchParams.get('min_liquidation_amount')).toBe('1000')
    expect(url.searchParams.get('start_time')).toBe('1745216000000')
    expect(url.searchParams.get('end_time')).toBe('1745216400000')
  })

  test('a transport 429 refuses without parsing a body', async () => {
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async () => new Response('', { status: 429 }),
    })
    await expect(client.exchangeNames()).rejects.toThrow(/rate limit/i)
  })

  test('the key budget headers are read off the response', async () => {
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async () =>
        jsonResponse(BODY_EXCHANGE_LIST_FULL, {
          headers: { 'API-KEY-MAX-LIMIT': '300', 'API-KEY-USE-LIMIT': '7' },
        }),
    })
    expect(client.budget()).toEqual({ max: null, used: null })
    await client.exchangeNames()
    expect(client.budget()).toEqual({ max: 300, used: 7 })
  })

  test('a blank key refuses before any request leaves', async () => {
    let called = false
    const client = createCoinglassClient({
      apiKey: '   ',
      limiter: instantLimiter(),
      fetchImpl: async () => {
        called = true
        return jsonResponse(BODY_EXCHANGE_LIST_FULL)
      },
    })
    await expect(client.exchangeNames()).rejects.toThrow(/needs an API key/)
    expect(called).toBe(false)
  })

  test('a network failure is an upstream refusal, not a crash', async () => {
    const client = createCoinglassClient({
      apiKey: 'k',
      limiter: instantLimiter(),
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      },
    })
    let thrown: unknown
    try {
      await client.exchangeNames()
    } catch (e) {
      thrown = e
    }
    expect((thrown as CoinglassApiError).reason).toBe('upstream')
  })
})
