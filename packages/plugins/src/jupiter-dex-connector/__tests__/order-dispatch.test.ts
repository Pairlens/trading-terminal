// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The dispatch guard, which exists because of a real hazard.
 *
 * `trading:orders` used to handle `quote`, `list` and `cancel` and then FALL
 * THROUGH to order placement for anything else. Two reads the terminal already
 * makes on sibling connectors — `gas` and `lp-positions` — would have arrived
 * at the swap path with `pair`, `side` and `size` defaulted, and the only thing
 * between that and a market buy was whether a wallet happened to be
 * provisioned. So the test that matters is not "unknown actions throw", it is
 * "an unknown action never reaches a key or a network call".
 */
import { describe, expect, test } from 'bun:test'

import {
  JUPITER_ORDER_ACTIONS,
  createJupiterDexConnectorPlugin,
  jupiterDexConnectorManifest,
} from '../index'

const context = {
  pair: 'SOL-USDC',
  market: 'jupiter',
  timeframe: '',
  mode: 'live' as const,
  country: 'US',
}

/**
 * A provisioned wallet whose key retriever and network are both tripwires: a
 * fall-through to placement has to touch one of them.
 */
function provisioned() {
  const touched = { key: 0, fetches: [] as Array<string> }
  const instance = createJupiterDexConnectorPlugin(jupiterDexConnectorManifest)
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: unknown) => {
    touched.fetches.push(String(input))
    return new Response('{}', {
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  const restore = () => {
    globalThis.fetch = realFetch
  }
  return { instance, touched, restore }
}

describe('action set', () => {
  test('placement is in it, so the default action still works', () => {
    expect(JUPITER_ORDER_ACTIONS.has('place')).toBe(true)
  })

  test('every read the terminal makes is declared', () => {
    for (const action of ['quote', 'list', 'cancel', 'lp-positions']) {
      expect(JUPITER_ORDER_ACTIONS.has(action)).toBe(true)
    }
  })
})

describe('unknown actions', () => {
  test('are refused before a wallet slot is even looked up', async () => {
    const { instance, touched, restore } = provisioned()
    try {
      await instance.initialize?.({
        walletId: 'w1',
        address: 'GVweUCKW5R9xtpgfVUGcehZ7V1ymnKBpnMmUdtAmvoFx',
        chain: 'solana',
        getPrivateKey: async () => {
          touched.key += 1
          return 'not-a-real-key'
        },
      })
      await expect(
        instance.execute({
          capability: 'trading:orders',
          params: { action: 'gas' },
          context,
        }),
      ).rejects.toThrow("unknown action 'gas'")
      // The point of the whole guard.
      expect(touched.key).toBe(0)
      expect(touched.fetches).toEqual([])
    } finally {
      restore()
    }
  })

  test('a typo does not become a market order', async () => {
    const { instance, touched, restore } = provisioned()
    try {
      await instance.initialize?.({
        walletId: 'w1',
        address: 'GVweUCKW5R9xtpgfVUGcehZ7V1ymnKBpnMmUdtAmvoFx',
        chain: 'solana',
        getPrivateKey: async () => {
          touched.key += 1
          return 'not-a-real-key'
        },
      })
      for (const action of ['Place', 'lp_positions', 'quotes', 'buy']) {
        await expect(
          instance.execute({
            capability: 'trading:orders',
            params: { action, pair: 'SOL-USDC', side: 'buy', size: '1' },
            context,
          }),
        ).rejects.toThrow('unknown action')
      }
      expect(touched.key).toBe(0)
      expect(touched.fetches).toEqual([])
    } finally {
      restore()
    }
  })
})

describe('lp-positions', () => {
  test('refuses an address that is not base58 without reaching the chain', async () => {
    const { instance, touched, restore } = provisioned()
    try {
      const response = (await instance.execute({
        capability: 'trading:orders',
        params: {
          action: 'lp-positions',
          owner: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        },
        context,
      })) as { errors: Array<{ message: string }>; positions: Array<unknown> }
      // An EVM address arriving here is a wiring bug, and the honest answer is
      // an error row rather than an empty position list.
      expect(response.positions).toEqual([])
      expect(response.errors[0].message).toBe('Invalid address')
      expect(touched.key).toBe(0)
    } finally {
      restore()
    }
  })

  test('never asks for a private key', async () => {
    const { instance, touched, restore } = provisioned()
    try {
      await instance.initialize?.({
        walletId: 'w1',
        address: 'not-base58-at-all!!',
        chain: 'solana',
        getPrivateKey: async () => {
          touched.key += 1
          return 'not-a-real-key'
        },
      })
      await instance.execute({
        capability: 'trading:orders',
        params: { action: 'lp-positions' },
        context,
      })
      expect(touched.key).toBe(0)
    } finally {
      restore()
    }
  })
})
