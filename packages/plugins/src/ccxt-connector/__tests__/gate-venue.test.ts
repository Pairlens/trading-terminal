// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  GATE_ADAPTER_INFO,
  gateCcxtVenue,
  gateMarketConnectorManifest,
} from '../venues/gate'
import { applyGateRestBase, resolveGateCcxtUrls } from '../venues/gate-regions'
import { withGateQuirks } from '../venues/gate-exchange'
import { PUBLIC_CTX } from './url-context'
import type { CcxtExchangeCtor } from '../types'

describe('gate manifest', () => {
  // Was `toEqual(nativeManifest)` until the native connector was deleted; the
  // identity it was guarding is pinned by value instead. See kucoin-venue.test.
  it('keeps the identity the terminal and stored user state key by', () => {
    expect(gateMarketConnectorManifest.id).toBe('gate-market-connector')
    expect(GATE_ADAPTER_INFO.marketId).toBe('gate')
    expect(GATE_ADAPTER_INFO.displayName).toBe('Gate.io')
    expect(gateMarketConnectorManifest.capabilities.map((c) => c.id)).toEqual([
      'market-data:candles',
      'market-data:ticker',
      'market-data:orderbook',
      'market-data:history',
      'trading:orders',
      'trading:balances',
      'market-data:ticker-snapshot',
      'market-data:trades',
    ])
  })

  it('declares desktop-only in the spec half too', () => {
    expect(gateCcxtVenue.requiresDesktop).toBe(true)
    expect(gateMarketConnectorManifest.metadata?.['requiresDesktop']).toBe(true)
  })

  it('advertises no timeframe the venue cannot serve', () => {
    // ccxt maps 1w -> 7d itself; 1M is ours; 3d exists on neither side, and the
    // native's supportedTimeframes omits it too.
    const advertised = GATE_ADAPTER_INFO.supportedTimeframes
    expect(advertised).not.toContain('3d')
    expect(advertised).toContain('1M')
    expect(gateCcxtVenue.timeframeOverrides).toEqual({ '1M': '30d' })
  })
})

describe('gate urls', () => {
  it('resolves production hosts outside a dev server', () => {
    expect(resolveGateCcxtUrls()).toEqual({
      rest: 'https://api.gateio.ws/api/v4',
      ws: 'wss://api.gateio.ws/ws/v4/',
    })
  })

  it('resolves the testnet pair for paper', () => {
    expect(resolveGateCcxtUrls(true)).toEqual({
      rest: 'https://api-testnet.gateapi.io/api/v4',
      ws: 'wss://ws-testnet.gate.com/v4/ws/spot',
    })
  })

  it('rewrites every REST section, not just spot', () => {
    // A half-moved table sends some calls to the proxy and some at the origin,
    // which is a CORS failure in the browser and a scope denial on desktop.
    const api: Record<string, unknown> = {
      public: {
        spot: 'https://api.gateio.ws/api/v4',
        wallet: 'x',
        margin: 'y',
      },
      private: { spot: 'z', unified: 'w' },
      spot: 'wss://api.gateio.ws/ws/v4/',
    }
    applyGateRestBase(api, '/__gate-global/api/v4')
    expect(api['public']).toEqual({
      spot: '/__gate-global/api/v4',
      wallet: '/__gate-global/api/v4',
      margin: '/__gate-global/api/v4',
    })
    expect(api['private']).toEqual({
      spot: '/__gate-global/api/v4',
      unified: '/__gate-global/api/v4',
    })
    // The WS entry is a sibling string and must survive untouched.
    expect(api['spot']).toBe('wss://api.gateio.ws/ws/v4/')
  })

  it('applyUrls moves REST and pins the spot socket', () => {
    const exchange = {
      urls: {
        api: {
          public: { spot: '' },
          private: { spot: '' },
          spot: '',
        },
      },
    }
    gateCcxtVenue.applyUrls?.(exchange as never, 'DE', PUBLIC_CTX)
    expect(exchange.urls.api.public.spot).toBe('https://api.gateio.ws/api/v4')
    expect(exchange.urls.api.spot).toBe('wss://api.gateio.ws/ws/v4/')
  })
})

describe('gate paging and depth', () => {
  it('nudges the inclusive `to` cursor', () => {
    expect(gateCcxtVenue.historyPageParams?.(1_700_000_000_000)).toEqual({
      until: 1_699_999_999_999,
    })
  })

  it('asks for the snapshot depth the spot.obu channel serves', () => {
    expect(gateCcxtVenue.orderbookDepth).toBe(50)
  })

  it('caps a page at the venue limit', () => {
    expect(gateCcxtVenue.maxHistoryLimit).toBe(1000)
  })
})

describe('withGateQuirks', () => {
  function fakeGate(seen: Array<Record<string, unknown> | undefined>) {
    class FakeGate {
      async fetchTickers(
        _symbols?: Array<string>,
        params?: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        seen.push(params)
        return {}
      }
    }
    return withGateQuirks(FakeGate as unknown as CcxtExchangeCtor)
  }

  it('restores the rolling 24h window on the bulk snapshot', () => {
    // ccxt pins timezone=utc0, which makes Gate report the change since UTC
    // midnight — measured 0.03% against a rolling -1.6% on the same pair.
    const seen: Array<Record<string, unknown> | undefined> = []
    const Exchange = fakeGate(seen)
    void new Exchange({}).fetchTickers()
    expect(seen[0]).toEqual({ timezone: 'all' })
  })

  it('still lets a caller pick a timezone explicitly', () => {
    const seen: Array<Record<string, unknown> | undefined> = []
    const Exchange = fakeGate(seen)
    void new Exchange({}).fetchTickers(undefined, { timezone: 'utc8' })
    expect(seen[0]).toEqual({ timezone: 'utc8' })
  })
})

describe('gate synthetic market', () => {
  it('builds the underscore market id Gate uses', () => {
    expect(gateCcxtVenue.synthesizeMarket?.('BTC-USDT')).toMatchObject({
      id: 'BTC_USDT',
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      spot: true,
    })
  })

  it('refuses a pair with no quote', () => {
    expect(gateCcxtVenue.synthesizeMarket?.('BTC')).toBeNull()
  })
})
