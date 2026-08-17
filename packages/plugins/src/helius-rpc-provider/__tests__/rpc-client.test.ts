// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Endpoint resolution, pacing and refusal classification.
 *
 * Three things here are load-bearing. A key must not be able to break its own
 * URL. A rate limit must arrive as a throttle the terminal recognises, not as
 * an empty answer that reads like "this wallet holds nothing". And the budget
 * must be shared: the whole point of a limiter is that callers who cannot see
 * each other still queue behind one window.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'
import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import {
  isProviderThrottled,
  resetProviderThrottles,
} from '@pairlens/market-engine/provider-throttle'
import {
  HELIUS_MAINNET_URL,
  HELIUS_RPS,
  PUBLIC_RPS,
  PUBLIC_SOLANA_RPC_URL,
  createEndpointLimiter,
  isSolanaRpcError,
  resolveEndpoint,
  solanaRpcCall,
} from '../rpc-client'
import type { SolanaRpcError } from '../rpc-client'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  resetProviderThrottles()
})

function stubFetch(
  responder: (url: string, init: RequestInit | undefined) => Response,
): Array<{ url: string; body: unknown }> {
  const calls: Array<{ url: string; body: unknown }> = []
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })
    return responder(url, init)
  }) as typeof fetch
  return calls
}

function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('resolveEndpoint', () => {
  test('no key means the public node, and says so', () => {
    expect(resolveEndpoint(null)).toEqual({
      url: PUBLIC_SOLANA_RPC_URL,
      provider: 'solana-public',
    })
    expect(resolveEndpoint('   ')).toEqual({
      url: PUBLIC_SOLANA_RPC_URL,
      provider: 'solana-public',
    })
  })

  test('a key means Helius, with the key in the query string', () => {
    const endpoint = resolveEndpoint('abc-123')
    expect(endpoint.provider).toBe('helius')
    expect(endpoint.url).toBe(`${HELIUS_MAINNET_URL}?api-key=abc-123`)
  })

  test('a key is encoded, so it cannot open a second parameter', () => {
    // An unescaped `&` would turn the rest of the key into another query
    // parameter and send a truncated key.
    expect(resolveEndpoint('a&b=c').url).toBe(
      `${HELIUS_MAINNET_URL}?api-key=a%26b%3Dc`,
    )
  })
})

describe('solanaRpcCall', () => {
  const endpoint = resolveEndpoint('key')

  test('returns the JSON-RPC result and posts the method it was given', async () => {
    const calls = stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: 42 }))
    const limiter = createEndpointLimiter('helius')
    await expect(
      solanaRpcCall({ endpoint, limiter, method: 'getSlot', params: [1] }),
    ).resolves.toBe(42)
    expect(calls[0].body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSlot',
      params: [1],
    })
  })

  test('a JSON-RPC error member throws rather than resolving null', async () => {
    // `null` is a real answer from `getMultipleAccounts` — it means the account
    // does not exist. Collapsing an error into it deletes positions.
    stubFetch(() =>
      json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bad' } }),
    )
    const limiter = createEndpointLimiter('helius')
    const error = await solanaRpcCall({
      endpoint,
      limiter,
      method: 'getAccountInfo',
    }).catch((e: unknown) => e)
    expect(isSolanaRpcError(error)).toBe(true)
    expect((error as SolanaRpcError).code).toBe(-32602)
    expect((error as SolanaRpcError).method).toBe('getAccountInfo')
  })

  test('429 becomes a throttle the terminal already knows how to read', async () => {
    stubFetch(() => json({}, 429, { 'retry-after': '2' }))
    const limiter = createEndpointLimiter('helius')
    const error = await solanaRpcCall({
      endpoint,
      limiter,
      method: 'getSlot',
    }).catch((e: unknown) => e)
    expect(isProviderThrottledError(error)).toBe(true)
    // Registered, not just raised: the pane's "no data for this pair" verdict
    // is what this stops.
    expect(isProviderThrottled('helius')).toBe(true)
  })

  test('a rejected key is named, not buried in a generic failure', async () => {
    stubFetch(() => new Response('Unauthorized', { status: 401 }))
    const limiter = createEndpointLimiter('helius')
    const error = await solanaRpcCall({
      endpoint,
      limiter,
      method: 'getSlot',
    }).catch((e: unknown) => e)
    expect(isSolanaRpcError(error)).toBe(true)
    expect((error as SolanaRpcError).message).toContain('API key')
  })

  test('the public node refusing with 403 is treated as a cool-off', async () => {
    stubFetch(() => new Response('', { status: 403 }))
    const publicEndpoint = resolveEndpoint(null)
    const limiter = createEndpointLimiter('solana-public')
    await solanaRpcCall({
      endpoint: publicEndpoint,
      limiter,
      method: 'getSlot',
    }).catch(() => undefined)
    expect(isProviderThrottled('solana-public')).toBe(true)
  })
})

describe('pacing', () => {
  test('the endpoint budgets differ, and the keyless one is the smaller', () => {
    expect(HELIUS_RPS).toBeGreaterThan(PUBLIC_RPS)
  })

  test('calls past the budget queue instead of being issued', async () => {
    let now = 0
    const waits: Array<number> = []
    const limiter = createRequestLimiter({
      capacity: 2,
      windowMs: 1000,
      now: () => now,
      delay: async (ms) => {
        waits.push(ms)
        now += ms
      },
    })
    stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: 'ok' }))
    const endpoint = resolveEndpoint('key')

    await Promise.all(
      [0, 1, 2].map(() =>
        solanaRpcCall({ endpoint, limiter, method: 'getSlot' }),
      ),
    )
    // Two go straight through; the third waits out the oldest request's slot.
    expect(waits).toEqual([1001])
  })

  test('a throttle holds the whole queue back, not just the caller that hit it', async () => {
    let now = 0
    const waits: Array<number> = []
    const limiter = createRequestLimiter({
      capacity: 10,
      windowMs: 1000,
      now: () => now,
      delay: async (ms) => {
        waits.push(ms)
        now += ms
      },
    })
    let first = true
    stubFetch(() => {
      if (first) {
        first = false
        return json({}, 429, { 'retry-after': '5' })
      }
      return json({ jsonrpc: '2.0', id: 1, result: 'ok' })
    })
    const endpoint = resolveEndpoint('key')
    await solanaRpcCall({ endpoint, limiter, method: 'getSlot' }).catch(
      () => undefined,
    )
    await solanaRpcCall({ endpoint, limiter, method: 'getSlot' })
    expect(waits).toEqual([5000])
  })
})
