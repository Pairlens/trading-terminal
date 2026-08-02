// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken public REST client — candle backfill and orderbook snapshot.
 *
 * - GET /0/public/OHLC — max 720 candles, chronological order
 * - GET /0/public/Depth — orderbook snapshot up to 500 levels
 *
 * Response envelope: { "error": [...], "result": { ... } }
 */

import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  parseKrakenBulkEntry,
  parseRestCandle,
  toRestInterval,
  toRestPair,
} from './parser'
import { resolveKrakenRestBase } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/market-engine/types'

export async function fetchKrakenCandles(
  pair: string,
  timeframe: string,
  limit: number,
): Promise<Array<Candle>> {
  const interval = toRestInterval(timeframe)
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const restPair = toRestPair(pair)
  const base = resolveKrakenRestBase()

  // Kraken returns max 720 candles (most recent when no `since`)
  const url = `${base}/public/OHLC?pair=${restPair}&interval=${interval}`

  const res = await fetch(url)
  if (!res.ok) {
    assertResponseOk(res, 'Kraken', '', await res.text().catch(() => ''))
  }

  const json = (await res.json()) as {
    error: Array<string>
    result: Record<string, unknown>
  }
  if (json.error?.length > 0) throw new Error(json.error[0])

  // Result keys: Kraken pair name (e.g. "XXBTZUSD") + "last"
  const resultKeys = Object.keys(json.result).filter((k) => k !== 'last')
  if (resultKeys.length === 0) return []

  const rows = json.result[resultKeys[0]] as Array<Array<string | number>>

  const candles: Array<Candle> = []
  for (const row of rows) {
    const c = parseRestCandle(row)
    if (c) candles.push(c)
  }

  // Kraken returns chronological order; take the last N
  const clamped = Math.min(limit, 720)
  return candles.slice(-clamped)
}

/**
 * Fetch bulk 24h quotes for every tradable pair from Kraken REST API.
 * /public/Ticker keys entries by Kraken's internal pair names, so
 * /public/AssetPairs is fetched alongside to resolve each key's wsname
 * ('XBT/USD') into a canonical symbol.
 */
export async function fetchKrakenTickerSnapshot(
  country?: string,
): Promise<BulkTickersResponse> {
  const base = resolveKrakenRestBase()

  const [pairsResp, tickerResp] = await Promise.all([
    fetch(`${base}/public/AssetPairs`),
    fetch(`${base}/public/Ticker`),
  ])
  for (const resp of [pairsResp, tickerResp]) {
    if (!resp.ok) {
      assertResponseOk(
        resp,
        'Kraken',
        country ?? '',
        await resp.text().catch(() => ''),
      )
    }
  }

  const pairsJson = (await pairsResp.json()) as {
    error: Array<string>
    result?: Record<string, { wsname?: string }>
  }
  const tickerJson = (await tickerResp.json()) as {
    error: Array<string>
    result?: Record<string, { c?: Array<string>; o?: string }>
  }
  if (pairsJson.error.length > 0 || tickerJson.error.length > 0) {
    throw new Error(
      `Kraken API error: ${(pairsJson.error[0] ?? tickerJson.error[0]) || ''}`,
    )
  }

  const tickers: Array<BulkTickerEntry> = []
  for (const [key, entry] of Object.entries(tickerJson.result ?? {})) {
    const wsname = pairsJson.result?.[key]?.wsname
    if (!wsname) continue
    const parsed = parseKrakenBulkEntry(wsname, entry)
    if (parsed) tickers.push(parsed)
  }
  return { market: 'kraken', tickers, ts: Date.now() }
}
