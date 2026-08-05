// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto.com public REST client — candle backfill.
 *
 * GET public/get-candlestick — default 25 candles, max 300 per request.
 * Response: { "code": 0, "result": { "data": [...], "instrument_name": "..." } }
 */

import { olderThan, pageEndMs } from '@pairlens/market-engine/candle-paging'
import { sortCandlesAscending } from '@pairlens/market-engine/candle-buffer'
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  parseCryptocomBulkTickerRow,
  parseCryptocomCandle,
  toCryptocomSymbol,
  toCryptocomTimeframe,
} from './parser'
import { resolveCryptocomRestBase } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/market-engine/types'

export async function fetchCryptocomCandles(
  pair: string,
  timeframe: string,
  limit: number,
  paper = false,
  endTs?: number,
): Promise<Array<Candle>> {
  const tf = toCryptocomTimeframe(timeframe)
  if (!tf) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const instrument = toCryptocomSymbol(pair)
  const base = resolveCryptocomRestBase(paper)
  const count = Math.min(limit, 300)

  const endParam = endTs === undefined ? '' : `&end_ts=${pageEndMs(endTs)}`
  const url = `${base}/exchange/v1/public/get-candlestick?instrument_name=${instrument}&timeframe=${tf}&count=${count}${endParam}`

  const res = await fetch(url)
  if (!res.ok) {
    assertResponseOk(res, 'Crypto.com', '', await res.text().catch(() => ''))
  }

  const json = (await res.json()) as {
    code: number
    result?: {
      data?: Array<{
        t: number
        o: number | string
        h: number | string
        l: number | string
        c: number | string
        v: number | string
      }>
    }
    message?: string
  }

  if (json.code !== 0 || !json.result?.data) {
    throw new Error(json.message ?? 'Crypto.com REST error')
  }

  // Normalize to ascending regardless of the API's current ordering.
  return olderThan(
    sortCandlesAscending(json.result.data.map(parseCryptocomCandle)),
    endTs,
  )
}

/** Fetch bulk 24h quotes for every spot instrument from Crypto.com REST API. */
export async function fetchCryptocomTickerSnapshot(
  country?: string,
): Promise<BulkTickersResponse> {
  const base = resolveCryptocomRestBase(false)
  const url = `${base}/exchange/v1/public/get-tickers`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Crypto.com',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as {
    code: number
    result?: { data?: Array<Record<string, unknown>> }
  }
  if (json.code !== 0) throw new Error(`Crypto.com API error: ${json.code}`)

  const tickers = (json.result?.data ?? [])
    .map(parseCryptocomBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'cryptocom', tickers, ts: Date.now() }
}
