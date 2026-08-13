// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The markets pipeline's ordering hazard, pinned.
 *
 * A stand-in market lets a cold profile subscribe immediately, and a
 * background `loadMarkets` replaces it a second later. Those two writes race:
 * a second subscription seeding its own stand-in AFTER the real table landed
 * would `setMarkets` a one-row table over 3 680 real ones and break every
 * other symbol on the venue. That is the case these tests exist for.
 */

import { describe, expect, it } from 'bun:test'
import {
  CcxtMarketsProvider,
  memoryMarketsStorage,
  trimMarket,
} from '../markets'
import type { CcxtExchangeLike, CcxtMarketSeed } from '../types'

function seed(base: string, quote: string): CcxtMarketSeed {
  return {
    id: `${base}${quote}`,
    lowercaseId: `${base}${quote}`.toLowerCase(),
    symbol: `${base}/${quote}`,
    base,
    quote,
    type: 'spot',
    spot: true,
    active: true,
    info: {},
  }
}

/** Minimal exchange: `setMarkets` indexes by symbol, `loadMarkets` is faked. */
function fakeExchange(realTable: Array<CcxtMarketSeed>) {
  const state = {
    markets: undefined as Record<string, unknown> | undefined,
    setCalls: 0,
    loadCalls: 0,
  }
  const exchange = {
    setMarkets: (markets: Array<unknown>) => {
      state.setCalls++
      state.markets = Object.fromEntries(
        (markets as Array<CcxtMarketSeed>).map((m) => [m.symbol, m]),
      )
      return state.markets
    },
    loadMarkets: async () => {
      state.loadCalls++
      // A real load is a multi-MB network round trip; resolving synchronously
      // would hide the very window the stand-in exists to cover.
      await new Promise((resolve) => setTimeout(resolve, 1))
      state.markets = Object.fromEntries(realTable.map((m) => [m.symbol, m]))
      return state.markets
    },
    get markets() {
      return state.markets
    },
  } as unknown as CcxtExchangeLike
  return { exchange, state }
}

const REAL_TABLE = [
  seed('BTC', 'USDT'),
  seed('ETH', 'USDT'),
  seed('SOL', 'USDT'),
]

describe('trimMarket', () => {
  it('keeps the fields setMarkets and the order path actually read', () => {
    const trimmed = trimMarket({
      id: 'BTCUSDT',
      lowercaseId: 'btcusdt',
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      baseId: 'BTC',
      quoteId: 'USDT',
      spot: true,
      active: true,
      precision: { amount: 0.00001, price: 0.01, base: 1e-8 },
      limits: { amount: { min: 0.00001, max: 9000 }, leverage: {} },
      // Binance is the only venue whose createOrder reads market.info — it
      // throws InvalidOrder without orderTypes.
      info: {
        orderTypes: ['LIMIT', 'MARKET'],
        symbol: 'BTCUSDT',
        junk: 'x'.repeat(5000),
      },
    })
    expect(trimmed).not.toBeNull()
    expect(trimmed?.id).toBe('BTCUSDT')
    expect(trimmed?.lowercaseId).toBe('btcusdt')
    expect(trimmed?.precision).toEqual({ amount: 0.00001, price: 0.01 })
    expect(trimmed?.limits?.['amount']).toEqual({ min: 0.00001, max: 9000 })
    expect(trimmed?.info?.['orderTypes']).toEqual(['LIMIT', 'MARKET'])
    // The rest of the raw payload is the multi-MB part and nothing reads it.
    expect(trimmed?.info?.['junk']).toBeUndefined()
  })

  it('rejects a row with no usable identity', () => {
    expect(trimMarket({ symbol: 'BTC/USDT' })).toBeNull()
  })

  it("keeps OKX's instIdCode — the WS trade API refuses orders without it", () => {
    const trimmed = trimMarket({
      id: 'BTC-USDT',
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      instIdCode: 4_242,
      spot: true,
    })
    expect(trimmed?.instIdCode).toBe(4_242)
  })
})

describe('CcxtMarketsProvider', () => {
  it('applies a cached table synchronously — no await before the first watch', async () => {
    const storage = memoryMarketsStorage()
    await storage.set('binance:v2', {
      savedAt: Date.now(),
      markets: REAL_TABLE,
    })
    const provider = new CcxtMarketsProvider('binance', storage)
    await provider.prefetch()

    const { exchange, state } = fakeExchange(REAL_TABLE)
    expect(provider.primeSync(exchange, seed('BTC', 'USDT'))).toBe('cache')
    expect(state.loadCalls).toBe(0)
    expect(Object.keys(exchange.markets ?? {})).toHaveLength(3)
  })

  it('seeds a stand-in on a cold profile and swaps in the real table', async () => {
    const provider = new CcxtMarketsProvider('binance', memoryMarketsStorage())
    const { exchange, state } = fakeExchange(REAL_TABLE)

    expect(provider.primeSync(exchange, seed('BTC', 'USDT'))).toBe('synthetic')
    // Resolvable immediately — that is the whole point.
    expect(provider.hasSymbol(exchange, 'BTC/USDT')).toBe(true)
    expect(provider.hasSymbol(exchange, 'ETH/USDT')).toBe(false)

    await provider.whenReady(exchange)
    expect(state.loadCalls).toBe(1)
    expect(provider.hasSymbol(exchange, 'ETH/USDT')).toBe(true)
  })

  it('a late stand-in never overwrites the real table', async () => {
    const provider = new CcxtMarketsProvider('binance', memoryMarketsStorage())
    const { exchange } = fakeExchange(REAL_TABLE)

    provider.primeSync(exchange, seed('BTC', 'USDT'))
    await provider.whenReady(exchange)

    // A second pane subscribes; its stand-in arrives after the load resolved.
    expect(provider.primeSync(exchange, seed('DOGE', 'USDT'))).toBe('cache')
    expect(Object.keys(exchange.markets ?? {})).toHaveLength(3)
    expect(provider.hasSymbol(exchange, 'SOL/USDT')).toBe(true)
  })

  it('accumulates stand-ins while still cold, rather than replacing them', () => {
    const provider = new CcxtMarketsProvider('binance', memoryMarketsStorage())
    const { exchange } = fakeExchange(REAL_TABLE)
    provider.primeSync(exchange, seed('BTC', 'USDT'))
    provider.primeSync(exchange, seed('ETH', 'USDT'))
    expect(provider.hasSymbol(exchange, 'BTC/USDT')).toBe(true)
    expect(provider.hasSymbol(exchange, 'ETH/USDT')).toBe(true)
  })

  it('writes the trimmed table back to storage for the next session', async () => {
    const storage = memoryMarketsStorage()
    const provider = new CcxtMarketsProvider('binance', storage)
    const { exchange } = fakeExchange(REAL_TABLE)
    await provider.whenReady(exchange)
    const stored = await storage.get('binance:v2')
    expect(stored?.markets).toHaveLength(3)
  })

  it('re-applies the cached table to a rebuilt instance', async () => {
    const provider = new CcxtMarketsProvider('okx', memoryMarketsStorage())
    const first = fakeExchange(REAL_TABLE)
    await provider.whenReady(first.exchange)

    // A region change discards the instance; the new one must not reload.
    const second = fakeExchange(REAL_TABLE)
    expect(provider.primeSync(second.exchange, null)).toBe('cache')
    expect(second.state.loadCalls).toBe(0)
    expect(provider.hasSymbol(second.exchange, 'SOL/USDT')).toBe(true)
  })

  it('serves the persisted cache on a cold start without an explicit prefetch', async () => {
    const storage = memoryMarketsStorage()
    await storage.set('binance:v2', {
      savedAt: Date.now(),
      markets: REAL_TABLE,
    })
    // No `await provider.prefetch()` — production never calls it by hand. The
    // constructor's own read must be what makes the cache reachable.
    const provider = new CcxtMarketsProvider('binance', storage)
    const { exchange, state } = fakeExchange(REAL_TABLE)

    // First touch is still synchronous: the storage read hasn't resolved yet,
    // so the stand-in serves the subscribe.
    expect(provider.primeSync(exchange, seed('BTC', 'USDT'))).toBe('synthetic')
    await new Promise((resolve) => setTimeout(resolve, 5))

    // The persisted table replaced the stand-in and NO network load ran.
    expect(state.loadCalls).toBe(0)
    expect(provider.hasSymbol(exchange, 'ETH/USDT')).toBe(true)
    expect(provider.primeSync(exchange, seed('SOL', 'USDT'))).toBe('cache')
  })

  it('whenReady is satisfied by the persisted cache even over a stand-in', async () => {
    const storage = memoryMarketsStorage()
    await storage.set('binance:v2', {
      savedAt: Date.now(),
      markets: REAL_TABLE,
    })
    const provider = new CcxtMarketsProvider('binance', storage)
    const { exchange, state } = fakeExchange(REAL_TABLE)

    provider.primeSync(exchange, seed('BTC', 'USDT'))
    await provider.whenReady(exchange)

    expect(state.loadCalls).toBe(0)
    expect(provider.hasSymbol(exchange, 'SOL/USDT')).toBe(true)
  })

  it('a rebuild during the initial cold load gets its own refresh, not the retired one', async () => {
    const provider = new CcxtMarketsProvider('binance', memoryMarketsStorage())
    const first = fakeExchange(REAL_TABLE)

    provider.primeSync(first.exchange, seed('BTC', 'USDT'))
    // Let the (empty) storage read resolve so the first network load starts.
    await Promise.resolve()
    await Promise.resolve()

    // A liveness/wake rebuild discards the first instance mid-load.
    const second = fakeExchange(REAL_TABLE)
    provider.primeSync(second.exchange, seed('BTC', 'USDT'))
    await provider.whenReady(second.exchange)

    // The second instance holds a REAL table — before the per-instance refresh
    // guard it inherited the first load's promise, kept its one-row stand-in,
    // and was permanently flagged as real.
    expect(provider.hasSymbol(second.exchange, 'ETH/USDT')).toBe(true)
    expect(Object.keys(second.exchange.markets ?? {})).toHaveLength(3)
  })

  it('refreshes in the background when the cached table is past its TTL', async () => {
    const storage = memoryMarketsStorage()
    await storage.set('binance:v2', {
      savedAt: Date.now() - 48 * 60 * 60 * 1000,
      markets: [seed('BTC', 'USDT')],
    })
    const provider = new CcxtMarketsProvider('binance', storage)
    await provider.prefetch()

    const { exchange, state } = fakeExchange(REAL_TABLE)
    // Stale still serves synchronously — the refresh is not on the hot path.
    expect(provider.primeSync(exchange, null)).toBe('cache')
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(state.loadCalls).toBe(1)
  })
})
