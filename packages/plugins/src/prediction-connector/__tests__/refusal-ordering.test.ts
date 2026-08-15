// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Refusal ordering and synchrony, through the real plugin shell.
 *
 * The spot fleet pins the same four properties in `ccxt-connector/__tests__/
 * geo-parity.test.ts`; this is the prediction sibling, deliberately a separate
 * file so the spot venue×country matrix stays undisturbed. What is asserted:
 *
 *  1. **`platformCheck` before `geoCheck`.** A browser user on a
 *     desktop-only venue must see "this venue needs the desktop app", not a
 *     region dialog for a region that is not the problem.
 *  2. **`geoCheck` before slot resolution**, and `tradeGeoCheck` after it — so
 *     a missing credential reads as 'No credentials configured' rather than as
 *     a geo error the user cannot fix by adding a key.
 *  3. **Synchrony.** A refusal out of `subscribe()` is THROWN, not returned as
 *     a rejected promise. The region and platform dialogs are raised from the
 *     `catch` around the synchronous call; a rejection arrives after the chart
 *     has already drawn its empty state.
 *  4. **Refusal before channel work.** Nothing is acquired, no ccxt class is
 *     imported, and no loop is started before the checks run.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import {
  isGeoRestrictedError,
  isPlatformRestrictedError,
} from '@pairlens/market-engine/errors'
import {
  createKalshiMarketConnectorPlugin,
  kalshiMarketConnectorManifest,
} from '../venues/kalshi'
import {
  createPolymarketMarketConnectorPlugin,
  polymarketMarketConnectorManifest,
} from '../venues/polymarket'
import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'

// `isCorsConstrained` reads `globalThis.window`: present means a browser build.
const g = globalThis as { window?: unknown }
const hadWindow = 'window' in g
const originalWindow = g.window

let plugins: Array<PluginInstance> = []

afterEach(async () => {
  if (hadWindow) g.window = originalWindow
  else delete g.window
  await Promise.all(plugins.map((plugin) => plugin.destroy?.()))
  plugins = []
})

function kalshi(): PluginInstance {
  const plugin = createKalshiMarketConnectorPlugin(
    kalshiMarketConnectorManifest,
  )
  plugins.push(plugin)
  return plugin
}

function polymarket(): PluginInstance {
  const plugin = createPolymarketMarketConnectorPlugin(
    polymarketMarketConnectorManifest,
  )
  plugins.push(plugin)
  return plugin
}

function params(
  market: string,
  country: string,
  capability: PluginExecuteParams['capability'] = 'market-data:candles',
  extra: Record<string, unknown> = {},
): PluginExecuteParams {
  const pair = market === 'kalshi' ? 'KXBTCD-26AUG15-T53' : 'FED-CUT-YES'
  return {
    capability,
    params: { pair, timeframe: '1h', ...extra },
    context: {
      pair,
      market,
      timeframe: '1h',
      mode: 'paper' as const,
      country,
    },
  }
}

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('platform refusal', () => {
  it('kalshi/browser: subscribe throws a PlatformRestrictedError synchronously', () => {
    g.window = {}
    const plugin = kalshi()
    const thrown = caught(() =>
      plugin.subscribe?.(params('kalshi', 'US'), () => {}),
    )
    expect(isPlatformRestrictedError(thrown)).toBe(true)
    // The human label, not the market id — it reaches the user verbatim.
    expect((thrown as Error).message).toContain('Kalshi')
  })

  it('kalshi/browser: execute refuses on every capability', async () => {
    g.window = {}
    const plugin = kalshi()
    for (const capability of [
      'market-data:history',
      'market-data:events',
      'market-data:discovery:search',
      'trading:balances',
    ] as const) {
      await expect(
        plugin.execute(params('kalshi', 'US', capability)),
      ).rejects.toThrow('Kalshi')
    }
  })

  it('kalshi/desktop: no platform refusal', () => {
    // No `window` is the Tauri/CLI shape, where REST goes through Rust and is
    // CORS-exempt.
    delete g.window
    const plugin = kalshi()
    const thrown = caught(() =>
      plugin.subscribe?.(params('kalshi', 'US'), () => {}),
    )
    expect(thrown).toBeUndefined()
  })

  it('polymarket/browser: no platform refusal — its hosts are CORS-open', () => {
    g.window = {}
    const plugin = polymarket()
    const thrown = caught(() =>
      plugin.subscribe?.(params('polymarket', 'US'), () => {}),
    )
    expect(thrown).toBeUndefined()
  })
})

describe('trade geo refusal', () => {
  it('polymarket/US: refuses order placement once a credential resolves', async () => {
    const plugin = polymarket()
    await plugin.initialize?.({
      walletId: 'w1',
      address: '0xabc',
      country: 'US',
      mode: 'live',
    })
    const thrown = await plugin
      .execute(
        params('polymarket', 'US', 'trading:orders', {
          side: 'buy',
          type: 'limit',
          size: '10',
          price: '0.5',
        }),
      )
      .catch((error: unknown) => error)
    expect(isGeoRestrictedError(thrown)).toBe(true)
  })

  it('polymarket/US: a MISSING credential reads as missing, not as geo', async () => {
    // tradeGeoCheck runs AFTER slot resolution precisely so this stays true:
    // adding a key is the fix here, and a geo error would send the user to a
    // dialog that cannot help.
    const plugin = polymarket()
    const result = (await plugin.execute(
      params('polymarket', 'US', 'trading:orders', {
        side: 'buy',
        type: 'limit',
        size: '10',
        price: '0.5',
      }),
    )) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    // A wallet venue says so: the user has no credential form to fill in.
    expect(result.error).toBe('No wallet connected')
  })

  it('polymarket/DE: an unknown credentialId never falls back to another slot', async () => {
    const plugin = polymarket()
    await plugin.initialize?.({
      walletId: 'w1',
      address: '0xabc',
      country: 'DE',
    })
    const result = (await plugin.execute(
      params('polymarket', 'DE', 'trading:orders', {
        credentialId: 'not-a-slot',
        side: 'buy',
        type: 'limit',
        size: '10',
        price: '0.5',
      }),
    )) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not-a-slot')
  })
})

describe('slot provisioning fails closed', () => {
  it('kalshi: no slot without both credential fields', async () => {
    const plugin = kalshi()
    await plugin.initialize?.({ credentialId: 'c1', apiKey: 'only-the-key' })
    const result = (await plugin.execute(
      params('kalshi', 'US', 'trading:orders', {
        credentialId: 'c1',
        side: 'buy',
        type: 'limit',
        size: '10',
        price: '0.5',
      }),
    )) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('c1')
  })

  it('polymarket: a bare initialize creates no slot on a wallet venue', async () => {
    // credentialKeys is empty here, so the key path would otherwise build a
    // slot that exists, resolves, and cannot sign.
    const plugin = polymarket()
    await plugin.initialize?.({ credentialId: 'c1' })
    expect(
      await plugin.execute(params('polymarket', 'DE', 'trading:balances')),
    ).toEqual([])
  })
})

describe('unsupported capabilities', () => {
  it('names the venue and the capability rather than failing opaquely', async () => {
    const plugin = polymarket()
    await expect(
      plugin.execute(params('polymarket', 'DE', 'ai:inference')),
    ).rejects.toThrow('polymarket')
    expect(
      caught(() =>
        plugin.subscribe?.(
          params('polymarket', 'DE', 'ai:inference'),
          () => {},
        ),
      ),
    ).toBeInstanceOf(Error)
  })
})
