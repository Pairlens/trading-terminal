// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  KUCOIN_ADAPTER_INFO,
  kucoinCcxtVenue,
  kucoinMarketConnectorManifest,
} from '../venues/kucoin'
import { kucoinPagedSince, withKucoinQuirks } from '../venues/kucoin-exchange'
import {
  KUCOIN_US_ERROR,
  requireKucoinCcxtUrls,
  resolveKucoinCcxtUrls,
} from '../venues/kucoin-regions'
import { PUBLIC_CTX } from './url-context'
import type { CcxtExchangeCtor } from '../types'

describe('kucoin manifest', () => {
  // Until the native connector was deleted this read `toEqual(nativeManifest)`.
  // What that assertion was really protecting is below: the identity a saved
  // workspace, a provisioned credential and a capability scope are all keyed
  // by. Changing any of it strands user state, which is why it is pinned by
  // value rather than against a sibling implementation.
  it('keeps the identity the terminal and stored user state key by', () => {
    expect(kucoinMarketConnectorManifest.id).toBe('kucoin-market-connector')
    expect(KUCOIN_ADAPTER_INFO.marketId).toBe('kucoin')
    expect(KUCOIN_ADAPTER_INFO.displayName).toBe('KuCoin')
    expect(kucoinMarketConnectorManifest.capabilities.map((c) => c.id)).toEqual(
      [
        'market-data:candles',
        'market-data:ticker',
        'market-data:orderbook',
        'market-data:history',
        'trading:orders',
        'trading:balances',
        'market-data:ticker-snapshot',
        'market-data:trades',
      ],
    )
  })

  it('declares desktop-only in the spec half too', () => {
    // The manifest copy makes the terminal SAY desktop-only; this one makes the
    // connector refuse. Both are required (parity item 76).
    expect(kucoinCcxtVenue.requiresDesktop).toBe(true)
    expect(kucoinMarketConnectorManifest.metadata?.['requiresDesktop']).toBe(
      true,
    )
  })

  it('does not declare a geoCheck — the US refusal is a plain Error', () => {
    expect(kucoinCcxtVenue.geoCheck).toBeUndefined()
  })

  it('asks for a depth the venue accepts', () => {
    expect([undefined, 5, 20, 50, 100]).toContain(
      kucoinCcxtVenue.orderbookDepth,
    )
  })
})

describe('kucoin region resolution', () => {
  it('refuses the US with the native message, not a GeoRestrictedError', () => {
    expect(resolveKucoinCcxtUrls('US')).toBeNull()
    expect(() => requireKucoinCcxtUrls('us')).toThrow(KUCOIN_US_ERROR)
    try {
      requireKucoinCcxtUrls('US')
    } catch (error) {
      expect((error as Error).name).toBe('Error')
    }
  })

  it('keeps public reads global for EU and moves only the trading base', () => {
    const eu = resolveKucoinCcxtUrls('DE')
    expect(eu).toEqual({
      rest: 'https://api.kucoin.com',
      tradingRest: 'https://api.kucoin.eu',
    })
  })

  it('uses the sandbox host for paper', () => {
    expect(resolveKucoinCcxtUrls('DE', true)).toEqual({
      rest: 'https://openapi-sandbox.kucoin.com',
      tradingRest: 'https://openapi-sandbox.kucoin.com',
    })
  })

  it('points every REST section at the resolved bases', () => {
    const exchange = {
      urls: {
        api: { public: '', private: '', uta: '', utaPrivate: '', earn: '' },
      },
    }
    kucoinCcxtVenue.applyUrls?.(exchange as never, 'DE', PUBLIC_CTX)
    expect(exchange.urls.api).toEqual({
      public: 'https://api.kucoin.com',
      uta: 'https://api.kucoin.com',
      private: 'https://api.kucoin.eu',
      utaPrivate: 'https://api.kucoin.eu',
      earn: 'https://api.kucoin.eu',
    })
  })
})

describe('kucoin paging', () => {
  it('nudges the cursor to strictly older', () => {
    expect(kucoinCcxtVenue.historyPageParams?.(1_700_000_000_000)).toEqual({
      until: 1_699_999_999_999,
    })
  })

  it('turns an until cursor into the window ccxt actually honors', () => {
    // 50 hourly bars ending just before the cursor.
    expect(kucoinPagedSince(1_700_000_000_000, 50, 3600)).toBe(
      1_700_000_000_000 - 50 * 3600 * 1000,
    )
  })
})

// ── Subclass quirks ──────────────────────────────────────────────────────

type Call = { name: string; args: Array<unknown> }

function fakeKucoinBase(calls: Array<Call>) {
  class FakeKucoin {
    options: Record<string, unknown> = {}
    clients: Record<string, unknown> = {}
    parseTimeframe(timeframe: string): number {
      return timeframe === '1h' ? 3600 : 60
    }
    async fetchMarkets(params: Record<string, unknown> = {}): Promise<unknown> {
      calls.push({ name: 'fetchMarkets', args: [params] })
      return []
    }
    async fetchOHLCV(
      symbol: string,
      timeframe?: string,
      since?: number,
      limit?: number,
      params?: Record<string, unknown>,
    ): Promise<Array<Array<number>>> {
      calls.push({
        name: 'fetchOHLCV',
        args: [symbol, timeframe, since, limit, params],
      })
      return []
    }
    async negotiate(privateChannel: boolean): Promise<string | undefined> {
      calls.push({ name: 'negotiate', args: [privateChannel] })
      return 'wss://ws-api-spot.kucoin.com/?token=fresh'
    }
  }
  return withKucoinQuirks(FakeKucoin as unknown as CcxtExchangeCtor)
}

describe('withKucoinQuirks', () => {
  it('suppresses the signed margin-symbol calls on loadMarkets', async () => {
    const calls: Array<Call> = []
    const Exchange = fakeKucoinBase(calls)
    const exchange = new Exchange({}) as unknown as {
      fetchMarkets: (params?: Record<string, unknown>) => Promise<unknown>
    }
    await exchange.fetchMarkets()
    expect(calls[0]?.args[0]).toEqual({ marginables: false })
  })

  it('lets an explicit marginables flag win', async () => {
    const calls: Array<Call> = []
    const Exchange = fakeKucoinBase(calls)
    const exchange = new Exchange({}) as unknown as {
      fetchMarkets: (params?: Record<string, unknown>) => Promise<unknown>
    }
    await exchange.fetchMarkets({ marginables: true })
    expect(calls[0]?.args[0]).toEqual({ marginables: true })
  })

  it('translates `until` into `since` and drops the cursor param', async () => {
    const calls: Array<Call> = []
    const Exchange = fakeKucoinBase(calls)
    const exchange = new Exchange({}) as unknown as {
      fetchOHLCV: (
        symbol: string,
        timeframe?: string,
        since?: number,
        limit?: number,
        params?: Record<string, unknown>,
      ) => Promise<unknown>
    }
    const until = 1_700_000_000_000
    await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 50, { until })
    expect(calls[0]?.args).toEqual([
      'BTC/USDT',
      '1h',
      until - 50 * 3600 * 1000,
      50,
      {},
    ])
  })

  it('leaves an ordinary head read alone', async () => {
    const calls: Array<Call> = []
    const Exchange = fakeKucoinBase(calls)
    const exchange = new Exchange({}) as unknown as {
      fetchOHLCV: (
        symbol: string,
        timeframe?: string,
        since?: number,
        limit?: number,
        params?: Record<string, unknown>,
      ) => Promise<unknown>
    }
    await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 50, {})
    expect(calls[0]?.args).toEqual(['BTC/USDT', '1h', undefined, 50, {}])
  })

  it('re-negotiates when the memoized bullet URL has no client left', async () => {
    const calls: Array<Call> = []
    const Exchange = fakeKucoinBase(calls)
    const exchange = new Exchange({}) as unknown as {
      options: Record<string, unknown>
      clients: Record<string, unknown>
      negotiate: (privateChannel: boolean) => Promise<string | undefined>
    }
    const dead = 'wss://ws-api-spot.kucoin.com/?token=expired'
    exchange.options['urls'] = { public: Promise.resolve(dead) }

    await exchange.negotiate(false)
    expect(
      (exchange.options['urls'] as Record<string, unknown>)['public'],
    ).toBeUndefined()
    expect(calls).toHaveLength(1)
  })

  it('keeps a memoized URL whose socket is still alive', async () => {
    const calls: Array<Call> = []
    const Exchange = fakeKucoinBase(calls)
    const exchange = new Exchange({}) as unknown as {
      options: Record<string, unknown>
      clients: Record<string, unknown>
      negotiate: (privateChannel: boolean) => Promise<string | undefined>
    }
    const live = 'wss://ws-api-spot.kucoin.com/?token=live'
    const cache: Record<string, unknown> = { public: Promise.resolve(live) }
    exchange.options['urls'] = cache
    exchange.clients[live] = { alive: true }

    await exchange.negotiate(false)
    expect(cache['public']).toBeDefined()
  })

  it('invalidates a given dead URL only once, so racing subscribers do not storm', async () => {
    const calls: Array<Call> = []
    const Exchange = fakeKucoinBase(calls)
    const exchange = new Exchange({}) as unknown as {
      options: Record<string, unknown>
      clients: Record<string, unknown>
      negotiate: (privateChannel: boolean) => Promise<string | undefined>
    }
    const dead = 'wss://ws-api-spot.kucoin.com/?token=expired'
    const cache: Record<string, unknown> = { public: Promise.resolve(dead) }
    exchange.options['urls'] = cache

    await exchange.negotiate(false)
    // A second subscriber arrives while the replacement is still in flight and
    // must not delete the fresh entry.
    cache['public'] = Promise.resolve(dead)
    await exchange.negotiate(false)
    expect(cache['public']).toBeDefined()
  })
})
