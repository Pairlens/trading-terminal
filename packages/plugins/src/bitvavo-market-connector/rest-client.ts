// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo public REST client — candle backfill.
 *
 * GET /v2/{market}/candles?interval=&limit=&end=
 * - Returns up to 1440 rows, NEWEST-FIRST: [[ts(ms), o, h, l, c, v], ...].
 * - `end` (epoch ms, inclusive) pages further back for pan-left/replay.
 *
 * No auth required. Response is a bare JSON array; errors arrive as a JSON
 * object `{ errorCode, error }` with a non-2xx status.
 */

import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { parseBitvavoCandle, toInterval, toMarket } from './parser'
import { resolveBitvavoRestBase } from './regions'
import type { Candle } from '@pairlens/market-engine/types'

const MAX_LIMIT = 1440

export async function fetchBitvavoCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const interval = toInterval(timeframe)
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const market = toMarket(pair)
  const clamped = Math.min(Math.max(1, limit), MAX_LIMIT)

  const params = new URLSearchParams({
    interval,
    limit: String(clamped),
  })
  // `end` is inclusive; subtract 1ms so backfill pages strictly OLDER candles
  // and never re-fetches the boundary bar already held.
  if (typeof endTs === 'number' && Number.isFinite(endTs)) {
    params.set('end', String(Math.max(0, Math.floor(endTs) - 1)))
  }

  const base = resolveBitvavoRestBase()
  const url = `${base}/v2/${market}/candles?${params.toString()}`

  const res = await fetch(url)
  if (!res.ok) {
    assertResponseOk(res, 'Bitvavo', country, await res.text().catch(() => ''))
  }

  const rows = (await res.json()) as Array<Array<string | number>>
  if (!Array.isArray(rows)) return []

  const candles: Array<Candle> = []
  for (const row of rows) {
    const c = parseBitvavoCandle(row)
    if (c) candles.push(c)
  }

  // Bitvavo returns newest-first; the buffer/chart expect chronological order.
  candles.sort((a, b) => a.ts - b.ts)
  return candles
}
