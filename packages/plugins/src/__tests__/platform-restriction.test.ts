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
 * DesktopOnlyState) keys entirely off `isPlatformRestrictedError` — a
 * regression here silently brings the dead chart back.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'

import {
  ALPACA_ADAPTER_INFO,
  BINANCE_ADAPTER_INFO,
  BITFINEX_ADAPTER_INFO,
  BITGET_ADAPTER_INFO,
  BITVAVO_ADAPTER_INFO,
  BYBIT_ADAPTER_INFO,
  COINBASE_ADAPTER_INFO,
  CRYPTOCOM_ADAPTER_INFO,
  GATE_ADAPTER_INFO,
  HTX_ADAPTER_INFO,
  KRAKEN_ADAPTER_INFO,
  KUCOIN_ADAPTER_INFO,
  MEXC_ADAPTER_INFO,
  OKX_ADAPTER_INFO,
  UPBIT_ADAPTER_INFO,
  alpacaMarketConnectorManifest,
  binanceMarketConnectorManifest,
  bitfinexMarketConnectorManifest,
  bitgetMarketConnectorManifest,
  bitvavoMarketConnectorManifest,
  bybitMarketConnectorManifest,
  coinbaseMarketConnectorManifest,
  createCoinbaseMarketConnectorPlugin,
  createGateMarketConnectorPlugin,
  createKucoinMarketConnectorPlugin,
  createMexcMarketConnectorPlugin,
  createOkxMarketConnectorPlugin,
  cryptocomMarketConnectorManifest,
  gateMarketConnectorManifest,
  htxMarketConnectorManifest,
  krakenMarketConnectorManifest,
  kucoinMarketConnectorManifest,
  mexcMarketConnectorManifest,
  okxMarketConnectorManifest,
  upbitMarketConnectorManifest,
} from '../index'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
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
  ['mexc', () => createMexcMarketConnectorPlugin(mexcMarketConnectorManifest)],
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

/**
 * The refusal above is invisible until it fires. Everything that WARNS about it
 * ahead of time — the "Desktop" mark in the venue picker, the workspace gate,
 * the choice of default venue — reads `MarketAdapterInfo.requiresDesktop`, and
 * the terminal builds that struct from the plugin MANIFEST
 * (`getConnectorAdapterInfo`), never from the connector's exported adapter-info
 * const.
 *
 * That is how the mark went missing on first ship: the flag was set on the
 * exported const, which nothing reads. The two must agree.
 */
describe('a venue that needs desktop says so in its manifest', () => {
  const CONNECTORS: Array<[string, PluginManifest, MarketAdapterInfo]> = [
    ['okx', okxMarketConnectorManifest, OKX_ADAPTER_INFO],
    ['binance', binanceMarketConnectorManifest, BINANCE_ADAPTER_INFO],
    ['bybit', bybitMarketConnectorManifest, BYBIT_ADAPTER_INFO],
    ['bitvavo', bitvavoMarketConnectorManifest, BITVAVO_ADAPTER_INFO],
    ['mexc', mexcMarketConnectorManifest, MEXC_ADAPTER_INFO],
    ['kucoin', kucoinMarketConnectorManifest, KUCOIN_ADAPTER_INFO],
    ['gate', gateMarketConnectorManifest, GATE_ADAPTER_INFO],
    ['coinbase', coinbaseMarketConnectorManifest, COINBASE_ADAPTER_INFO],
    ['bitget', bitgetMarketConnectorManifest, BITGET_ADAPTER_INFO],
    ['kraken', krakenMarketConnectorManifest, KRAKEN_ADAPTER_INFO],
    ['htx', htxMarketConnectorManifest, HTX_ADAPTER_INFO],
    ['cryptocom', cryptocomMarketConnectorManifest, CRYPTOCOM_ADAPTER_INFO],
    ['bitfinex', bitfinexMarketConnectorManifest, BITFINEX_ADAPTER_INFO],
    ['upbit', upbitMarketConnectorManifest, UPBIT_ADAPTER_INFO],
    ['alpaca', alpacaMarketConnectorManifest, ALPACA_ADAPTER_INFO],
  ]

  const declared = (manifest: PluginManifest) =>
    manifest.metadata?.['requiresDesktop'] === true

  it('carries the flag on the manifest, which is what the terminal reads', () => {
    // Compared as one object so a mismatch names the venue, not just `false`.
    const fromManifest = Object.fromEntries(
      CONNECTORS.map(([venue, manifest]) => [venue, declared(manifest)]),
    )
    const fromAdapterInfo = Object.fromEntries(
      CONNECTORS.map(([venue, , info]) => [
        venue,
        info.requiresDesktop === true,
      ]),
    )
    expect(fromManifest).toEqual(fromAdapterInfo)
  })

  it('marks exactly the five venues a browser cannot reach', () => {
    // Bitfinex joined the list with the ccxt bridge: api-pub.bitfinex.com
    // sends no Access-Control-Allow-Origin (measured 2026-08), and ccxt's
    // mandatory loadMarkets is a REST call, so a production browser cannot
    // reach the venue at all. The native connector papered over it by seeding
    // history from a WS snapshot; the honest answer is requiresDesktop.
    const marked = CONNECTORS.filter(([, m]) => declared(m)).map(([v]) => v)
    expect(marked.sort()).toEqual([
      'bitfinex',
      'coinbase',
      'gate',
      'kucoin',
      'mexc',
    ])
  })
})
