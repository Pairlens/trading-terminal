// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The platform-restriction CONTRACT the terminal relies on.
 *
 * A browser tab can only call REST hosts that send `Access-Control-Allow-Origin`.
 * Coinbase, Gate, KuCoin and MEXC send none, and none of them streams enough
 * candle history to seed a chart from WS instead (Coinbase's WS candles are
 * 5-minute-only, Gate's and MEXC's carry a single bar, and KuCoin cannot even
 * open a socket — its WS URL comes from a REST POST that is itself blocked).
 *
 * Left alone, that surfaces as the original bug: the REST backfill dies
 * silently, the CORS-exempt WS feeds keep streaming, and the chart hangs and
 * then renders one live candle. So these connectors refuse up front with a
 * typed PlatformRestrictedError, and the terminal (use-candle-stream →
 * PaneDesktopOnly) keys entirely off `isPlatformRestrictedError` — a regression
 * here silently brings the dead chart back.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'

import {
  coinbaseMarketConnectorManifest,
  createCoinbaseMarketConnectorPlugin,
} from '../coinbase-market-connector'
import {
  createGateMarketConnectorPlugin,
  gateMarketConnectorManifest,
} from '../gate-market-connector'
import {
  createKucoinMarketConnectorPlugin,
  kucoinMarketConnectorManifest,
} from '../kucoin-market-connector'
import {
  createOkxMarketConnectorPlugin,
  okxMarketConnectorManifest,
} from '../okx-market-connector'
import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'

const g = globalThis as { window?: unknown }
const hadWindow = 'window' in g
const originalWindow = g.window

afterEach(() => {
  if (hadWindow) g.window = originalWindow
  else delete g.window
})

const RESTRICTED: Array<[string, () => PluginInstance]> = [
  [
    'coinbase',
    () => createCoinbaseMarketConnectorPlugin(coinbaseMarketConnectorManifest),
  ],
  ['gate', () => createGateMarketConnectorPlugin(gateMarketConnectorManifest)],
  [
    'kucoin',
    () => createKucoinMarketConnectorPlugin(kucoinMarketConnectorManifest),
  ],
]

const candleSub = (market: string): PluginExecuteParams => ({
  capability: 'market-data:candles',
  params: { pair: 'BTC-USDT', timeframe: '15m' },
  context: {
    pair: 'BTC-USDT',
    market,
    timeframe: '15m',
    mode: 'paper' as const,
    // A region every one of these venues serves, so a geo block can't be
    // mistaken for the platform block under test.
    country: 'ES',
  },
})

function subscribeError(plugin: PluginInstance, market: string): unknown {
  try {
    plugin.subscribe!(candleSub(market), () => {})
  } catch (e) {
    return e
  }
  return undefined
}

describe('desktop-only venues in a browser build', () => {
  for (const [market, make] of RESTRICTED) {
    it(`${market} refuses with a typed PlatformRestrictedError`, () => {
      g.window = {} // production browser build: CORS applies
      const thrown = subscribeError(make(), market)
      expect(isPlatformRestrictedError(thrown)).toBe(true)
    })

    it(`${market} works normally on desktop`, () => {
      g.window = { __TAURI_INTERNALS__: {} } // Rust-side fetch, CORS-exempt
      const thrown = subscribeError(make(), market)
      expect(isPlatformRestrictedError(thrown)).toBe(false)
    })
  }

  // OKX must NOT be gated: its regional hosts are CORS-blocked, but public
  // reads fall back to the CORS-enabled global host, which serves identical
  // data. Gating it would take the venue in the original bug report offline
  // instead of fixing it.
  it('does not gate OKX — it reads public data from the global host', () => {
    g.window = {}
    const thrown = subscribeError(
      createOkxMarketConnectorPlugin(okxMarketConnectorManifest),
      'okx',
    )
    expect(isPlatformRestrictedError(thrown)).toBe(false)
  })

  it('does not gate anything outside a browser (CLI)', () => {
    delete g.window
    for (const [market, make] of RESTRICTED) {
      expect(isPlatformRestrictedError(subscribeError(make(), market))).toBe(
        false,
      )
    }
  })
})
