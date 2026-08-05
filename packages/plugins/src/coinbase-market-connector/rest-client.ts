// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase REST client — public market data endpoints (no auth required).
 *
 * Uses the /market/ prefix for unauthenticated access.
 * Candles are returned in descending order — reversed to chronological.
 */

import { olderThan, pageEndSec } from '@pairlens/market-engine/candle-paging'
import { assertResponseOk } from '@pairlens/market-engine/errors'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToGranularity,
  normalizePair,
  parseCoinbaseBulkProduct,
  parseCoinbaseRestCandle,
  timeframeToSeconds,
} from './parser'
import { resolveCoinbasePublicRest } from './regions'
import type { Candle } from '@pairlens/shared/types'
import type {
  BulkTickerEntry,
  BulkTickersResponse,
} from '@pairlens/shared/instrument-types'

/**
 * Fetch historical candles from Coinbase REST API.
 * Returns candles in chronological order (oldest first).
 */
export async function fetchCoinbaseCandles(
  pair: string,
  timeframe: string,
  limit: number,
  country?: string,
  endTs?: number,
): Promise<Array<Candle>> {
  const restBase = resolveCoinbasePublicRest()
  const productId = normalizePair(pair)
  const granularity = mapTimeframeToGranularity(timeframe)
  if (!granularity) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const tfSec = timeframeToSeconds(timeframe)
  // `end` is inclusive here (measured), so paged reads step back one second
  // and the batch is filtered again below.
  const end =
    endTs === undefined ? Math.floor(Date.now() / 1000) : pageEndSec(endTs)
  const start = end - limit * tfSec

  const url =
    `${restBase}/market/products/${productId}/candles` +
    `?start=${start}&end=${end}&granularity=${granularity}&limit=${Math.min(limit, 350)}`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Coinbase',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as {
    candles?: Array<Record<string, string>>
  }
  if (!json.candles) return []

  const candles: Array<Candle> = []
  for (const obj of json.candles) {
    const parsed = parseCoinbaseRestCandle(obj)
    if (parsed) candles.push(parsed)
  }

  // Coinbase returns descending order — reverse to chronological
  candles.reverse()

  return olderThan(candles, endTs).slice(-limit)
}

/**
 * Fetch current price for a product.
 * Used internally for market buy quote-size conversion.
 */
export async function fetchCoinbasePrice(pair: string): Promise<number> {
  const restBase = resolveCoinbasePublicRest()
  const productId = normalizePair(pair)

  const resp = await fetch(`${restBase}/market/products/${productId}`)
  if (!resp.ok) return 0

  const json = (await resp.json()) as Record<string, string>
  return Number(json['price'] ?? 0)
}

/**
 * Fetch orderbook depth from Coinbase REST API.
 * Used as initial snapshot before WS level2 takes over.
 */
export async function fetchCoinbaseDepth(
  pair: string,
  limit = 200,
  country?: string,
): Promise<{
  bids: Array<[string, string]>
  asks: Array<[string, string]>
}> {
  const restBase = resolveCoinbasePublicRest()
  const productId = normalizePair(pair)

  const url = `${restBase}/market/product_book?product_id=${productId}&limit=${Math.min(limit, 500)}`
  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Coinbase',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as {
    pricebook?: {
      bids?: Array<{ price: string; size: string }>
      asks?: Array<{ price: string; size: string }>
    }
  }

  const bids: Array<[string, string]> = (json.pricebook?.bids ?? []).map(
    (b) => [b.price, b.size],
  )
  const asks: Array<[string, string]> = (json.pricebook?.asks ?? []).map(
    (a) => [a.price, a.size],
  )

  return { bids, asks }
}

/** Fetch bulk 24h quotes for every SPOT product from Coinbase REST API. */
export async function fetchCoinbaseTickerSnapshot(
  country?: string,
): Promise<BulkTickersResponse> {
  const restBase = resolveCoinbasePublicRest()
  const url = `${restBase}/market/products?product_type=SPOT`

  const resp = await fetch(url)
  if (!resp.ok) {
    assertResponseOk(
      resp,
      'Coinbase',
      country ?? '',
      await resp.text().catch(() => ''),
    )
  }

  const json = (await resp.json()) as {
    products?: Array<Record<string, unknown>>
  }
  const tickers = (json.products ?? [])
    .map(parseCoinbaseBulkProduct)
    .filter((t): t is BulkTickerEntry => t !== null)
  return { market: 'coinbase', tickers, ts: Date.now() }
}
