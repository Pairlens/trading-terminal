// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The capability surface: two actions, a refusal for everything else, and a
 * plugin that still works with no key at all.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { resetProviderThrottles } from '@pairlens/market-engine/provider-throttle'
import {
  createHeliusRpcProviderPlugin,
  heliusRpcProviderManifest,
} from '../index'
import { PUBLIC_SOLANA_RPC_URL } from '../rpc-client'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  resetProviderThrottles()
})

const context = {
  pair: '',
  market: 'jupiter',
  timeframe: '',
  mode: 'paper' as const,
  country: 'US',
}

function plugin() {
  return createHeliusRpcProviderPlugin(heliusRpcProviderManifest)
}

describe('manifest', () => {
  test('declares rpc:solana for the Solana market, and nothing else', () => {
    expect(heliusRpcProviderManifest.capabilities).toHaveLength(1)
    const declaration = heliusRpcProviderManifest.capabilities[0]
    expect(declaration.id).toBe('rpc:solana')
    expect(declaration.markets).toEqual(['jupiter'])
    expect(declaration.priority).toBe(5)
  })

  test('the API key is a secret field, and optional', () => {
    const field = heliusRpcProviderManifest.config['apiKey']
    expect(field.type).toBe('secret')
    // Required would refuse activation without a key, leaving a fresh install
    // with no rpc:solana provider at all.
    expect(field.required).toBeFalsy()
  })
})

describe('endpoint action', () => {
  test('answers with the public node before any key is configured', async () => {
    const instance = plugin()
    await expect(
      instance.execute({
        capability: 'rpc:solana',
        params: { action: 'endpoint' },
        context,
      }),
    ).resolves.toEqual({
      url: PUBLIC_SOLANA_RPC_URL,
      provider: 'solana-public',
    })
  })

  test('switches to Helius once a key is configured', async () => {
    const instance = plugin()
    await instance.initialize?.({ apiKey: 'k-1' })
    const endpoint = (await instance.execute({
      capability: 'rpc:solana',
      params: { action: 'endpoint' },
      context,
    })) as { url: string; provider: string }
    expect(endpoint.provider).toBe('helius')
    expect(endpoint.url).toContain('api-key=k-1')
  })

  test('clearing the key falls back rather than keeping a stale endpoint', async () => {
    const instance = plugin()
    await instance.initialize?.({ apiKey: 'k-1' })
    await instance.initialize?.({})
    const endpoint = (await instance.execute({
      capability: 'rpc:solana',
      params: { action: 'endpoint' },
      context,
    })) as { provider: string }
    expect(endpoint.provider).toBe('solana-public')
  })
})

describe('call action', () => {
  test('forwards the method and returns the result', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 7 }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch
    const instance = plugin()
    await expect(
      instance.execute({
        capability: 'rpc:solana',
        params: { action: 'call', method: 'getSlot', params: [] },
        context,
      }),
    ).resolves.toBe(7)
  })

  test('a call with no method is refused rather than sent', async () => {
    const instance = plugin()
    await expect(
      instance.execute({
        capability: 'rpc:solana',
        params: { action: 'call' },
        context,
      }),
    ).rejects.toThrow('requires a method')
  })
})

describe('refusals', () => {
  test('an unknown action throws instead of falling through', async () => {
    const instance = plugin()
    await expect(
      instance.execute({
        capability: 'rpc:solana',
        params: { action: 'sendTransaction' },
        context,
      }),
    ).rejects.toThrow("unknown action 'sendTransaction'")
  })

  test('another capability is refused', async () => {
    const instance = plugin()
    await expect(
      instance.execute({
        capability: 'trading:orders',
        params: {},
        context,
      }),
    ).rejects.toThrow('unsupported capability')
  })
})
