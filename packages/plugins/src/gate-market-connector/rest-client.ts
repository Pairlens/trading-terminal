// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { olderThan, pageEndSec } from '@pairlens/market-engine/candle-paging'
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToGateInterval,
  normalizePair,
  parseGateBulkTickerRow,
  parseGateRestKline,
} from './parser'
import { resolveGateRestBase } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'

/** Map Gate.io interval string to interval in seconds. */
function gateIntervalToSeconds(interval: string): number {
  const map: Record<string, number> = {
    '10s': 10,
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '8h': 28800,
    '1d': 86400,
    '7d': 604800,
  }
  return map[interval] ?? 3600
}

/**
 * Fetch historical candles from Gate.io REST API.
 * GET /spot/candlesticks?currency_pair=BTC_USDT&interval=1h&limit=300
 *
 * Gate.io returns candles oldest-first (chronological order).
 * Max 1000 per request.
 */
export async function fetchGateCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  paper?: boolean,
  endTs?: number,
): Promise<Array<Candle>> {
  const restBase = resolveGateRestBase(paper)
  const interval = mapTimeframeToGateInterval(timeframe)
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = normalizePair(pair)
  const clampedLimit = Math.min(limit, 1000)

  // Use from/to time range for accurate candle count
  const intervalSeconds = gateIntervalToSeconds(interval)
  const to =
    endTs === undefined ? Math.floor(Date.now() / 1000) : pageEndSec(endTs)
  const from = to - clampedLimit * intervalSeconds

  const url = `${restBase}/spot/candlesticks?currency_pair=${symbol}&interval=${interval}&from=${from}&to=${to}&limit=${clampedLimit}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Gate.io',
      country,
      await resp.text().catch(() => ''),
    )
  }

  // Gate.io returns data directly (no envelope) — array of string arrays
  const json = (await resp.json()) as unknown

  // Error response has `label` field
  if (json && typeof json === 'object' && 'label' in json) {
    const err = json as { label: string; message: string }
    throw new Error(`Gate.io API error: ${err.label} — ${err.message}`)
  }

  const rows = json as Array<Array<unknown>>
  const candles: Array<Candle> = []
  for (const row of rows) {
    const parsed = parseGateRestKline(row)
    if (parsed) candles.push(parsed)
  }

  // Gate.io returns oldest first — already chronological
  const paged = olderThan(candles, endTs)

  // Respect limit
  if (paged.length > limit) {
    return paged.slice(paged.length - limit)
  }

  return paged
}

/** Fetch bulk 24h quotes for every listed pair from Gate REST API. */
export async function fetchGateTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const restBase = resolveGateRestBase(false)
  const url = `${restBase}/spot/tickers`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'Gate', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as Array<Record<string, unknown>>
  const tickers = json
    .map(parseGateBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'gate', tickers, ts: Date.now() }
}
