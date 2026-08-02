// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit public REST client — candle backfill.
 *
 * GET /v1/candles/minutes/{unit}?market=USDT-BTC&count=200
 * GET /v1/candles/days?market=USDT-BTC&count=200
 * Response: array of candle objects (newest first).
 * Max 200 per request.
 */

import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  parseUpbitBulkTickerRow,
  parseUpbitCandle,
  toUpbitCode,
  toUpbitRestCandle,
} from './parser'
import { resolveUpbitQuoteCurrencies, resolveUpbitUrls } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/market-engine/types'

export async function fetchUpbitCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
): Promise<Array<Candle>> {
  const rest = toUpbitRestCandle(timeframe)
  if (!rest) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const market = toUpbitCode(pair)
  const { restBase } = resolveUpbitUrls(country)

  // Upbit max 200 per request. Upbit Global has low liquidity — candles only
  // exist for days with trades, so 200 daily candles can span years and include
  // extreme outlier prices from erroneous trades. Filter candles to the last
  // 6 months and remove price outliers.
  const count = Math.min(limit, 200)
  const url = `${restBase}${rest.path}?market=${market}&count=${count}`

  const res = await fetch(url)
  if (!res.ok) {
    assertResponseOk(res, 'Upbit', country, await res.text().catch(() => ''))
  }

  const json = (await res.json()) as Array<{
    candle_date_time_utc: string
    timestamp: number
    opening_price: number
    high_price: number
    low_price: number
    trade_price: number
    candle_acc_trade_volume: number
  }>

  if (!Array.isArray(json) || json.length === 0) return []

  // Filter: only candles from the last 6 months to avoid ancient outliers
  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
  const recent = json.filter((c) => {
    const ts = new Date(c.candle_date_time_utc + 'Z').getTime()
    return ts >= sixMonthsAgo
  })

  if (recent.length === 0) return json.map(parseUpbitCandle).reverse()

  // Compute median close price from recent candles for outlier detection
  const closes = recent.map((c) => c.trade_price).sort((a, b) => a - b)
  const median = closes[Math.floor(closes.length / 2)]

  // Filter out candles with prices > 10x or < 0.1x the median (erroneous trades)
  const filtered = recent.filter(
    (c) => c.high_price < median * 10 && c.low_price > median * 0.1,
  )

  // Upbit returns newest first; reverse to chronological
  return (filtered.length > 0 ? filtered : recent)
    .map(parseUpbitCandle)
    .reverse()
}

/** Fetch bulk 24h quotes for every listed market from Upbit REST API. */
export async function fetchUpbitTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const { restBase } = resolveUpbitUrls(country)
  const quotes = resolveUpbitQuoteCurrencies(country).join(',')
  const url = `${restBase}/v1/ticker/all?quote_currencies=${quotes}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'Upbit', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as Array<Record<string, unknown>>
  const tickers = json
    .map(parseUpbitBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'upbit', tickers, ts: Date.now() }
}
