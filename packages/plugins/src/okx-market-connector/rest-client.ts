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
import { resolveOkxUrls } from './regions'
import type { Candle } from '@pairlens/shared/types'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

/** Fetch historical candles from OKX REST API. */
export async function fetchOkxCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const urls = resolveOkxUrls(country)
  const bar = mapTimeframeToOkxBar(timeframe)
  if (!bar) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const instId = normalizePair(pair)
  // OKX `after` pages backwards: returns records with ts strictly before it.
  const afterParam = endTs !== undefined ? `&after=${endTs}` : ''
  const url = `${urls.restBase}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${Math.min(limit, 300)}${afterParam}`

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
  const urls = resolveOkxUrls(country)
  const instId = normalizePair(pair)
  const url = `${urls.restBase}/api/v5/market/ticker?instId=${instId}`

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
  const urls = resolveOkxUrls(country)
  const url = `${urls.restBase}/api/v5/market/tickers?instType=SPOT`

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
