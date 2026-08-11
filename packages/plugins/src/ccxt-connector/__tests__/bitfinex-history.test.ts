// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex reads history from whichever end `sort` names, and ccxt names the
 * wrong one.
 *
 * This is the highest-consequence bug of the three venues and the least
 * visible: with `sort: 1` and no cursor, a 300-bar request walks forward from
 * pair inception, so the chart draws March 2019 as the present — ascending,
 * millisecond-stamped, internally consistent, and seven years stale. Measured
 * against the live venue before the fix; pinned here so it cannot come back.
 */

import { describe, expect, it } from 'bun:test'
import { installBitfinexHistoryOrder } from '../bitfinex-history'
import type { CcxtExchangeLike, CcxtOhlcvRow } from '../types'

type Call = {
  since: number | undefined
  limit: number | undefined
  params: Record<string, unknown>
}

function fake(): { exchange: CcxtExchangeLike; calls: Array<Call> } {
  const calls: Array<Call> = []
  const exchange = {
    id: 'bitfinex',
    has: {},
    timeframes: {},
    urls: {},
    options: {},
    setMarkets: () => undefined,
    loadMarkets: async () => undefined,
    market: () => ({}),
    watchOHLCV: async () => [],
    watchTicker: async () => ({}),
    watchOrderBook: async () => ({ bids: [], asks: [] }),
    watchTrades: async () => [],
    fetchOHLCV: async (
      _symbol: string,
      _timeframe?: string,
      since?: number,
      limit?: number,
      params: Record<string, unknown> = {},
    ): Promise<Array<CcxtOhlcvRow>> => {
      calls.push({ since, limit, params })
      return []
    },
    fetchTickers: async () => ({}),
    close: async () => undefined,
  } as unknown as CcxtExchangeLike
  installBitfinexHistoryOrder(exchange)
  return { exchange, calls }
}

describe('bitfinex history order', () => {
  it('reads the NEWEST candles by default — ccxt`s sort:1 starts at inception', async () => {
    const { exchange, calls } = fake()
    await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 300, {})
    expect(calls[0]?.params['sort']).toBe(-1)
  })

  it('keeps the newest-first walk when paging left', async () => {
    const { exchange, calls } = fake()
    await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 300, {
      until: 1_700_000_000_000,
    })
    expect(calls[0]?.params).toEqual({
      until: 1_700_000_000_000,
      sort: -1,
    })
  })

  it('leaves an explicit `since` walking forwards, which is what sort:1 is for', async () => {
    const { exchange, calls } = fake()
    await exchange.fetchOHLCV('BTC/USDT', '1h', 1_600_000_000_000, 300, {})
    expect(calls[0]?.params['sort']).toBeUndefined()
  })

  it('never overrides a caller`s own sort', async () => {
    const { exchange, calls } = fake()
    await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 300, { sort: 1 })
    expect(calls[0]?.params['sort']).toBe(1)
  })

  it('is idempotent — a second install must not double-wrap', async () => {
    const { exchange, calls } = fake()
    installBitfinexHistoryOrder(exchange)
    await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 300, {})
    expect(calls).toHaveLength(1)
    expect(calls[0]?.params['sort']).toBe(-1)
  })
})
