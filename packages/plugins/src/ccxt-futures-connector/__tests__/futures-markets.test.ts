// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The perp markets table: what it keeps, what it refuses, and where it stores
 * the result.
 *
 * Two of these are the reasons the module is a fork rather than a flag. The
 * spot trim keeps `spot === true` rows and would return an EMPTY table for a
 * futures venue — a venue that appears to list nothing, with no error anywhere.
 * And the spot cache key is namespaced by exchange id alone, so a venue whose
 * ids ever converge would have one table overwrite the other.
 */

import { describe, expect, it } from 'bun:test'
import { trimMarkets } from '../../ccxt-connector/markets'
import {
  CcxtFuturesMarketsProvider,
  futuresMarketsCacheKey,
  memoryFuturesMarketsStorage,
  readCachedFuturesListings,
  trimFuturesMarket,
  trimFuturesMarkets,
} from '../futures-markets'
import type { CcxtExchangeLike } from '../../ccxt-connector/types'
import type { CcxtFuturesMarketSeed } from '../futures-types'

function perpRow(
  base: string,
  quote: string,
  settle: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `${base}${quote}`,
    symbol: `${base}/${quote}:${settle}`,
    base,
    quote,
    settle,
    settleId: settle,
    swap: true,
    linear: true,
    inverse: false,
    contract: true,
    contractSize: 1,
    active: true,
    precision: { amount: 0.001, price: 0.1 },
    limits: { amount: { min: 0.001 }, leverage: { max: 125 } },
    info: { orderTypes: ['LIMIT', 'MARKET'], junk: 'x'.repeat(4000) },
    ...over,
  }
}

function seedOf(row: Record<string, unknown>): CcxtFuturesMarketSeed {
  const trimmed = trimFuturesMarket(row)
  if (!trimmed) throw new Error('row did not trim')
  return trimmed
}

/** Minimal exchange: `setMarkets` indexes by symbol, `loadMarkets` is faked. */
function fakeExchange(realTable: Array<Record<string, unknown>>) {
  const state = {
    markets: undefined as Record<string, unknown> | undefined,
    loadCalls: 0,
  }
  const exchange = {
    setMarkets: (markets: Array<unknown>) => {
      state.markets = Object.fromEntries(
        (markets as Array<{ symbol: string }>).map((m) => [m.symbol, m]),
      )
      return state.markets
    },
    loadMarkets: async () => {
      state.loadCalls++
      // A real load is a multi-MB network round trip.
      await new Promise((resolve) => setTimeout(resolve, 1))
      state.markets = Object.fromEntries(
        realTable.map((m) => [m['symbol'] as string, m]),
      )
      return state.markets
    },
    get markets() {
      return state.markets
    },
  } as unknown as CcxtExchangeLike
  return { exchange, state }
}

describe('trimFuturesMarket', () => {
  it('keeps the perp fields the order path and the ticket read', () => {
    const trimmed = trimFuturesMarket(
      perpRow('BTC', 'USDT', 'USDT', { contractSize: 0.001 }),
    )
    expect(trimmed).not.toBeNull()
    expect(trimmed).toMatchObject({
      id: 'BTCUSDT',
      symbol: 'BTC/USDT:USDT',
      settle: 'USDT',
      settleId: 'USDT',
      contractSize: 0.001,
      type: 'swap',
      swap: true,
      spot: false,
      contract: true,
      linear: true,
    })
    expect(trimmed?.precision).toEqual({ amount: 0.001, price: 0.1 })
    // Binance's createOrder throws InvalidOrder without it, on futures too.
    expect(trimmed?.info?.['orderTypes']).toEqual(['LIMIT', 'MARKET'])
    expect(trimmed?.info?.['junk']).toBeUndefined()
  })

  it('states every flag explicitly, because setMarkets infers none of them', () => {
    // ccxt's safeMarketStructure seeds each flag as undefined and the merge
    // drops undefined keys — an omitted `contract: true` routes KuCoin's
    // subscription to the SPOT topic.
    const trimmed = seedOf(perpRow('ETH', 'USDT', 'USDT'))
    expect(trimmed.contract).toBe(true)
    expect(trimmed.spot).toBe(false)
    expect(trimmed.index).toBe(false)
    expect(trimmed.future).toBe(false)
    expect(trimmed.inverse).toBe(false)
  })

  it('drops index rows — no book, no order path, a nonsense pair key', () => {
    expect(
      trimFuturesMarket(
        perpRow('BTC', 'USD', 'USD', {
          id: 'IN_XBTUSD',
          symbol: 'IN_XBTUSD',
          index: true,
          swap: false,
        }),
      ),
    ).toBeNull()
  })

  it('drops inverse contracts — v1 is linear only', () => {
    expect(
      trimFuturesMarket(
        perpRow('BTC', 'USD', 'BTC', { linear: false, inverse: true }),
      ),
    ).toBeNull()
  })

  it('drops dated futures and spot rows', () => {
    expect(
      trimFuturesMarket(
        perpRow('BTC', 'USD', 'USD', { swap: false, future: true }),
      ),
    ).toBeNull()
    expect(
      trimFuturesMarket({
        id: 'BTCUSDT',
        symbol: 'BTC/USDT',
        base: 'BTC',
        quote: 'USDT',
        spot: true,
      }),
    ).toBeNull()
  })

  it('refuses a row with no settlement currency', () => {
    const row = perpRow('BTC', 'USDT', 'USDT')
    delete row['settle']
    expect(trimFuturesMarket(row)).toBeNull()
  })
})

describe('the spot trim cannot serve a futures table', () => {
  it('returns nothing, silently, which is why this module is a fork', () => {
    const table = {
      'BTC/USDT:USDT': perpRow('BTC', 'USDT', 'USDT'),
      'ETH/USDT:USDT': perpRow('ETH', 'USDT', 'USDT'),
    }
    expect(trimMarkets(table)).toHaveLength(0)
    expect(trimFuturesMarkets(table)).toHaveLength(2)
  })
})

describe('cache key', () => {
  it('lives in its own namespace, so it can never overwrite a spot table', () => {
    // The spot provider stores at `${exchangeId}:v2`, keyed by exchange id
    // ALONE. Same id, different namespace.
    expect(futuresMarketsCacheKey('kucoin')).toBe('kucoin:swap:v1')
    expect(futuresMarketsCacheKey('kucoin')).not.toBe('kucoin:v2')
    expect(futuresMarketsCacheKey('binanceusdm')).toBe('binanceusdm:swap:v1')
  })

  it('a spot table parked under the spot key is invisible to the provider', async () => {
    const storage = memoryFuturesMarketsStorage()
    // Deliberately the spot key shape, with a spot-shaped payload.
    await storage.set('binanceusdm:v2', {
      savedAt: Date.now(),
      markets: [seedOf(perpRow('BTC', 'USDT', 'USDT'))],
    })
    const provider = new CcxtFuturesMarketsProvider('binanceusdm', storage)
    expect(await provider.prefetch()).toBeNull()
  })
})

describe('CcxtFuturesMarketsProvider', () => {
  const REAL_TABLE = [
    perpRow('BTC', 'USDT', 'USDT'),
    perpRow('ETH', 'USDT', 'USDT'),
    perpRow('SOL', 'USDT', 'USDT'),
    // An index row the venue publishes alongside them.
    perpRow('BTC', 'USD', 'USD', {
      id: 'IN_XBTUSD',
      symbol: 'IN_XBTUSD',
      index: true,
      swap: false,
    }),
  ]

  it('applies a cached table synchronously — no await before the first watch', async () => {
    const storage = memoryFuturesMarketsStorage()
    await storage.set(futuresMarketsCacheKey('binanceusdm'), {
      savedAt: Date.now(),
      markets: REAL_TABLE.slice(0, 3).map(seedOf),
    })
    const provider = new CcxtFuturesMarketsProvider('binanceusdm', storage)
    await provider.prefetch()

    const { exchange, state } = fakeExchange(REAL_TABLE)
    expect(provider.primeSync(exchange)).toBe('cache')
    expect(state.loadCalls).toBe(0)
    expect(provider.hasSymbol(exchange, 'BTC/USDT:USDT')).toBe(true)
  })

  it('reports "none" on a cold profile — futures venues seed no stand-ins', () => {
    const provider = new CcxtFuturesMarketsProvider(
      'binanceusdm',
      memoryFuturesMarketsStorage(),
    )
    const { exchange } = fakeExchange(REAL_TABLE)
    expect(provider.primeSync(exchange)).toBe('none')
  })

  it('loads, filters and persists the trimmed table for the next session', async () => {
    const storage = memoryFuturesMarketsStorage()
    const provider = new CcxtFuturesMarketsProvider('krakenfutures', storage)
    const { exchange, state } = fakeExchange(REAL_TABLE)

    await provider.whenReady(exchange)
    expect(state.loadCalls).toBe(1)

    const stored = await storage.get(futuresMarketsCacheKey('krakenfutures'))
    // The index row is gone; the three perps remain.
    expect(stored?.markets).toHaveLength(3)
    expect(stored?.markets.map((m) => m.symbol)).not.toContain('IN_XBTUSD')
  })

  it('re-applies the cached table to a rebuilt instance without reloading', async () => {
    const provider = new CcxtFuturesMarketsProvider(
      'binanceusdm',
      memoryFuturesMarketsStorage(),
    )
    const first = fakeExchange(REAL_TABLE)
    await provider.whenReady(first.exchange)

    // A region change discards the instance; the new one must not reload.
    const second = fakeExchange(REAL_TABLE)
    expect(provider.primeSync(second.exchange)).toBe('cache')
    expect(second.state.loadCalls).toBe(0)
    expect(provider.hasSymbol(second.exchange, 'SOL/USDT:USDT')).toBe(true)
  })

  it('refreshes in the background when the cached table is past its TTL', async () => {
    const storage = memoryFuturesMarketsStorage()
    await storage.set(futuresMarketsCacheKey('binanceusdm'), {
      savedAt: Date.now() - 48 * 60 * 60 * 1000,
      markets: [seedOf(perpRow('BTC', 'USDT', 'USDT'))],
    })
    const provider = new CcxtFuturesMarketsProvider('binanceusdm', storage)
    await provider.prefetch()

    const { exchange, state } = fakeExchange(REAL_TABLE)
    // Stale still serves synchronously — the refresh is not on the hot path.
    expect(provider.primeSync(exchange)).toBe('cache')
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(state.loadCalls).toBe(1)
  })
})

describe('refresh retries after a load that throws before it awaits', () => {
  /**
   * A venue that refuses the caller's region answers `loadMarkets` with a
   * SYNCHRONOUS throw (the geo classifier raises before any fetch resolves).
   * The release used to compare against a `this.ready` that had not been
   * assigned yet, so from the second such failure onward the in-flight slot
   * stayed pinned and every later refresh was handed back the same cached
   * rejection — a venue that never recovered for the life of the plugin, even
   * once the user's region changed.
   */
  function throwingExchange(failures: number) {
    const state = { calls: 0, markets: undefined as unknown }
    const exchange = {
      setMarkets: () => undefined,
      loadMarkets: (() => {
        state.calls++
        if (state.calls <= failures) throw new Error('451 restricted')
        state.markets = { 'BTC/USDT:USDT': {} }
        return Promise.resolve(state.markets)
      }) as unknown as CcxtExchangeLike['loadMarkets'],
      get markets() {
        return state.markets as Record<string, unknown> | undefined
      },
    } as unknown as CcxtExchangeLike
    return { exchange, state }
  }

  it('keeps retrying the same instance instead of latching the rejection', async () => {
    const provider = new CcxtFuturesMarketsProvider(
      'binanceusdm',
      memoryFuturesMarketsStorage(),
    )
    const { exchange, state } = throwingExchange(2)

    await expect(provider.whenReady(exchange)).rejects.toThrow('451')
    await expect(provider.whenReady(exchange)).rejects.toThrow('451')
    // The third attempt must reach the venue rather than replay attempt two.
    await provider.whenReady(exchange)
    expect(state.calls).toBe(3)
    expect(provider.hasSymbol(exchange, 'BTC/USDT:USDT')).toBe(true)
  })
})

describe('readCachedFuturesListings', () => {
  it('emits three-segment symbols and the contract size, per Pairlens market id', async () => {
    const storage = memoryFuturesMarketsStorage()
    await storage.set(futuresMarketsCacheKey('kucoinfutures'), {
      savedAt: 1_700_000_000_000,
      markets: [
        seedOf(
          perpRow('BTC', 'USDT', 'USDT', {
            id: 'XBTUSDTM',
            contractSize: 0.001,
          }),
        ),
        seedOf(perpRow('DOGE', 'USDT', 'USDT', { active: false })),
      ],
    })

    const listings = await readCachedFuturesListings(
      [{ exchangeId: 'kucoinfutures', marketId: 'kucoin-futures' }],
      storage,
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].venue).toBe('kucoin-futures')
    // Inactive contracts are not listings.
    expect(listings[0].listings).toHaveLength(1)
    expect(listings[0].listings[0]).toEqual({
      symbol: 'BTC-USDT-USDT',
      base: 'BTC',
      quote: 'USDT',
      settle: 'USDT',
      marketId: 'XBTUSDTM',
      contractSize: 0.001,
    })
  })

  it('omits a venue with no cached table — absence means unknown', async () => {
    const listings = await readCachedFuturesListings(
      [{ exchangeId: 'krakenfutures', marketId: 'kraken-futures' }],
      memoryFuturesMarketsStorage(),
    )
    expect(listings).toHaveLength(0)
  })
})
