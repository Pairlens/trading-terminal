// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  GeoRestrictedError,
  assertResponseOk,
} from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToBybitInterval,
  normalizePair,
  parseBybitBulkTickerRow,
  parseBybitRestKline,
  parseBybitTicker,
} from './parser'
import { resolveBybitUrls } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

/** Fetch historical candles from ByBit REST API. */
export async function fetchBybitCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const urls = resolveBybitUrls(country)
  if (!urls) throw new GeoRestrictedError('ByBit', country)

  const interval = mapTimeframeToBybitInterval(timeframe)
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = normalizePair(pair)
  // `end` is inclusive; subtract 1ms so the candle at endTs is excluded.
  const endParam = endTs !== undefined ? `&end=${endTs - 1}` : ''
  const url = `${urls.restBase}/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 200)}${endParam}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'ByBit', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    retCode: number
    retMsg: string
    result: { list: Array<Array<string>> }
  }
  if (json.retCode !== 0)
    throw new Error(`ByBit API error: ${json.retCode} ${json.retMsg}`)

  const candles: Array<Candle> = []
  for (const row of json.result.list) {
    const parsed = parseBybitRestKline(row)
    if (parsed) candles.push(parsed)
  }

  // ByBit returns newest first, reverse to chronological order
  candles.reverse()
  return candles
}

/** Fetch current ticker from ByBit REST API. */
export async function fetchBybitTicker(
  pair: string,
  country: string,
): Promise<TickerSnapshot> {
  const urls = resolveBybitUrls(country)
  if (!urls) throw new GeoRestrictedError('ByBit', country)

  const symbol = normalizePair(pair)
  const url = `${urls.restBase}/v5/market/tickers?category=spot&symbol=${symbol}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'ByBit', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    retCode: number
    retMsg: string
    result: { list: Array<Record<string, unknown>> }
  }
  if (json.retCode !== 0 || !json.result.list[0])
    throw new Error(`ByBit API error: ${json.retCode} ${json.retMsg}`)

  return parseBybitTicker(json.result.list[0])
}

/** Fetch bulk 24h quotes for every spot pair from ByBit REST API. */
export async function fetchBybitTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const urls = resolveBybitUrls(country)
  if (!urls) throw new GeoRestrictedError('ByBit', country)
  const url = `${urls.restBase}/v5/market/tickers?category=spot`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'ByBit', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    retCode: number
    result?: { list?: Array<Record<string, unknown>> }
  }
  if (json.retCode !== 0) throw new Error(`ByBit API error: ${json.retCode}`)

  const tickers = (json.result?.list ?? [])
    .map(parseBybitBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'bybit', tickers, ts: Date.now() }
}
