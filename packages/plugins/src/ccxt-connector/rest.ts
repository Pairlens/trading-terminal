// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two REST reads a connector owes the terminal: candle history (with
 * pan-left paging) and the bulk 24 h ticker snapshot.
 *
 * Both run through the same ccxt instance the streams use, so they inherit
 * `fetchImplementation = restFetch` — desktop routes them through the Rust HTTP
 * client, dev routes them through the Vite proxy prefix baked into
 * `urls.api.rest`, and the `globalThis.fetch` stub the order-executor suites
 * install still sees them.
 */

import { olderThan } from '@pairlens/market-engine/candle-paging'
import { sortCandlesAscending } from '@pairlens/market-engine/candle-buffer'
import { parseCcxtBulkTickerRow, parseCcxtOhlcvBatch } from './parser'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'
import type { Candle } from '@pairlens/shared/types'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'

/**
 * A page of history, ascending, strictly older than `endTs` when one is given.
 *
 * The cursor is nudged AND the result filtered, because venues disagree about
 * inclusivity and a single duplicated boundary bar makes the chart latch
 * `exhausted` for the rest of the session: `use-chart-terminal-state` keeps
 * only bars strictly older than what it holds, so a page containing nothing but
 * the boundary bar filters to empty and reads as "no more history". The nudge
 * itself is venue-owned (`historyPageParams`) because OKX's `after` is already
 * exclusive while Binance's `endTime` is not.
 */
export async function fetchCcxtHistory(
  exchange: CcxtExchangeLike,
  venue: CcxtVenueConfig,
  symbol: string,
  timeframe: string,
  limit: number,
  endTs?: number,
): Promise<Array<Candle>> {
  const pageLimit = Math.min(limit, venue.maxHistoryLimit)
  const params = venue.historyParams
    ? venue.historyParams({
        timeframe,
        limit: pageLimit,
        ...(endTs !== undefined ? { endTs } : {}),
      })
    : endTs !== undefined
      ? (venue.historyPageParams?.(endTs) ?? {})
      : {}
  const rows = await exchange.fetchOHLCV(
    symbol,
    timeframe,
    undefined,
    pageLimit,
    params,
  )
  // ccxt sorts OHLCV ascending in `parseOHLCVs`, but a venue that changes its
  // REST ordering (they do, silently) would break the buffer's append path —
  // sortCandlesAscending also de-duplicates equal timestamps, keeping the later.
  const candles = sortCandlesAscending(parseCcxtOhlcvBatch(rows))
  return olderThan(candles, endTs)
}

/**
 * Every listed spot pair's last price and 24 h change in one call.
 *
 * This is also the app's live listing signal, which is why unpriced rows are
 * dropped rather than reported at 0. Needs the REAL market table: without it
 * `safeMarket` invents a symbol from the raw venue id ('BTCUSDT' on Binance),
 * which carries no base/quote split and would be discarded downstream.
 */
export async function fetchCcxtBulkTickers(
  exchange: CcxtExchangeLike,
  marketId: string,
): Promise<BulkTickersResponse> {
  const raw = await exchange.fetchTickers()
  const tickers: Array<BulkTickerEntry> = []
  for (const [symbol, entry] of Object.entries(raw)) {
    const row = parseCcxtBulkTickerRow(symbol, entry)
    if (row) tickers.push(row)
  }
  return { market: marketId, tickers, ts: Date.now() }
}
