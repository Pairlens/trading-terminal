// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The 2h fold on the five venues with no native 2h interval.
 *
 * The chart toolbar offers 2h on every venue, but Kraken, HTX, MEXC, Bitget
 * and Bitfinex serve no 2h anywhere — REST or WS — and neither did the native
 * connectors (their supportedTimeframes omitted it; the toolbar button was
 * dead there too). The venues now fold 2h out of 1h through
 * `withDerivedCandles`, the same machinery Upbit and Coinbase ship. These
 * tests pin the advertisement and drive one venue end to end through the real
 * ccxt class: a 2h history request must reach the wire as a 1h request and
 * come back folded.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { BITFINEX_ADAPTER_INFO } from '../venues/bitfinex'
import { HTX_ADAPTER_INFO } from '../venues/htx'
import { KRAKEN_ADAPTER_INFO } from '../venues/kraken'
import { MEXC_ADAPTER_INFO } from '../venues/mexc'
import {
  BITGET_ADAPTER_INFO,
  bitgetMarketConnectorManifest,
  createBitgetMarketConnectorPlugin,
} from '../venues/bitget'
import type { Candle } from '@pairlens/shared/types'
import type { PluginInstance } from '@pairlens/plugin-system/types'

describe('2h advertisement', () => {
  const INFOS = [
    ['kraken', KRAKEN_ADAPTER_INFO],
    ['htx', HTX_ADAPTER_INFO],
    ['mexc', MEXC_ADAPTER_INFO],
    ['bitget', BITGET_ADAPTER_INFO],
    ['bitfinex', BITFINEX_ADAPTER_INFO],
  ] as const

  for (const [name, info] of INFOS) {
    it(`${name} advertises the folded 2h`, () => {
      expect(info.supportedTimeframes).toContain('2h')
    })
  }
})

describe('bitget 2h history folds from 1h', () => {
  const openPlugins: Array<PluginInstance> = []
  afterEach(async () => {
    while (openPlugins.length > 0) await openPlugins.pop()?.destroy?.()
  })

  it('requests granularity=1h on the wire and returns 2h bars', async () => {
    const HOUR = 3_600_000
    // Four settled hourly bars on even UTC hours: folds to two 2h bars.
    const t0 = 1_700_000_000_000 - (1_700_000_000_000 % (2 * HOUR))
    const row = (ts: number, o: number, c: number) => [
      String(ts),
      String(o),
      String(Math.max(o, c) + 1), // high
      String(Math.min(o, c) - 1), // low
      String(c),
      '10', // base volume
      '1000', // usdt volume
      '1000', // quote volume
    ]
    const urls: Array<string> = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input)
      urls.push(url)
      const payload = url.includes('granularity=')
        ? {
            code: '00000',
            msg: 'success',
            requestTime: 0,
            data: [
              row(t0, 100, 101),
              row(t0 + HOUR, 101, 102),
              row(t0 + 2 * HOUR, 102, 103),
              row(t0 + 3 * HOUR, 103, 104),
            ],
          }
        : { code: '00000', msg: 'success', requestTime: 0, data: [] }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const plugin = createBitgetMarketConnectorPlugin(
        bitgetMarketConnectorManifest,
      )
      openPlugins.push(plugin)
      const candles = (await plugin.execute({
        capability: 'market-data:history' as never,
        params: { pair: 'BTC-USDT', timeframe: '2h', limit: 2 },
        context: {
          pair: 'BTC-USDT',
          market: 'bitget',
          timeframe: '2h',
          mode: 'paper' as const,
          country: '',
        },
      })) as Array<Candle>

      const candleRequest = urls.find((url) => url.includes('granularity='))
      expect(candleRequest).toContain('granularity=1h')
      expect(candles).toHaveLength(2)
      expect(candles[0]?.ts).toBe(t0)
      expect(candles[0]?.open).toBe(100)
      expect(candles[0]?.close).toBe(102)
      expect(candles[0]?.volume).toBe(20)
      expect(candles[1]?.ts).toBe(t0 + 2 * HOUR)
      expect(candles[1]?.close).toBe(104)
    } finally {
      // Tear the plugin down BEFORE handing `fetch` back.
      //
      // `execute` leaves a ccxt `loadMarkets()` in flight, and the destroy in
      // `afterEach` runs AFTER this block. In that gap the stub is gone, so
      // those requests go out over the real network: two live calls to
      // api.bitget.com per run, landing late enough to be recorded by the next
      // test file's stub. That is what made an unrelated GeckoTerminal
      // resolver test count three requests where it makes one.
      while (openPlugins.length > 0) await openPlugins.pop()?.destroy?.()
      globalThis.fetch = original
    }
  })
})
