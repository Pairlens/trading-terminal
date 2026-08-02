// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitget REST client — public market data endpoints (no auth required).
 *
 * Candle data returns arrays: [ts, open, high, low, close, baseVol, quoteVol, usdtVol]
 * All values are strings. Candles returned in descending order — reversed here.
 */

import { sortCandlesAscending } from '@pairlens/market-engine/candle-buffer'
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToRestGranularity,
  normalizePair,
  parseBitgetBulkTickerRow,
  parseBitgetCandle,
} from './parser'
import { resolveBitgetRestBase } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'

/**
 * Fetch historical candles from Bitget REST API.
 * Returns candles in chronological order (oldest first).
 */
export async function fetchBitgetCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country?: string,
): Promise<Array<Candle>> {
  const restBase = resolveBitgetRestBase()
  const symbol = normalizePair(pair)
  const granularity = mapTimeframeToRestGranularity(timeframe)
  if (!granularity) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const clampedLimit = Math.min(limit, 1000)
  const url = `${restBase}/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${clampedLimit}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Bitget',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as {
    code?: string
    data?: Array<Array<string>>
  }
  if (json.code !== '00000' || !json.data) return []

  const candles: Array<Candle> = []
  for (const row of json.data) {
    const parsed = parseBitgetCandle(row)
    if (parsed) candles.push(parsed)
  }

  // Normalize to ascending regardless of the API's current ordering — the
  // exchange has flipped this and may again. See sortCandlesAscending.
  return sortCandlesAscending(candles).slice(-limit)
}

/**
 * Fetch orderbook depth from Bitget REST API.
 */
export async function fetchBitgetDepth(
  pair: string,
  limit = 50,
  country?: string,
): Promise<{
  bids: Array<[string, string]>
  asks: Array<[string, string]>
}> {
  const restBase = resolveBitgetRestBase()
  const symbol = normalizePair(pair)

  const url = `${restBase}/market/orderbook?symbol=${symbol}&limit=${Math.min(limit, 150)}`
  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Bitget',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as {
    code?: string
    data?: {
      asks?: Array<[string, string]>
      bids?: Array<[string, string]>
    }
  }
  if (json.code !== '00000' || !json.data) return { bids: [], asks: [] }

  return {
    bids: json.data.bids ?? [],
    asks: json.data.asks ?? [],
  }
}

/** Fetch bulk 24h quotes for every spot pair from Bitget REST API. */
export async function fetchBitgetTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const restBase = resolveBitgetRestBase()
  const url = `${restBase}/market/tickers`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'Bitget', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    code: string
    data?: Array<Record<string, unknown>>
  }
  if (json.code !== '00000') throw new Error(`Bitget API error: ${json.code}`)

  const tickers = (json.data ?? [])
    .map(parseBitgetBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'bitget', tickers, ts: Date.now() }
}
