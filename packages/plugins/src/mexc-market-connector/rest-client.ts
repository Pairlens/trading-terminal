// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { olderThan, pageEndMs } from '@pairlens/market-engine/candle-paging'
import {
  GeoRestrictedError,
  assertResponseOk,
} from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToMexcInterval,
  mexcTimeframeMs,
  normalizePair,
  parseMexcBulkTickerRow,
  parseMexcRestKline,
} from './parser'
import { resolveMexcUrls } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'

/** Fetch historical candles from MEXC REST API. */
export async function fetchMexcCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const urls = resolveMexcUrls(country)
  if (!urls) throw new GeoRestrictedError('MEXC', country)

  const interval = mapTimeframeToMexcInterval(timeframe)
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = normalizePair(pair)
  const clamped = Math.min(limit, 1000)
  // `endTime` on its own is ignored — the API only honours it alongside an
  // explicit `startTime`, so the window is computed rather than implied.
  let range = ''
  if (endTs !== undefined) {
    const end = pageEndMs(endTs)
    range = `&startTime=${end - clamped * mexcTimeframeMs(timeframe)}&endTime=${end}`
  }
  const url = `${urls.restBase}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${clamped}${range}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'MEXC', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as Array<Array<unknown>>

  const candles: Array<Candle> = []
  for (const row of json) {
    const parsed = parseMexcRestKline(row)
    if (parsed) candles.push(parsed)
  }

  // MEXC returns oldest first — already in chronological order
  return olderThan(candles, endTs)
}

/** Fetch bulk 24h quotes for every listed symbol from MEXC REST API. */
export async function fetchMexcTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const urls = resolveMexcUrls(country)
  if (!urls) throw new GeoRestrictedError('MEXC', country)
  const url = `${urls.restBase}/api/v3/ticker/24hr`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'MEXC', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as Array<Record<string, unknown>>
  const tickers = json
    .map(parseMexcBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'mexc', tickers, ts: Date.now() }
}
