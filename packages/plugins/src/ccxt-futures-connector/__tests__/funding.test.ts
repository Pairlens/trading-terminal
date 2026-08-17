// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The funding provider, against fakes shaped like each venue's real answer.
 *
 * What is pinned here is everything a pane would render wrongly rather than
 * loudly: the settlement period an annualised rate divides by, the refusal a
 * venue that serves one symbol per call must give when handed no list, the
 * index rows that must never reach a perp scanner, and the open-interest
 * change that has to stay ABSENT when the series cannot support one.
 */

import { describe, expect, it } from 'bun:test'
import {
  CcxtFundingProvider,
  changeOverSeries,
  parseFundingRequest,
  parseIntervalHours,
} from '../funding'
import type {
  FundingHistoryResponse,
  FundingSnapshotResponse,
  OpenInterestResponse,
} from '@pairlens/shared/instrument-types'
import type {
  CcxtFuturesExchangeLike,
  CcxtFuturesVenueConfig,
} from '../futures-types'

const VENUE: CcxtFuturesVenueConfig = {
  exchangeId: 'binanceusdm',
  marketId: 'binance-futures',
  displayName: 'Binance Futures',
  credentialKeys: [],
  defaultMode: 'paper',
  maxLeverage: 125,
  maxHistoryLimit: 1500,
  fundingIntervalHours: 8,
  loadExchangeClass: async () => {
    throw new Error('not used')
  },
}

function rateRow(
  symbol: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    symbol,
    fundingRate: 0.0001,
    markPrice: 63_121,
    indexPrice: 63_052,
    fundingTimestamp: 1_800_000_000_000,
    timestamp: 1_799_990_000_000,
    ...over,
  }
}

/** Enough of an exchange for the provider: `has` flags plus the fetchers. */
function fakeExchange(
  has: Record<string, unknown>,
  impl: Partial<CcxtFuturesExchangeLike> = {},
  markets: Record<string, unknown> = {},
): CcxtFuturesExchangeLike {
  return { has, markets, ...impl } as unknown as CcxtFuturesExchangeLike
}

const PERP = { swap: true, base: 'BTC', quote: 'USDT' }

describe('parseIntervalHours', () => {
  it("reads ccxt's duration spelling", () => {
    expect(parseIntervalHours('8h')).toBe(8)
    expect(parseIntervalHours('1h')).toBe(1)
    expect(parseIntervalHours('4H')).toBe(4)
  })

  it('refuses anything that is not a positive whole-hour period', () => {
    // A zero or a sub-hour period would be divided by when annualising.
    expect(parseIntervalHours('0h')).toBeNull()
    expect(parseIntervalHours('30m')).toBeNull()
    expect(parseIntervalHours(undefined)).toBeNull()
    expect(parseIntervalHours(-4)).toBeNull()
  })
})

describe('parseFundingRequest', () => {
  it('defaults to a full rates sweep', () => {
    expect(parseFundingRequest({})).toEqual({ action: 'funding-rates' })
  })

  it('carries the pair list through both scoped actions', () => {
    expect(
      parseFundingRequest({
        action: 'open-interest',
        pairs: ['BTC-USDT-USDT'],
      }),
    ).toEqual({ action: 'open-interest', pairs: ['BTC-USDT-USDT'] })
  })

  it('refuses a history request with no contract', () => {
    expect(() => parseFundingRequest({ action: 'funding-history' })).toThrow()
    expect(() => parseFundingRequest({ action: 'nonsense' })).toThrow()
  })
})

describe('funding rates', () => {
  it('annualises against the venue period when the row states none', async () => {
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      { fetchFundingRates: true },
      {
        fetchFundingRates: async () => ({
          'BTC/USDT:USDT': rateRow('BTC/USDT:USDT'),
        }),
      },
      { 'BTC/USDT:USDT': PERP },
    )

    const snap = (await provider.handle(exchange, {
      action: 'funding-rates',
    })) as FundingSnapshotResponse

    expect(snap.market).toBe('binance-futures')
    expect(snap.entries).toHaveLength(1)
    const entry = snap.entries[0]
    expect(entry.pair).toBe('BTC-USDT-USDT')
    expect(entry.base).toBe('BTC')
    expect(entry.intervalHours).toBe(8)
    // The pane may want to mark it: nothing in the payload said eight hours.
    expect(entry.intervalKnown).toBe(false)
    expect(entry.markPrice).toBe(63_121)
    expect(entry.nextFundingMs).toBe(1_800_000_000_000)
  })

  it("prefers the row's own period, then the venue's interval table", async () => {
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      { fetchFundingRates: true, fetchFundingIntervals: true },
      {
        fetchFundingRates: async () => [
          rateRow('BTC/USDT:USDT'),
          rateRow('BLZ/USDT:USDT', { interval: '1h' }),
        ],
        // The venue lists only the contracts that deviate from its default.
        fetchFundingIntervals: async () => [
          { symbol: 'BTC/USDT:USDT', interval: '4h' },
        ],
      },
      { 'BTC/USDT:USDT': PERP, 'BLZ/USDT:USDT': { swap: true } },
    )

    const snap = (await provider.handle(exchange, {
      action: 'funding-rates',
    })) as FundingSnapshotResponse
    const byPair = new Map(snap.entries.map((e) => [e.pair, e]))
    expect(byPair.get('BTC-USDT-USDT')!.intervalHours).toBe(4)
    expect(byPair.get('BTC-USDT-USDT')!.intervalKnown).toBe(true)
    expect(byPair.get('BLZ-USDT-USDT')!.intervalHours).toBe(1)
  })

  it('drops rows for anything that is not a perp', async () => {
    // Kraken publishes reference and index series through the same feed; they
    // parse as funding rows and have no contract behind them.
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      { fetchFundingRates: true },
      {
        fetchFundingRates: async () => [
          rateRow('BTC/USDT:USDT'),
          rateRow('IN/XBTUSD'),
        ],
      },
      { 'BTC/USDT:USDT': PERP, 'IN/XBTUSD': { swap: false, index: true } },
    )

    const snap = (await provider.handle(exchange, {
      action: 'funding-rates',
    })) as FundingSnapshotResponse
    expect(snap.entries.map((e) => e.pair)).toEqual(['BTC-USDT-USDT'])
  })

  it('falls back to one call per contract, and says so when handed none', async () => {
    const asked: Array<string> = []
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      // KuCoin's shape: the plural fetcher is declared false.
      { fetchFundingRates: false, fetchFundingRate: true },
      {
        fetchFundingRate: async (symbol: string) => {
          asked.push(symbol)
          return rateRow(symbol)
        },
      },
      { 'BTC/USDT:USDT': PERP, 'ETH/USDT:USDT': { swap: true } },
    )

    const snap = (await provider.handle(exchange, {
      action: 'funding-rates',
      pairs: ['BTC-USDT-USDT', 'ETH-USDT-USDT'],
    })) as FundingSnapshotResponse
    expect(asked.sort()).toEqual(['BTC/USDT:USDT', 'ETH/USDT:USDT'])
    expect(snap.entries).toHaveLength(2)

    await expect(
      provider.handle(exchange, { action: 'funding-rates' }),
    ).rejects.toThrow(/contract list/i)
  })

  it('resolves a base hint through the venue own markets table', async () => {
    // The caller must never build a pair key for a venue that names its own
    // contracts: KuCoin says XBTUSDTM for BTC, and a guessed symbol fails as a
    // BadSymbol several layers from the mistake.
    const asked: Array<string> = []
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      { fetchFundingRates: false, fetchFundingRate: true },
      {
        fetchFundingRate: async (symbol: string) => {
          asked.push(symbol)
          return rateRow(symbol)
        },
      },
      {
        'BTC/USDT:USDT': {
          swap: true,
          linear: true,
          base: 'BTC',
          quote: 'USDT',
        },
        'BTC/USDC:USDC': {
          swap: true,
          linear: true,
          base: 'BTC',
          quote: 'USDC',
        },
        'ETH/USDT:USDT': {
          swap: true,
          linear: true,
          base: 'ETH',
          quote: 'USDT',
        },
        'BTC/USDT': { spot: true, base: 'BTC', quote: 'USDT' },
        'PEPE/USDT:USDT': {
          swap: true,
          linear: true,
          base: 'PEPE',
          quote: 'USDT',
        },
      },
    )

    await provider.handle(exchange, {
      action: 'funding-rates',
      bases: ['BTC', 'ETH', 'NOTLISTED'],
    })
    // One contract per asset, deepest settlement leg, caller's order kept.
    expect(asked).toEqual(['BTC/USDT:USDT', 'ETH/USDT:USDT'])
  })

  it('serves a repeat sweep from cache and refetches once the TTL lapses', async () => {
    let calls = 0
    let clock = 1_000
    const provider = new CcxtFundingProvider(VENUE, () => clock)
    const exchange = fakeExchange(
      { fetchFundingRates: true },
      {
        fetchFundingRates: async () => {
          calls++
          return [rateRow('BTC/USDT:USDT')]
        },
      },
      { 'BTC/USDT:USDT': PERP },
    )

    await provider.handle(exchange, { action: 'funding-rates' })
    await provider.handle(exchange, { action: 'funding-rates' })
    expect(calls).toBe(1)

    clock += 60_000
    await provider.handle(exchange, { action: 'funding-rates' })
    expect(calls).toBe(2)
  })

  it('never caches a refusal', async () => {
    // The common failure is a transient refusal; pinning it for a TTL would
    // leave the board looking broken long after the venue recovered.
    let calls = 0
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      { fetchFundingRates: true },
      {
        fetchFundingRates: async () => {
          calls++
          if (calls === 1) throw new Error('451')
          return [rateRow('BTC/USDT:USDT')]
        },
      },
      { 'BTC/USDT:USDT': PERP },
    )

    await expect(
      provider.handle(exchange, { action: 'funding-rates' }),
    ).rejects.toThrow('451')
    const snap = (await provider.handle(exchange, {
      action: 'funding-rates',
    })) as FundingSnapshotResponse
    expect(snap.entries).toHaveLength(1)
  })
})

describe('open interest', () => {
  it('reports the venue as unsupported rather than empty', async () => {
    // Kraken through ccxt, with no fallback declared: a pane must be able to
    // tell "publishes nothing" from "nothing is open".
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange({})
    const oi = (await provider.handle(exchange, {
      action: 'open-interest',
      pairs: ['BTC-USDT-USDT'],
    })) as OpenInterestResponse
    expect(oi.supported).toBe(false)
    expect(oi.entries).toEqual([])
  })

  it('filters the bulk answer down to the contracts asked for', async () => {
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      { fetchOpenInterests: true },
      {
        fetchOpenInterests: async () => ({
          'BTC/USDT:USDT': {
            symbol: 'BTC/USDT:USDT',
            openInterestAmount: 8_053_960,
            timestamp: 1_774_007_467_050,
          },
          'DOGE/USDT:USDT': {
            symbol: 'DOGE/USDT:USDT',
            openInterestAmount: 12,
          },
        }),
      },
      // KuCoin's XBTUSDTM is 0.001 BTC a contract, and only the venue's own
      // market row knows it.
      { 'BTC/USDT:USDT': { ...PERP, contractSize: 0.001 } },
    )

    const oi = (await provider.handle(exchange, {
      action: 'open-interest',
      pairs: ['BTC-USDT-USDT'],
    })) as OpenInterestResponse
    expect(oi.supported).toBe(true)
    expect(oi.entries).toEqual([
      {
        pair: 'BTC-USDT-USDT',
        base: 'BTC',
        amount: 8_053_960,
        contractSize: 0.001,
        ts: 1_774_007_467_050,
      },
    ])
  })

  it('leaves the 24h change absent when the series cannot support one', async () => {
    const provider = new CcxtFundingProvider(VENUE)
    const exchange = fakeExchange(
      { fetchOpenInterest: true, fetchOpenInterestHistory: true },
      {
        fetchOpenInterest: async (symbol: string) => ({
          symbol,
          openInterestAmount: 100,
        }),
        fetchOpenInterestHistory: async (symbol: string) =>
          symbol === 'BTC/USDT:USDT'
            ? [
                { openInterestAmount: 80, timestamp: 1 },
                { openInterestAmount: 100, timestamp: 2 },
              ]
            : // One sample: no change exists, and a bar drawn from it would be
              // indistinguishable from a real one.
              [{ openInterestAmount: 50, timestamp: 1 }],
      },
    )

    const oi = (await provider.handle(exchange, {
      action: 'open-interest',
      pairs: ['BTC-USDT-USDT', 'ETH-USDT-USDT'],
      history: true,
    })) as OpenInterestResponse
    const byPair = new Map(oi.entries.map((e) => [e.pair, e]))
    expect(byPair.get('BTC-USDT-USDT')!.change24h).toBeCloseTo(0.25, 10)
    expect(byPair.get('ETH-USDT-USDT')!.change24h).toBeUndefined()
  })

  it('routes through the venue fallback where one is declared', async () => {
    const provider = new CcxtFundingProvider({
      ...VENUE,
      openInterestFallback: async (_exchange, symbols) =>
        symbols.map((symbol) => ({
          symbol,
          openInterestAmount: 72_513,
          openInterestValue: 3_146.09,
        })),
    })
    const oi = (await provider.handle(fakeExchange({}), {
      action: 'open-interest',
      pairs: ['ENJ-USD-USD'],
    })) as OpenInterestResponse
    expect(oi.supported).toBe(true)
    expect(oi.entries[0]).toMatchObject({
      pair: 'ENJ-USD-USD',
      amount: 72_513,
      value: 3_146.09,
    })
  })
})

describe('changeOverSeries', () => {
  it('is null unless both ends can be divided', () => {
    expect(changeOverSeries([])).toBeNull()
    expect(changeOverSeries([{ openInterestAmount: 5 }])).toBeNull()
    expect(
      changeOverSeries([
        { openInterestAmount: 0 },
        { openInterestAmount: 100 },
      ]),
    ).toBeNull()
  })

  it('measures the ends of the window, not the extremes inside it', () => {
    const change = changeOverSeries([
      { openInterestAmount: 100 },
      { openInterestAmount: 400 },
      { openInterestAmount: 50 },
    ])
    expect(change).toBeCloseTo(-0.5, 10)
  })
})

describe('funding history', () => {
  it('returns ascending points with the period they settled on', async () => {
    const provider = new CcxtFundingProvider({
      ...VENUE,
      fundingIntervalHours: 1,
    })
    const exchange = fakeExchange(
      { fetchFundingRateHistory: true },
      {
        fetchFundingRateHistory: async () => [
          { timestamp: 30, fundingRate: 0.0002 },
          { timestamp: 10, fundingRate: 0.0001 },
          { timestamp: 20, fundingRate: -0.0003 },
        ],
      },
    )

    const history = (await provider.handle(exchange, {
      action: 'funding-history',
      pair: 'BTC-USD-USD',
    })) as FundingHistoryResponse
    expect(history.points.map((p) => p.ts)).toEqual([10, 20, 30])
    expect(history.intervalHours).toBe(1)
    expect(history.pair).toBe('BTC-USD-USD')
  })

  it('names the venue when it publishes no series', async () => {
    const provider = new CcxtFundingProvider(VENUE)
    await expect(
      provider.handle(fakeExchange({}), {
        action: 'funding-history',
        pair: 'BTC-USDT-USDT',
      }),
    ).rejects.toThrow(/Binance Futures/)
  })
})
