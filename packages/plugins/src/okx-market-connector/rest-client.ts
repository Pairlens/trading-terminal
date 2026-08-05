// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToOkxBar,
  normalizePair,
  parseOkxBulkTickerRow,
  parseOkxCandleRow,
  parseOkxTicker,
} from './parser'
import { resolveOkxPublicRestBase } from './regions'
import type { Candle } from '@pairlens/shared/types'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

/**
 * Fetch historical candles from OKX REST API.
 *
 * OKX splits candle history across two endpoints, and picking the wrong one
 * silently truncates the chart:
 *
 * - `/market/candles` serves only the most recent ~1440 bars per timeframe.
 *   Page past that and it returns an empty array with `code: "0"` — a success,
 *   not an error. The terminal's pan-left backfill reads an empty page as
 *   "this connector has no older data" and latches `exhausted`, so OKX charts
 *   dead-ended at ~1440 bars against a 5000-bar budget.
 * - `/market/history-candles` covers the deep archive and is a strict superset:
 *   measured identical to `/market/candles` at the head (same rows, same
 *   `confirm` flag on the forming bar) and it keeps paging exactly where the
 *   other runs dry.
 *
 * So the first page (no `endTs`) stays on the recent endpoint and every paged
 * read goes to the history one.
 */
export async function fetchOkxCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const restBase = resolveOkxPublicRestBase(country)
  const bar = mapTimeframeToOkxBar(timeframe)
  if (!bar) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const instId = normalizePair(pair)
  // OKX `after` pages backwards: returns records with ts strictly before it.
  const paging = endTs !== undefined
  const afterParam = paging ? `&after=${endTs}` : ''
  const endpoint = paging ? 'history-candles' : 'candles'
  const url = `${restBase}/api/v5/market/${endpoint}?instId=${instId}&bar=${bar}&limit=${Math.min(limit, 300)}${afterParam}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'OKX', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    code: string
    data: Array<Array<unknown>>
  }
  if (json.code !== '0') throw new Error(`OKX API error: ${json.code}`)

  const candles: Array<Candle> = []
  for (const row of json.data) {
    const parsed = parseOkxCandleRow(row)
    if (parsed) candles.push(parsed[0])
  }

  // OKX returns newest first, reverse to chronological order
  candles.reverse()
  return candles
}

/** Fetch current ticker from OKX REST API. */
export async function fetchOkxTicker(
  pair: string,
  country: string,
): Promise<TickerSnapshot> {
  const restBase = resolveOkxPublicRestBase(country)
  const instId = normalizePair(pair)
  const url = `${restBase}/api/v5/market/ticker?instId=${instId}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'OKX', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    code: string
    data: Array<Record<string, string>>
  }
  if (json.code !== '0' || !json.data[0])
    throw new Error(`OKX API error: ${json.code}`)

  return parseOkxTicker(json.data[0])
}

/** Fetch bulk 24h quotes for every SPOT pair from OKX REST API. */
export async function fetchOkxTickerSnapshot(
  country: string,
): Promise<BulkTickersResponse> {
  const restBase = resolveOkxPublicRestBase(country)
  const url = `${restBase}/api/v5/market/tickers?instType=SPOT`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(resp, 'OKX', country, await resp.text().catch(() => ''))
  }

  const json = (await resp.json()) as {
    code: string
    data: Array<Record<string, string>>
  }
  if (json.code !== '0') throw new Error(`OKX API error: ${json.code}`)

  const tickers = json.data
    .map(parseOkxBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'okx', tickers, ts: Date.now() }
}
