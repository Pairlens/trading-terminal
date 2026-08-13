// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * REST and WS candles must agree on where a bar begins.
 *
 * OKX and Bitget publish every timeframe >= 6h in TWO boundary conventions:
 * UTC-aligned (`1Dutc` / granularity `1Dutc`) and Hong-Kong-aligned (`1D` /
 * granularity `1day`). ccxt's REST `fetchOHLCV` defaults to the UTC variants
 * while ccxt Pro's `watchOHLCV` subscribes to the HK channels — and a live
 * bar stamped 16:00 UTC can never land on a history of 00:00 UTC bars: the
 * CandleBuffer drops it for 16 hours, then appends it as a phantom extra bar.
 * The venue configs pin REST back to the WS (and native-connector)
 * convention; these tests capture the actual request each real ccxt class
 * builds through the plugin's history path, so a ccxt bump that moves the
 * option shapes fails here rather than on a user's daily chart.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { createCcxtConnectorPlugin } from '../index'
import { okxCcxtVenue, okxMarketConnectorManifest } from '../venues/okx'
import {
  bitgetCcxtVenue,
  bitgetMarketConnectorManifest,
} from '../venues/bitget'
import type { CcxtMarketSeed, CcxtVenueConfig } from '../types'
import type { MarketsStorage } from '../markets'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

function market(id: string): CcxtMarketSeed {
  return {
    id,
    lowercaseId: id.toLowerCase(),
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    baseId: 'BTC',
    quoteId: 'USDT',
    type: 'spot',
    spot: true,
    active: true,
    precision: { amount: 0.0001, price: 0.1 },
    info: {},
  }
}

function warmMarkets(row: CcxtMarketSeed): MarketsStorage {
  return {
    get: async () => ({ savedAt: Date.now(), markets: [row] }),
    set: async () => {},
  }
}

/** Capture every request URL; answer with the venue's empty-success payload. */
function stubFetch(payload: unknown): {
  urls: Array<string>
  restore: () => void
} {
  const urls: Array<string> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown) => {
    urls.push(String(input))
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { urls, restore: () => void (globalThis.fetch = original) }
}

const openPlugins: Array<PluginInstance> = []
afterEach(async () => {
  while (openPlugins.length > 0) await openPlugins.pop()?.destroy?.()
})

async function fetchHistory(
  venue: CcxtVenueConfig,
  manifest: PluginManifest,
  row: CcxtMarketSeed,
  timeframe: string,
): Promise<void> {
  const plugin = createCcxtConnectorPlugin(venue, manifest, {
    marketsStorage: warmMarkets(row),
  })
  openPlugins.push(plugin)
  await plugin.execute({
    capability: 'market-data:history' as never,
    params: { pair: 'BTC-USDT', timeframe, limit: 100 },
    context: {
      pair: 'BTC-USDT',
      market: venue.marketId,
      timeframe,
      mode: 'paper' as const,
      country: '',
    },
  })
}

describe('okx candle bar alignment', () => {
  it('REST requests the HK-aligned bar the WS channel delivers', async () => {
    const stub = stubFetch({ code: '0', msg: '', data: [] })
    try {
      await fetchHistory(
        okxCcxtVenue,
        okxMarketConnectorManifest,
        market('BTC-USDT'),
        '1d',
      )
      const candles = stub.urls.find((url) => url.includes('bar='))
      expect(candles).toBeDefined()
      // `bar=1D` is what `candle1D` (the WS channel) delivers; `bar=1Dutc`
      // was the 8-hours-apart default.
      expect(candles).toContain('bar=1D')
      expect(candles).not.toContain('bar=1Dutc')
    } finally {
      stub.restore()
    }
  })

  it('holds for the weekly bar too', async () => {
    const stub = stubFetch({ code: '0', msg: '', data: [] })
    try {
      await fetchHistory(
        okxCcxtVenue,
        okxMarketConnectorManifest,
        market('BTC-USDT'),
        '1w',
      )
      const candles = stub.urls.find((url) => url.includes('bar='))
      expect(candles).toContain('bar=1W')
      expect(candles).not.toContain('bar=1Wutc')
    } finally {
      stub.restore()
    }
  })
})

describe('bitget candle bar alignment', () => {
  it('REST requests the HK-aligned granularity the WS channel delivers', async () => {
    const stub = stubFetch({
      code: '00000',
      msg: 'success',
      requestTime: 0,
      data: [],
    })
    try {
      await fetchHistory(
        bitgetCcxtVenue,
        bitgetMarketConnectorManifest,
        market('BTCUSDT'),
        '1d',
      )
      const candles = stub.urls.find((url) => url.includes('granularity='))
      expect(candles).toBeDefined()
      // `granularity=1day` matches `candle1D` (UTC+8); `1Dutc` was the
      // mismatched default. Same convention the native's TF_TO_REST used.
      expect(candles).toContain('granularity=1day')
    } finally {
      stub.restore()
    }
  })

  it('keeps ccxt defaults for sub-6h timeframes and the WS gap channels HK-aligned', async () => {
    // Config-level pins: deepExtend must merge, not replace — the sub-6h REST
    // keys stay ccxt's, and the two WS gap channels stay in the same (HK)
    // convention the REST table now speaks.
    const options = bitgetCcxtVenue.options?.['options'] as Record<
      string,
      unknown
    >
    const spot = (options['fetchOHLCV'] as Record<string, unknown>)[
      'timeframes'
    ] as Record<string, Record<string, string>>
    expect(spot['spot']?.['1w']).toBe('1week')
    expect(spot['spot']?.['3d']).toBe('3day')
    expect(spot['spot']?.['1m']).toBeUndefined()
    expect(options['timeframes']).toEqual({ '3d': '3D', '1M': '1M' })
  })
})
