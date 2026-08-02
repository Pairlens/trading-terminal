// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToBinanceInterval,
  normalizePair,
  parseBinanceBulkTickerRow,
  parseBinanceRestKline,
  parseBinanceTicker,
} from './parser'
import { resolveBinanceUrls } from './regions'
import type { Candle } from '@pairlens/shared/types'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

/** Fetch historical candles from Binance REST API. */
export async function fetchBinanceCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const urls = resolveBinanceUrls(country)
  const interval = mapTimeframeToBinanceInterval(timeframe)
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = normalizePair(pair)
  // endTime is inclusive; subtract 1ms so the candle at endTs is excluded.
  const endParam = endTs !== undefined ? `&endTime=${endTs - 1}` : ''
  const url = `${urls.restBase}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 500)}${endParam}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Binance',
      country,
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as Array<Array<unknown>>

  const candles: Array<Candle> = []
  for (const row of json) {
    const parsed = parseBinanceRestKline(row)
    if (parsed) candles.push(parsed)
  }

  // Binance returns oldest first — already in chronological order
  return candles
}

/** Fetch orderbook depth snapshot from Binance REST API. */
export async function fetchBinanceDepth(
  pair: string,
  country: string,
  limit = 100,
): Promise<{
  lastUpdateId: number
  bids: Array<[string, string]>
  asks: Array<[string, string]>
}> {
  const urls = resolveBinanceUrls(country)
  const symbol = normalizePair(pair)
  const url = `${urls.restBase}/api/v3/depth?symbol=${symbol}&limit=${Math.min(limit, 1000)}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Binance',
      country,
      await resp.text().catch(() => ''),
    )
  }

  return (await resp.json()) as {
    lastUpdateId: number
    bids: Array<[string, string]>
    asks: Array<[string, string]>
  }
}

/** Fetch current ticker from Binance REST API. */
export async function fetchBinanceTicker(
  pair: string,
  country: string,
): Promise<TickerSnapshot> {
  const urls = resolveBinanceUrls(country)
  const symbol = normalizePair(pair)
  const url = `${urls.restBase}/api/v3/ticker/24hr?symbol=${symbol}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Binance',
      country,
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as Record<string, unknown>
  return parseBinanceTicker(json)
}

/** Fetch bulk 24h quotes for every listed symbol from Binance REST API. */
export async function fetchBinanceTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const urls = resolveBinanceUrls(country)
  const url = `${urls.restBase}/api/v3/ticker/24hr`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Binance',
      country,
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as Array<Record<string, unknown>>
  const tickers = json
    .map(parseBinanceBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'binance', tickers, ts: Date.now() }
}
