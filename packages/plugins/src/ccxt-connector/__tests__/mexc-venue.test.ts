// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { isGeoRestrictedError } from '@pairlens/market-engine/errors'
import {
  MEXC_ADAPTER_INFO as NATIVE_ADAPTER_INFO,
  mexcMarketConnectorManifest as nativeManifest,
} from '../../mexc-market-connector'
import {
  MEXC_ADAPTER_INFO,
  mexcCcxtVenue,
  mexcMarketConnectorManifest,
} from '../venues/mexc'
import { isMexcBlocked, resolveMexcCcxtUrls } from '../venues/mexc-regions'
import {
  isMexcProtobufReady,
  parseMexcMiniTicker,
  withMexcQuirks,
} from '../venues/mexc-exchange'
import { parseCcxtTicker } from '../parser'
import type { CcxtExchangeCtor } from '../types'

const BLOCKED = ['US', 'GB', 'UK', 'CA', 'CN', 'SG', 'HK']

describe('mexc manifest parity', () => {
  it('is byte-equal to the native manifest', () => {
    expect(mexcMarketConnectorManifest).toEqual(nativeManifest)
  })

  it('keeps the native adapter info', () => {
    expect(MEXC_ADAPTER_INFO).toEqual(NATIVE_ADAPTER_INFO)
  })

  it('declares no market-data:trades — the aggressor side is unmeasured', () => {
    const ids = mexcMarketConnectorManifest.capabilities.map((c) => c.id)
    expect(ids).not.toContain('market-data:trades')
    expect(ids).toContain('market-data:ticker-snapshot')
  })

  it('declares no trigger orders', () => {
    expect(
      mexcMarketConnectorManifest.metadata?.['triggerOrders'],
    ).toBeUndefined()
    expect(MEXC_ADAPTER_INFO.triggerOrders).toBeUndefined()
  })

  it('declares desktop-only in the spec half too', () => {
    expect(mexcCcxtVenue.requiresDesktop).toBe(true)
    expect(mexcMarketConnectorManifest.metadata?.['requiresDesktop']).toBe(true)
  })

  it('defaults to live mode, like the native', () => {
    expect(mexcCcxtVenue.defaultMode).toBe('live')
  })
})

describe('mexc region gate', () => {
  it('blocks the native seven, case-insensitively', () => {
    for (const code of BLOCKED) {
      expect(isMexcBlocked(code)).toBe(true)
      expect(isMexcBlocked(code.toLowerCase())).toBe(true)
      expect(resolveMexcCcxtUrls(code)).toBeNull()
    }
  })

  it('lets everyone else through', () => {
    expect(resolveMexcCcxtUrls('DE')).toEqual({
      rest: 'https://api.mexc.com',
      ws: 'wss://wbs-api.mexc.com/ws',
    })
    expect(resolveMexcCcxtUrls('')).not.toBeNull()
  })

  it('refuses market-data capabilities with a typed GeoRestrictedError', () => {
    for (const code of BLOCKED) {
      let thrown: unknown
      try {
        mexcCcxtVenue.geoCheck?.(code, 'market-data:candles')
      } catch (error) {
        thrown = error
      }
      expect(isGeoRestrictedError(thrown)).toBe(true)
      expect((thrown as Error).name).toBe('GeoRestrictedError')
    }
  })

  it('leaves non-market-data capabilities to the trading gate', () => {
    // Native parity: geoCheck only covers `market-data:*`; trading is refused
    // after slot resolution so a missing credential still reports as such.
    expect(() => mexcCcxtVenue.geoCheck?.('US', 'trading:orders')).not.toThrow()
  })

  it('refuses to even build an instance for a blocked region', () => {
    const exchange = { urls: { api: { spot: {}, ws: {} } } }
    expect(() => mexcCcxtVenue.applyUrls?.(exchange as never, 'US')).toThrow(
      /not available in your region/,
    )
  })

  it('points spot REST and the spot socket at the venue', () => {
    const exchange = {
      urls: { api: { spot: { public: '', private: '' }, ws: { spot: '' } } },
    }
    mexcCcxtVenue.applyUrls?.(exchange as never, 'DE')
    expect(exchange.urls.api.spot).toEqual({
      public: 'https://api.mexc.com',
      private: 'https://api.mexc.com',
    })
    expect(exchange.urls.api.ws.spot).toBe('wss://wbs-api.mexc.com/ws')
  })
})

describe('mexc paging', () => {
  it('nudges the cursor and caps the page at the real spot limit', () => {
    expect(mexcCcxtVenue.historyPageParams?.(1_700_000_000_000)).toEqual({
      until: 1_699_999_999_999,
    })
    // Docs say 1000; the venue serves 500.
    expect(mexcCcxtVenue.maxHistoryLimit).toBe(500)
  })

  it('passes no orderbook depth — MEXC ignores it', () => {
    expect(mexcCcxtVenue.orderbookDepth).toBeUndefined()
  })
})

// ── Protobuf warm-up ─────────────────────────────────────────────────────

describe('isMexcProtobufReady', () => {
  it('reads ccxt’s NotSupported guard as "not ready"', () => {
    expect(
      isMexcProtobufReady({
        decodeProtoMsg: () => {
          throw new Error(
            'mexc requires protobuf to decode messages, please install it with `npm install protobufjs`',
          )
        },
      }),
    ).toBe(false)
  })

  it('reads any other failure as "loaded, just unhappy with the input"', () => {
    expect(
      isMexcProtobufReady({
        decodeProtoMsg: () => {
          throw new Error('index out of range')
        },
      }),
    ).toBe(true)
  })

  it('reads a clean decode as ready', () => {
    expect(isMexcProtobufReady({ decodeProtoMsg: () => ({}) })).toBe(true)
  })
})

// ── miniTicker ───────────────────────────────────────────────────────────

/** A real frame, captured live 2026-08-11. */
const MINI_TICKER = {
  symbol: 'BTCUSDT',
  price: '63986.23',
  rate: '-0.0049',
  zonedRate: '0',
  high: '65372.97',
  low: '63824.58',
  volume: '439310138.69',
  quantity: '6808.38186171',
}

describe('parseMexcMiniTicker', () => {
  it('turns the fraction into a percent and keeps MEXC’s volume naming straight', () => {
    const parsed = parseMexcMiniTicker(
      MINI_TICKER,
      'BTC/USDT',
      1_786_408_745_035,
    )
    expect(parsed).toMatchObject({
      symbol: 'BTC/USDT',
      last: '63986.23',
      high: '65372.97',
      low: '63824.58',
      // `quantity` is base, `volume` is quote — the opposite of ccxt's names.
      baseVolume: '6808.38186171',
      quoteVolume: '439310138.69',
      percentage: -0.49,
      timestamp: 1_786_408_745_035,
    })
  })

  it('survives the bridge parser with a percent change and no fabricated spread', () => {
    const ticker = parseCcxtTicker(
      parseMexcMiniTicker(MINI_TICKER, 'BTC/USDT', 1_786_408_745_035),
    )
    expect(ticker.last).toBeCloseTo(63986.23, 6)
    expect(ticker.change24h).toBeCloseTo(-0.49, 6)
    expect(ticker.volume24h).toBeCloseTo(6808.38186171, 6)
    // The channel carries no top of book; 0 means "not provided".
    expect(ticker.bid).toBe(0)
    expect(ticker.ask).toBe(0)
    expect(ticker.ts).toBe(1_786_408_745_035)
  })

  it('drops a bad rate rather than reporting NaN', () => {
    const parsed = parseMexcMiniTicker(
      { ...MINI_TICKER, rate: '--' },
      'BTC/USDT',
      1_786_408_745_035,
    )
    expect(parsed['percentage']).toBeUndefined()
  })
})

const SPOT_MARKET = { id: 'BTCUSDT', symbol: 'BTC/USDT', spot: true }

function fakeMexcBase(state: {
  ready: boolean
  calls: Array<string>
  channels?: Array<string>
}) {
  class FakeMexc {
    options: Record<string, unknown> = {}
    markets: Record<string, unknown> = { 'BTC/USDT': SPOT_MARKET }
    tickers: Record<string, unknown> = {}
    decodeProtoMsg(): unknown {
      if (!state.ready) {
        throw new Error('mexc requires protobuf to decode messages')
      }
      return {}
    }
    async loadMarkets(): Promise<unknown> {
      return this.markets
    }
    market(): Record<string, unknown> {
      return SPOT_MARKET
    }
    safeMarket(): Record<string, unknown> {
      return SPOT_MARKET
    }
    safeTicker(ticker: Record<string, unknown>): Record<string, unknown> {
      return ticker
    }
    async watchSpotPublic(
      channel: string,
      messageHash: string,
    ): Promise<Record<string, unknown>> {
      state.channels?.push(`${messageHash} <- ${channel}`)
      return {}
    }
    handleProtobufMessage(): boolean {
      state.calls.push('handleProtobufMessage')
      return true
    }
    async unWatchTicker(): Promise<unknown> {
      state.calls.push('unWatchTicker')
      return undefined
    }
    async fetchSwapMarkets(): Promise<Array<unknown>> {
      state.calls.push('fetchSwapMarkets')
      return [{ id: 'BTC_USDT swap' }]
    }
    async watchOHLCV(): Promise<Array<Array<number>>> {
      state.calls.push('watchOHLCV')
      return [[1, 2, 3, 4, 5, 6]]
    }
    async watchTicker(): Promise<Record<string, unknown>> {
      state.calls.push('watchTicker')
      return {}
    }
    async watchOrderBook(): Promise<unknown> {
      state.calls.push('watchOrderBook')
      return { bids: [], asks: [] }
    }
    async watchTrades(): Promise<Array<unknown>> {
      state.calls.push('watchTrades')
      return []
    }
  }
  return withMexcQuirks(FakeMexc as unknown as CcxtExchangeCtor)
}

describe('withMexcQuirks', () => {
  it('holds every watch until the decoder has landed', async () => {
    const state = { ready: false, calls: [] as Array<string> }
    const Exchange = fakeMexcBase(state)
    const exchange = new Exchange({})

    let settled = false
    const pending = exchange.watchOHLCV('BTC/USDT', '1m').then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(settled).toBe(false)
    expect(state.calls).toHaveLength(0)

    state.ready = true
    await pending
    expect(state.calls).toEqual(['watchOHLCV'])
  })

  it('passes straight through once ready', async () => {
    const state = { ready: true, calls: [] as Array<string> }
    const Exchange = fakeMexcBase(state)
    const exchange = new Exchange({})
    await exchange.watchOrderBook('BTC/USDT')
    await exchange.watchTrades('BTC/USDT')
    expect(state.calls).toEqual(['watchOrderBook', 'watchTrades'])
  })

  it('takes the ticker off bookTicker and onto the 24h miniTicker channel', async () => {
    const state = {
      ready: true,
      calls: [] as Array<string>,
      channels: [] as Array<string>,
    }
    const Exchange = fakeMexcBase(state)
    const exchange = new Exchange({})
    await exchange.watchTicker('BTC/USDT')
    expect(state.calls).not.toContain('watchTicker')
    expect(state.channels).toEqual([
      'ticker:BTC/USDT <- spot@public.miniTicker.v3.api.pb@BTCUSDT@UTC+0',
    ])
  })

  it('unsubscribes the channel it actually subscribed', async () => {
    const state = {
      ready: true,
      calls: [] as Array<string>,
      channels: [] as Array<string>,
    }
    const Exchange = fakeMexcBase(state)
    const exchange = new Exchange({}) as unknown as {
      unWatchTicker: (symbol: string) => Promise<unknown>
    }
    await exchange.unWatchTicker('BTC/USDT')
    expect(state.calls).not.toContain('unWatchTicker')
    expect(state.channels).toEqual([
      'unsubscribe:ticker:BTC/USDT <- spot@public.miniTicker.v3.api.pb@BTCUSDT@UTC+0',
    ])
  })

  it('routes a miniTicker protobuf frame ccxt would have dropped', () => {
    const state = { ready: true, calls: [] as Array<string> }
    const Exchange = fakeMexcBase(state)
    const exchange = new Exchange({}) as unknown as {
      handleProtobufMessage: (client: unknown, message: unknown) => boolean
      tickers: Record<string, unknown>
    }
    const resolved: Array<[unknown, string]> = []
    const client = {
      resolve: (value: unknown, hash: string) => resolved.push([value, hash]),
    }

    expect(
      exchange.handleProtobufMessage(client, {
        channel: 'spot@public.miniTicker.v3.api.pb@BTCUSDT@UTC+0',
        symbol: 'BTCUSDT',
        sendTime: '1786408745035',
        publicMiniTicker: MINI_TICKER,
      }),
    ).toBe(true)
    expect(state.calls).not.toContain('handleProtobufMessage')
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.[1]).toBe('ticker:BTC/USDT')
    expect(exchange.tickers['BTC/USDT']).toMatchObject({ percentage: -0.49 })
  })

  it('leaves every other protobuf channel to ccxt', () => {
    const state = { ready: true, calls: [] as Array<string> }
    const Exchange = fakeMexcBase(state)
    const exchange = new Exchange({}) as unknown as {
      handleProtobufMessage: (client: unknown, message: unknown) => boolean
    }
    exchange.handleProtobufMessage(
      { resolve: () => {} },
      { channel: 'spot@public.kline.v3.api.pb@BTCUSDT@Min1' },
    )
    expect(state.calls).toEqual(['handleProtobufMessage'])
  })

  it('drops the swap market fan-out', async () => {
    const state = { ready: true, calls: [] as Array<string> }
    const Exchange = fakeMexcBase(state)
    const exchange = new Exchange({}) as unknown as {
      fetchSwapMarkets: () => Promise<Array<unknown>>
    }
    expect(await exchange.fetchSwapMarkets()).toEqual([])
    expect(state.calls).toHaveLength(0)
  })
})
