// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pan-left history paging contract, for every venue at once.
 *
 * The chart backfills older bars by passing `endTs` — the oldest bar it holds —
 * and keeps only what comes back strictly older. A connector that drops the
 * cursor therefore returns the same recent window every time, that window
 * filters to empty, and `use-chart-terminal-state` latches `exhausted`: scroll
 * back dies at the initial seed for the rest of the session, silently. Eleven
 * of fifteen connectors shipped that way once.
 *
 * Before the ccxt migration this was pinned per venue, against each native REST
 * client's request URL. Every venue now pages through one function, so the
 * cursor can be dropped for all fourteen in a single edit — which is a better
 * reason to keep this test than the natives ever gave. The table below pins the
 * cursor SPELLING each venue needs (ccxt renames `until` per exchange, and the
 * two that must not be nudged are the point of the exercise), and the cases
 * after it pin what `fetchCcxtHistory` does around that call.
 */

import { describe, expect, it } from 'bun:test'

import { fetchCcxtHistory } from '../rest'
import { binanceCcxtVenue } from '../venues/binance'
import { bitfinexCcxtVenue } from '../venues/bitfinex'
import { bitgetCcxtVenue } from '../venues/bitget'
import { bitvavoCcxtVenue } from '../venues/bitvavo'
import { bybitCcxtVenue } from '../venues/bybit'
import { coinbaseCcxtVenue } from '../venues/coinbase'
import { cryptocomCcxtVenue } from '../venues/cryptocom'
import { gateCcxtVenue } from '../venues/gate'
import { htxCcxtVenue } from '../venues/htx'
import { krakenCcxtVenue } from '../venues/kraken'
import { kucoinCcxtVenue } from '../venues/kucoin'
import { mexcCcxtVenue } from '../venues/mexc'
import { okxCcxtVenue } from '../venues/okx'
import { upbitCcxtVenue } from '../venues/upbit'
import type { CcxtExchangeLike, CcxtOhlcvRow, CcxtVenueConfig } from '../types'

// A round timestamp so the expected cursor arithmetic is readable.
const CURSOR = 1_700_000_000_000
const HOUR = 3_600_000

const VENUES: Array<[string, CcxtVenueConfig]> = [
  ['okx', okxCcxtVenue],
  ['binance', binanceCcxtVenue],
  ['bybit', bybitCcxtVenue],
  ['bitvavo', bitvavoCcxtVenue],
  ['mexc', mexcCcxtVenue],
  ['kucoin', kucoinCcxtVenue],
  ['gate', gateCcxtVenue],
  ['coinbase', coinbaseCcxtVenue],
  ['bitget', bitgetCcxtVenue],
  ['kraken', krakenCcxtVenue],
  ['htx', htxCcxtVenue],
  ['cryptocom', cryptocomCcxtVenue],
  ['bitfinex', bitfinexCcxtVenue],
  ['upbit', upbitCcxtVenue],
]

type Call = {
  symbol: string
  timeframe: string
  since: number | undefined
  limit: number | undefined
  params: Record<string, unknown>
}

/** Records the OHLCV call and answers with whatever rows the case supplies. */
function fakeExchange(rows: Array<CcxtOhlcvRow> = []) {
  const calls: Array<Call> = []
  const exchange = {
    fetchOHLCV: async (
      symbol: string,
      timeframe?: string,
      since?: number,
      limit?: number,
      params?: Record<string, unknown>,
    ) => {
      calls.push({
        symbol,
        timeframe: timeframe ?? '',
        since,
        limit,
        params: params ?? {},
      })
      return rows
    },
  }
  return { exchange: exchange as unknown as CcxtExchangeLike, calls }
}

async function page(
  venue: CcxtVenueConfig,
  endTs: number | undefined,
  rows: Array<CcxtOhlcvRow> = [],
  limit = 300,
) {
  const { exchange, calls } = fakeExchange(rows)
  const candles = await fetchCcxtHistory(
    exchange,
    venue,
    'BTC/USDT',
    '1h',
    limit,
    endTs,
  )
  return { candles, call: calls[0] }
}

describe('every venue puts the pan-left cursor on the wire', () => {
  // The exact params each venue's paged read must carry. ccxt translates
  // `until` into that exchange's own query field, so the spelling here is the
  // venue's contract, not decoration.
  const EXPECTED: Record<string, Record<string, unknown>> = {
    // OKX's `after` is already exclusive, so the cursor is passed unnudged —
    // and the paged read must move to the history endpoint, which is the only
    // one that serves bars older than the recent window.
    okx: { until: CURSOR, type: 'HistoryCandles' },
    // Kraken's is consumed by the guard, which filters strictly-older itself.
    kraken: { until: CURSOR },
    // Everywhere else the boundary bar is inclusive and has to be stepped past.
    binance: { until: CURSOR - 1 },
    bybit: { until: CURSOR - 1 },
    bitvavo: { until: CURSOR - 1 },
    mexc: { until: CURSOR - 1 },
    kucoin: { until: CURSOR - 1 },
    gate: { until: CURSOR - 1 },
    bitget: { until: CURSOR - 1 },
    htx: { until: CURSOR - 1 },
    cryptocom: { until: CURSOR - 1 },
    bitfinex: { until: CURSOR - 1 },
    // Upbit pages by an ISO instant rather than an epoch.
    upbit: { to: '2023-11-14T22:13:19.999Z' },
  }

  for (const [name, venue] of VENUES) {
    // Coinbase is the one venue that needs a full window rather than a cursor;
    // it gets its own case below.
    if (name === 'coinbase') continue

    it(`${name} sends the cursor its endpoint understands`, async () => {
      const { call } = await page(venue, CURSOR)
      expect(call.params).toEqual(EXPECTED[name])
    })
  }

  it('coinbase sends a bounded window, since it accepts no bare cursor', async () => {
    const { call } = await page(coinbaseCcxtVenue, CURSOR)
    const { start, end } = call.params as { start: string; end: string }
    // Seconds, and `end` steps past the inclusive boundary bar.
    expect(end).toBe(String(CURSOR / 1000 - 1))
    expect(Number(start)).toBeLessThan(Number(end))
  })

  it('sends no paging params at all on a head read', async () => {
    for (const [name, venue] of VENUES) {
      const { call } = await page(venue, undefined)
      if (name === 'coinbase') {
        // Coinbase always needs a window; it just ends at now instead.
        expect(Object.keys(call.params).sort()).toEqual(['end', 'start'])
        continue
      }
      expect(call.params, `${name} paged an unpaged read`).toEqual({})
    }
  })

  it('leaves no venue without a cursor hook', () => {
    // A venue added with neither hook would silently return the same recent
    // window for every pan-left, which is exactly the original bug.
    for (const [name, venue] of VENUES) {
      const hasHook =
        venue.historyParams !== undefined ||
        venue.historyPageParams !== undefined
      expect(hasHook, `${name} declares no history cursor`).toBe(true)
    }
  })
})

describe('fetchCcxtHistory', () => {
  it('clamps the page to what one call can really return', async () => {
    for (const [name, venue] of VENUES) {
      const { call } = await page(venue, CURSOR, [], 100_000)
      expect(call.limit, `${name} over-asked`).toBe(venue.maxHistoryLimit)
    }
  })

  it('asks for the caller`s limit when it fits', async () => {
    const { call } = await page(binanceCcxtVenue, CURSOR, [], 120)
    expect(call.limit).toBe(120)
  })

  it('drops the boundary bar, which is what latches `exhausted`', async () => {
    // A venue that answers inclusively returns the cursor bar itself; passing
    // it through makes the chart read a full page as "nothing older".
    const rows: Array<CcxtOhlcvRow> = [
      [CURSOR - 2 * HOUR, 1, 2, 0.5, 1.5, 10],
      [CURSOR - HOUR, 1, 2, 0.5, 1.5, 10],
      [CURSOR, 1, 2, 0.5, 1.5, 10],
    ]
    const { candles } = await page(binanceCcxtVenue, CURSOR, rows)
    expect(candles.map((c) => c.ts)).toEqual([CURSOR - 2 * HOUR, CURSOR - HOUR])
  })

  it('returns bars ascending even if the venue answers newest-first', async () => {
    // The buffer appends; a descending page would corrupt its ordering.
    const rows: Array<CcxtOhlcvRow> = [
      [CURSOR - HOUR, 1, 2, 0.5, 1.5, 10],
      [CURSOR - 3 * HOUR, 1, 2, 0.5, 1.5, 10],
      [CURSOR - 2 * HOUR, 1, 2, 0.5, 1.5, 10],
    ]
    const { candles } = await page(binanceCcxtVenue, CURSOR, rows)
    expect(candles.map((c) => c.ts)).toEqual([
      CURSOR - 3 * HOUR,
      CURSOR - 2 * HOUR,
      CURSOR - HOUR,
    ])
  })
})
