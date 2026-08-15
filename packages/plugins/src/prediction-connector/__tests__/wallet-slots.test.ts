// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Wallet slot routing, and the vault-access budget behind it.
 *
 * A wallet venue keys its slots by `walletId`, and the terminal's wallet paths
 * say `walletId` where the credential paths say `credentialId`. Reading only
 * the latter meant every wallet request fell through to "the first slot", so a
 * user with two wallets saw wallet one's balances, orders and positions under
 * wallet two's heading — silently, and with the right-looking numbers.
 *
 * The second half of this file pins how often the vault is touched.
 * `secretRef()` is a decrypt, and the terminal polls positions every 60 s, so
 * resolving it on every acquire meant decrypting the user's wallet key roughly
 * twice a minute while the app sat idle.
 */

import { describe, expect, it } from 'bun:test'
import { createPredictionConnectorPlugin } from '../index'
import {
  polymarketMarketConnectorManifest,
  polymarketPredictionVenue,
} from '../venues/polymarket'
import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'
import type { PredictionExchangeCtor } from '../types'

type Probe = { balanceCalls: Array<string>; decrypts: Array<string> }

/** Reports which wallet the authed instance was built for. */
function walletVenue(probe: Probe) {
  return {
    ...polymarketPredictionVenue,
    loadExchangeClass: async (): Promise<PredictionExchangeCtor> =>
      class {
        has = {}
        urls = {}
        options = {}
        timeframes = {}
        walletAddress = ''
        constructor(config: Record<string, unknown>) {
          this.walletAddress = String(config['walletAddress'] ?? '')
        }
        close = async () => undefined
        fetchTicker = async () => ({})
        fetchOrderBook = async () => ({ bids: [], asks: [] })
        fetchOHLCV = async () => []
        fetchTrades = async () => []
        fetchBalance = async () => {
          probe.balanceCalls.push(this.walletAddress)
          // One unit per wallet, so the caller can tell them apart.
          return {
            total: { USDC: this.walletAddress === '0xAAA' ? 100 : 200 },
            free: { USDC: this.walletAddress === '0xAAA' ? 100 : 200 },
            used: { USDC: 0 },
          }
        }
      } as unknown as PredictionExchangeCtor,
  }
}

async function twoWallets(probe: Probe): Promise<PluginInstance> {
  const plugin = createPredictionConnectorPlugin(
    walletVenue(probe),
    polymarketMarketConnectorManifest,
    { outcomeStorage: null },
  )
  for (const [walletId, address] of [
    ['wallet-a', '0xAAA'],
    ['wallet-b', '0xBBB'],
  ]) {
    await plugin.initialize?.({
      walletId,
      address,
      country: 'DE',
      mode: 'live',
      getPrivateKey: async (id: string) => {
        probe.decrypts.push(id)
        return `0xkey-${id}`
      },
    })
  }
  return plugin
}

function balancesFor(walletId?: string): PluginExecuteParams {
  return {
    capability: 'trading:balances',
    params: walletId ? { walletId } : {},
    context: {
      pair: 'FED-CUT-YES',
      market: 'polymarket',
      timeframe: '1h',
      mode: 'live' as const,
      country: 'DE',
    },
  }
}

describe('wallet slot routing', () => {
  it('routes a walletId to its own slot, not the first one', async () => {
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = await twoWallets(probe)
    try {
      const second = (await plugin.execute(balancesFor('wallet-b'))) as Array<{
        total: string
      }>
      expect(probe.balanceCalls).toEqual(['0xBBB'])
      expect(second[0]?.total).toBe('200')

      const first = (await plugin.execute(balancesFor('wallet-a'))) as Array<{
        total: string
      }>
      expect(probe.balanceCalls).toEqual(['0xBBB', '0xAAA'])
      expect(first[0]?.total).toBe('100')
    } finally {
      await plugin.destroy?.()
    }
  })

  it('fails closed on an unknown walletId rather than serving another wallet', async () => {
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = await twoWallets(probe)
    try {
      expect(await plugin.execute(balancesFor('wallet-gone'))).toEqual([])
      expect(probe.balanceCalls).toEqual([])
    } finally {
      await plugin.destroy?.()
    }
  })

  it('names the wallet, not a credential, when an order has no slot', async () => {
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = await twoWallets(probe)
    try {
      const result = (await plugin.execute({
        capability: 'trading:orders',
        params: {
          walletId: 'wallet-gone',
          side: 'buy',
          type: 'limit',
          size: '1',
          price: '0.5',
        },
        context: balancesFor().context,
      })) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe("Unknown wallet 'wallet-gone'")
    } finally {
      await plugin.destroy?.()
    }
  })

  it('still honours credentialId, and prefers it over walletId', async () => {
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = await twoWallets(probe)
    try {
      await plugin.execute({
        ...balancesFor(),
        params: { credentialId: 'wallet-a', walletId: 'wallet-b' },
      })
      expect(probe.balanceCalls).toEqual(['0xAAA'])
    } finally {
      await plugin.destroy?.()
    }
  })
})

describe('vault access is not per call', () => {
  it('decrypts once per wallet, not once per request', async () => {
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = await twoWallets(probe)
    try {
      // The shape of an idle terminal: a positions/balances poll, repeatedly.
      for (let i = 0; i < 5; i++) {
        await plugin.execute(balancesFor('wallet-a'))
      }
      expect(probe.balanceCalls.length).toBe(5)
      expect(probe.decrypts).toEqual(['wallet-a'])
    } finally {
      await plugin.destroy?.()
    }
  })

  it('decrypts again when the slot is re-provisioned', async () => {
    // A re-provision is the signal a rotated key arrives on: `initialize`
    // builds a fresh slot object every time, so identity is exact.
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = await twoWallets(probe)
    try {
      await plugin.execute(balancesFor('wallet-a'))
      expect(probe.decrypts).toEqual(['wallet-a'])

      await plugin.initialize?.({
        walletId: 'wallet-a',
        address: '0xAAA',
        country: 'DE',
        mode: 'live',
        getPrivateKey: async (id: string) => {
          probe.decrypts.push(id)
          return `0xkey-${id}`
        },
      })
      await plugin.execute(balancesFor('wallet-a'))
      expect(probe.decrypts).toEqual(['wallet-a', 'wallet-a'])
      // Same key, so the warm instance is kept rather than rebuilt.
      expect(probe.balanceCalls).toEqual(['0xAAA', '0xAAA'])
    } finally {
      await plugin.destroy?.()
    }
  })

  it('rebuilds the instance when the key behind a slot changed', async () => {
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = await twoWallets(probe)
    try {
      await plugin.execute(balancesFor('wallet-a'))
      await plugin.initialize?.({
        walletId: 'wallet-a',
        address: '0xAAA',
        country: 'DE',
        mode: 'live',
        getPrivateKey: async () => '0xdifferent-key-entirely',
      })
      await plugin.execute(balancesFor('wallet-a'))
      // Still the right wallet — the rebuild is about the signing key, not
      // the account.
      expect(probe.balanceCalls).toEqual(['0xAAA', '0xAAA'])
    } finally {
      await plugin.destroy?.()
    }
  })

  it('reports a locked wallet rather than silently serving nothing', async () => {
    const probe: Probe = { balanceCalls: [], decrypts: [] }
    const plugin = createPredictionConnectorPlugin(
      walletVenue(probe),
      polymarketMarketConnectorManifest,
      { outcomeStorage: null },
    )
    try {
      await plugin.initialize?.({
        walletId: 'locked',
        address: '0xAAA',
        country: 'DE',
        getPrivateKey: async () => null,
      })
      const result = (await plugin.execute({
        capability: 'trading:orders',
        params: {
          walletId: 'locked',
          side: 'buy',
          type: 'limit',
          size: '1',
          price: '0.5',
        },
        context: balancesFor().context,
      })) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('locked')
    } finally {
      await plugin.destroy?.()
    }
  })
})
