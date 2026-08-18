// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What this provider refuses, and why refusing has to be loud.
 *
 * DexPaprika is the priority-6 fallback behind GeckoTerminal on
 * `market-data:pool-stats`, and it does not serve every action on that
 * capability. Returning null for the ones it cannot serve looks harmless and
 * is not: the plugin manager only walks its fallback chain on a THROW, so a
 * null from the fallback becomes the answer the primary failed to produce.
 *
 * That is precisely how the DEX Discovery board emptied itself in a browser.
 * GeckoTerminal sends no CORS header on its 429s, so a rate limit arrived as
 * an opaque fetch rejection, the manager walked here, this provider answered
 * null, and the pool map rendered "the data provider listed nothing for this
 * chain" — a fact about the chain, invented out of a fact about our request
 * budget — with three panes sitting idle behind it waiting for a selection
 * that could never come.
 */
import { describe, expect, it } from 'bun:test'

import {
  createDexpaprikaDataProviderPlugin,
  dexpaprikaDataProviderManifest as manifest,
} from '../index'

const CONTEXT = {
  pair: 'SOL-USDC',
  market: 'jupiter',
  timeframe: '1h',
  mode: 'paper' as const,
  country: 'US',
}

const UNSERVED = ['pools', 'new-pools', 'trades']

describe('pool-stats actions it does not serve', () => {
  for (const action of UNSERVED) {
    it(`refuses '${action}' rather than answering null`, async () => {
      const plugin = createDexpaprikaDataProviderPlugin(manifest)
      await expect(
        plugin.execute({
          capability: 'market-data:pool-stats',
          params: { action, market: 'jupiter' },
          context: CONTEXT,
        }),
      ).rejects.toThrow(/does not publish/)
    })
  }

  it('names the action it refused, so the reason is readable', async () => {
    const plugin = createDexpaprikaDataProviderPlugin(manifest)
    await expect(
      plugin.execute({
        capability: 'market-data:pool-stats',
        params: { action: 'pools', market: 'jupiter' },
        context: CONTEXT,
      }),
    ).rejects.toThrow(/'pools'/)
  })
})
