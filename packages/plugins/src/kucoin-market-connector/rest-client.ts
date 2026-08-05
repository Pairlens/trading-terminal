// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { olderThan, pageEndSec } from '@pairlens/market-engine/candle-paging'
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToKucoinType,
  normalizePair,
  parseKucoinBulkTickerRow,
  parseKucoinRestKline,
  parseKucoinStats,
} from './parser'
import { resolveKucoinRestBase } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

/** Map KuCoin candle type to interval in seconds. */
function kucoinTypeToSeconds(type: string): number {
  const map: Record<string, number> = {
    '1min': 60,
    '3min': 180,
    '5min': 300,
    '15min': 900,
    '30min': 1800,
    '1hour': 3600,
    '2hour': 7200,
    '4hour': 14400,
    '6hour': 21600,
    '8hour': 28800,
    '12hour': 43200,
    '1day': 86400,
    '1week': 604800,
  }
  return map[type] ?? 3600
}

/**
 * Fetch historical candles from KuCoin REST API.
 * GET /api/v1/market/candles?symbol={pair}&type={type}
 * Max 1500 candles per request.
 */
export async function fetchKucoinCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const restBase = resolveKucoinRestBase(country)
  const kucoinType = mapTimeframeToKucoinType(timeframe)
  if (!kucoinType) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = normalizePair(pair)

  // KuCoin doesn't have a `limit` param — use startAt/endAt time range.
  // Calculate how far back to go based on the requested candle count + interval.
  const intervalSeconds = kucoinTypeToSeconds(kucoinType)
  const endAt =
    endTs === undefined ? Math.floor(Date.now() / 1000) : pageEndSec(endTs)
  const startAt = endAt - limit * intervalSeconds

  const url = `${restBase}/api/v1/market/candles?symbol=${symbol}&type=${kucoinType}&startAt=${startAt}&endAt=${endAt}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'KuCoin', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    code: string
    data: Array<Array<unknown>>
  }

  if (json.code !== '200000') throw new Error(`KuCoin API error: ${json.code}`)

  const candles: Array<Candle> = []
  for (const row of json.data ?? []) {
    const parsed = parseKucoinRestKline(row)
    if (parsed) candles.push(parsed)
  }

  // KuCoin returns newest first — reverse to chronological order
  candles.reverse()

  const paged = olderThan(candles, endTs)

  // Respect limit
  if (paged.length > limit) {
    return paged.slice(paged.length - limit)
  }

  return paged
}

/**
 * Fetch 24h market stats from KuCoin REST API.
 * GET /api/v1/market/stats?symbol={pair}
 * Returns high, low, vol, last, buy, sell, changeRate, time.
 */
export async function fetchKucoinStats(
  pair: string,
  country: string,
): Promise<TickerSnapshot> {
  const restBase = resolveKucoinRestBase(country)
  const symbol = normalizePair(pair)
  const url = `${restBase}/api/v1/market/stats?symbol=${symbol}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'KuCoin', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    code: string
    data: Record<string, string>
  }

  if (json.code !== '200000' || !json.data)
    throw new Error(`KuCoin API error: ${json.code}`)

  return parseKucoinStats(json.data)
}

/** Fetch bulk 24h quotes for every listed pair from KuCoin REST API. */
export async function fetchKucoinTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const restBase = resolveKucoinRestBase(country)
  const url = `${restBase}/api/v1/market/allTickers`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'KuCoin', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    code: string
    data?: { ticker?: Array<Record<string, unknown>> }
  }
  if (json.code !== '200000') {
    throw new Error(`KuCoin API error: ${json.code}`)
  }

  const tickers = (json.data?.ticker ?? [])
    .map(parseKucoinBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'kucoin', tickers, ts: Date.now() }
}
