// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Public-REST smoke tests against the real futures venues.
 *
 * Skipped unless `PAIRLENS_LIVE_TESTS=1`, so CI stays hermetic. Run them by
 * hand after a ccxt bump or a venue-config change:
 *
 *     PAIRLENS_LIVE_TESTS=1 bun test packages/plugins/src/ccxt-futures-connector
 *
 * They read only public endpoints, carry no credentials and place no orders.
 * Two of the three venues are desktop-only because their hosts send no CORS
 * headers — under bun there is no `Origin` at all, which is exactly why this
 * file can reach them and a browser build cannot.
 *
 * What none of this can be observed from a mock: whether the venue still
 * publishes the intervals the manifest advertises, whether the market table
 * survives the trim (a filter that is one flag too strict returns an empty
 * venue with no error anywhere), and whether the pair keys the trim produces
 * actually round-trip back to symbols the venue resolves.
 */

import { describe, expect, it } from 'bun:test'
import { CcxtExchangeHost } from '../../ccxt-connector/exchange-host'
import { fetchCcxtHistory } from '../../ccxt-connector/rest'
import {
  CcxtFuturesMarketsProvider,
  memoryFuturesMarketsStorage,
} from '../futures-markets'
import { fromFuturesSymbol, toFuturesSymbol } from '../futures-symbols'
import { binanceFuturesCcxtVenue } from '../venues/binance-futures'
import { kucoinFuturesCcxtVenue } from '../venues/kucoin-futures'
import { krakenFuturesCcxtVenue } from '../venues/kraken-futures'
import type { CcxtFuturesVenueConfig } from '../futures-types'

const LIVE = process.env['PAIRLENS_LIVE_TESTS'] === '1'

const VENUES: Array<{
  label: string
  venue: CcxtFuturesVenueConfig
  /** A contract every one of these venues has listed for years. */
  pair: string
  timeframes: Array<string>
}> = [
  {
    label: 'binance-futures',
    venue: binanceFuturesCcxtVenue,
    pair: 'BTC-USDT-USDT',
    timeframes: ['1h', '1d'],
  },
  {
    label: 'kucoin-futures',
    venue: kucoinFuturesCcxtVenue,
    pair: 'BTC-USDT-USDT',
    timeframes: ['1h', '1d'],
  },
  {
    label: 'kraken-futures',
    venue: krakenFuturesCcxtVenue,
    pair: 'BTC-USD-USD',
    timeframes: ['1h', '1d'],
  },
]

describe.skipIf(!LIVE)('live futures venues', () => {
  for (const { label, venue, pair, timeframes } of VENUES) {
    it(`${label}: lists linear perps and serves their candles`, async () => {
      const host = new CcxtExchangeHost({ venue })
      const markets = new CcxtFuturesMarketsProvider(
        venue.exchangeId,
        memoryFuturesMarketsStorage(),
      )
      try {
        const { exchange } = await host.acquire()
        await markets.whenReady(exchange)

        const table = markets.peek()
        expect(table, `${label} market table`).not.toBeNull()
        expect(table!.markets.length).toBeGreaterThan(10)

        for (const seed of table!.markets) {
          expect(seed.swap).toBe(true)
          expect(seed.linear).toBe(true)
          // An index row would surface here as a raw venue id with no slash.
          expect(seed.symbol).toContain(':')
          // The key the whole runtime addresses this contract by has to
          // round-trip back to a symbol the venue itself resolves.
          expect(toFuturesSymbol(fromFuturesSymbol(seed.symbol))).toBe(
            seed.symbol,
          )
        }

        const symbol = toFuturesSymbol(pair)
        expect(
          markets.hasSymbol(exchange, symbol),
          `${label} lists ${symbol}`,
        ).toBe(true)

        for (const timeframe of timeframes) {
          const candles = await fetchCcxtHistory(
            exchange,
            venue,
            symbol,
            timeframe,
            50,
          )
          expect(candles.length, `${label} ${timeframe} bars`).toBeGreaterThan(
            5,
          )
          for (const candle of candles) {
            expect(candle.high).toBeGreaterThanOrEqual(candle.low)
            // Epoch MILLISECONDS — the seconds/ms mix-up is the connector bug
            // that fails silently everywhere downstream.
            expect(candle.ts).toBeGreaterThan(1_000_000_000_000)
          }
          // Ascending and strictly increasing, which the buffer's append path
          // assumes.
          const stamps = candles.map((c) => c.ts)
          expect([...stamps].sort((a, b) => a - b)).toEqual(stamps)
        }

        // Pan-left: a page strictly older than the oldest bar we just read.
        const first = await fetchCcxtHistory(exchange, venue, symbol, '1h', 50)
        const older = await fetchCcxtHistory(
          exchange,
          venue,
          symbol,
          '1h',
          50,
          first[0].ts,
        )
        expect(older.length, `${label} paged page`).toBeGreaterThan(0)
        expect(older[older.length - 1].ts).toBeLessThan(first[0].ts)
      } finally {
        await host.destroy()
      }
    }, 120_000)
  }
})
