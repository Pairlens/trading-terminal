// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * HTX public REST client — candle backfill.
 *
 * GET /market/history/kline — max 2000 candles, chronological order.
 * Response envelope: { "status": "ok", "data": [...] }
 */

import { olderThan } from '@pairlens/market-engine/candle-paging'
import { sortCandlesAscending } from '@pairlens/market-engine/candle-buffer'
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  parseHtxBulkTickerRow,
  parseHtxCandle,
  toHtxPeriod,
  toHtxSymbol,
} from './parser'
import { resolveHtxRestBase } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/market-engine/types'

export async function fetchHtxCandles(
  pair: string,
  timeframe: string,
  limit: number,
  endTs?: number,
): Promise<Array<Candle>> {
  const period = toHtxPeriod(timeframe)
  if (!period) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = toHtxSymbol(pair)
  const base = resolveHtxRestBase()
  // HTX offers no time cursor here, only `size`. Paging therefore means
  // pulling the widest window the venue allows and slicing older bars out of
  // it: good for roughly 2000 bars back, then genuinely exhausted. The chart
  // treats an empty page as end-of-history, which is the honest answer.
  const size = endTs === undefined ? Math.min(limit, 2000) : 2000

  const url = `${base}/market/history/kline?symbol=${symbol}&period=${period}&size=${size}`

  const res = await fetch(url)
  if (!res.ok) {
    assertResponseOk(res, 'HTX', '', await res.text().catch(() => ''))
  }

  const json = (await res.json()) as {
    status: string
    data?: Array<{
      id: number
      open: number
      high: number
      low: number
      close: number
      amount: number
    }>
    'err-code'?: string
    'err-msg'?: string
  }

  if (json.status !== 'ok' || !json.data) {
    throw new Error(json['err-msg'] ?? 'HTX REST error')
  }

  // HTX returns newest-first; normalize to ascending (order-assumption-free).
  return olderThan(
    sortCandlesAscending(json.data.map(parseHtxCandle)),
    endTs,
  ).slice(-limit)
}

/** Fetch bulk 24h quotes for every listed symbol from HTX REST API. */
export async function fetchHtxTickerSnapshot(
  country?: string,
): Promise<BulkTickersResponse> {
  const base = resolveHtxRestBase()
  const url = `${base}/market/tickers`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'HTX',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as {
    status?: string
    data?: Array<Record<string, unknown>>
  }
  if (json.status && json.status !== 'ok') {
    throw new Error(`HTX API error: ${json.status}`)
  }

  const tickers = (json.data ?? [])
    .map(parseHtxBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'htx', tickers, ts: Date.now() }
}
