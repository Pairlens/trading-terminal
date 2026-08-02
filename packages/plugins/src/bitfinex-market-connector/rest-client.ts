// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex public REST client — candle backfill.
 *
 * GET /v2/candles/trade:{TIMEFRAME}:{SYMBOL}/hist?limit=N&sort=-1
 * Response: [[MTS, OPEN, CLOSE, HIGH, LOW, VOLUME], ...] (newest first)
 *
 * Note: Bitfinex sort=1 returns the oldest N candles from pair inception,
 * NOT the most recent N. Use sort=-1 (default) to get the most recent,
 * then reverse to chronological order.
 */

import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  parseBfxBulkTickerRow,
  parseBfxCandle,
  toBfxSymbol,
  toBfxTimeframe,
} from './parser'
import { resolveBfxUrls } from './regions'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/market-engine/types'

export async function fetchBfxCandles(
  pair: string,
  timeframe: string,
  limit: number,
): Promise<Array<Candle>> {
  const tf = toBfxTimeframe(timeframe)
  if (!tf) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = toBfxSymbol(pair)
  const { restPublicBase } = resolveBfxUrls()
  const count = Math.min(limit, 10000)

  // sort=-1 returns most recent candles first (default Bitfinex behavior)
  const url = `${restPublicBase}/v2/candles/trade:${tf}:${symbol}/hist?limit=${count}&sort=-1`

  const res = await fetch(url)
  if (!res.ok) {
    assertResponseOk(res, 'Bitfinex', '', await res.text().catch(() => ''))
  }

  const json = (await res.json()) as Array<Array<number>>

  if (!Array.isArray(json)) {
    throw new Error('Bitfinex REST: unexpected response format')
  }

  // Reverse to chronological order (oldest first)
  return json.map(parseBfxCandle).reverse()
}

/** Fetch bulk 24h quotes for every trading pair from Bitfinex REST API. */
export async function fetchBfxTickerSnapshot(
  country?: string,
): Promise<BulkTickersResponse> {
  const { restPublicBase } = resolveBfxUrls()
  const url = `${restPublicBase}/v2/tickers?symbols=ALL`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Bitfinex',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as Array<Array<unknown>>
  const tickers = json
    .map(parseBfxBulkTickerRow)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'bitfinex', tickers, ts: Date.now() }
}
