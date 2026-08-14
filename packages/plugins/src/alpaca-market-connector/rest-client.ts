// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { olderThan, pageEndMs } from '@pairlens/market-engine/candle-paging'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import {
  mapTimeframeToAlpacaInterval,
  parseAlpacaBar,
  parseAlpacaQuoteBook,
  parseAlpacaSnapshot,
  toAlpacaSymbol,
  toPairKey,
} from './parser'
import { ALPACA_DATA_REST } from './regions'
import type { Candle } from '@pairlens/shared/types'
import type {
  OrderbookLevel,
  TickerSnapshot,
} from '@pairlens/market-engine/types'

export type AlpacaCredentials = {
  apiKey: string
  apiSecret: string
}

// Unlike CEX market data, ALL Alpaca market-data endpoints require API keys
// (free paper keys are entitled to the IEX feed). Callers must pass the
// credentials of any configured Alpaca account; the connector surfaces a
// clear error when none exists.
export function alpacaDataHeaders(
  credentials: AlpacaCredentials,
): Record<string, string> {
  return {
    'APCA-API-KEY-ID': credentials.apiKey,
    'APCA-API-SECRET-KEY': credentials.apiSecret,
  }
}

export function missingCredentialsError(): Error {
  return new Error(
    'Alpaca market data requires an API key. Connect an Alpaca account (free paper keys work) in Accounts.',
  )
}

/**
 * Fetch historical candles from the Alpaca Market Data API.
 *
 * Uses `sort=desc` + `limit` so the most recent N bars come back regardless
 * of session gaps (nights, weekends, holidays) — a fixed `start` window
 * would under-fetch intraday timeframes. `feed=iex` matches the free-plan WS
 * feed so history and live bars come from the same tape.
 */
export async function fetchAlpacaCandles(
  pair: string,
  timeframe: string,
  limit: number,
  credentials: AlpacaCredentials,
  endTs?: number,
): Promise<Array<Candle>> {
  const interval = mapTimeframeToAlpacaInterval(timeframe)
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

  const symbol = toAlpacaSymbol(pair)
  const capped = Math.min(limit, 1000)
  // With sort=desc the newest bars come back first, so the start bound only
  // needs to be generously early: a year covers any intraday limit given
  // ~6.5 trading hours/day, and daily/weekly bars reach back to Alpaca's
  // 2016 data horizon.
  const start =
    timeframe === '1w' || timeframe === '1d'
      ? '2016-01-01'
      : new Date(Date.now() - 365 * 86_400_000).toISOString()

  // `end` bounds the newest bar returned; with sort=desc that is exactly the
  // pan-left cursor. RFC-3339, and exclusive by way of the millisecond step.
  const endParam =
    endTs === undefined
      ? ''
      : `&end=${encodeURIComponent(new Date(pageEndMs(endTs)).toISOString())}`

  const url =
    `${ALPACA_DATA_REST}/v2/stocks/${encodeURIComponent(symbol)}/bars` +
    `?timeframe=${interval}&limit=${capped}&sort=desc&feed=iex&adjustment=split&start=${encodeURIComponent(start)}${endParam}`

  const resp = await fetch(url, { headers: alpacaDataHeaders(credentials) })
  if (!resp.ok) {
    throw new Error(`Alpaca bars error ${resp.status}: ${await resp.text()}`)
  }

  const json = (await resp.json()) as { bars?: Array<unknown> }

  const candles: Array<Candle> = []
  for (const row of json.bars ?? []) {
    const parsed = parseAlpacaBar(row)
    if (parsed) candles.push(parsed)
  }

  // sort=desc returns newest first — flip to chronological order.
  candles.reverse()
  return olderThan(candles, endTs)
}

/** Fetch a ticker snapshot (last, bid/ask, session stats) for one symbol. */
export async function fetchAlpacaSnapshot(
  pair: string,
  credentials: AlpacaCredentials,
): Promise<TickerSnapshot> {
  const symbol = toAlpacaSymbol(pair)
  const url = `${ALPACA_DATA_REST}/v2/stocks/snapshots?symbols=${encodeURIComponent(symbol)}&feed=iex`

  const resp = await fetch(url, { headers: alpacaDataHeaders(credentials) })
  if (!resp.ok) {
    throw new Error(
      `Alpaca snapshot error ${resp.status}: ${await resp.text()}`,
    )
  }

  const json = (await resp.json()) as Record<string, unknown>
  const snapshot = parseAlpacaSnapshot(json[symbol])
  if (!snapshot) {
    throw new Error(`Alpaca snapshot: no data for ${symbol}`)
  }
  return snapshot
}

/**
 * Top-of-book bid/ask WITH sizes for one symbol.
 *
 * Separate from `fetchAlpacaSnapshot` because `TickerSnapshot` carries only
 * prices, and seeding the order book from it would report every level as size
 * zero — a book that looks broken rather than thin. The IEX feed is
 * top-of-book only, so this is one level per side by construction.
 */
export async function fetchAlpacaQuoteBook(
  pair: string,
  credentials: AlpacaCredentials,
): Promise<{
  bids: Array<OrderbookLevel>
  asks: Array<OrderbookLevel>
  ts: number
} | null> {
  const symbol = toAlpacaSymbol(pair)
  const url = `${ALPACA_DATA_REST}/v2/stocks/snapshots?symbols=${encodeURIComponent(symbol)}&feed=iex`

  const resp = await fetch(url, { headers: alpacaDataHeaders(credentials) })
  if (!resp.ok) return null

  const json = (await resp.json()) as Record<
    string,
    Record<string, unknown> | undefined
  >
  return parseAlpacaQuoteBook(json[symbol]?.['latestQuote'])
}

/**
 * One bulk quote snapshot for the whole bundled stock catalog, shaped for the
 * `market-data:ticker-snapshot` capability that feeds the watchlist and the
 * discovery surfaces.
 *
 * A CEX answers this from a single "all tickers" endpoint; Alpaca's snapshots
 * route wants an explicit symbol list, so the catalog supplies it. Symbols the
 * feed has no data for are dropped rather than reported at zero.
 */
export async function fetchAlpacaBulkTickers(
  symbols: Array<string>,
  credentials: AlpacaCredentials,
): Promise<Array<{ symbol: string; price: number; change24h: number }>> {
  if (symbols.length === 0) return []

  const url =
    `${ALPACA_DATA_REST}/v2/stocks/snapshots` +
    `?symbols=${encodeURIComponent(symbols.join(','))}&feed=iex`

  const resp = await fetch(url, { headers: alpacaDataHeaders(credentials) })
  if (!resp.ok) {
    throw new Error(`Alpaca snapshots error ${resp.status}`)
  }

  const json = (await resp.json()) as Record<string, unknown>
  const out: Array<{ symbol: string; price: number; change24h: number }> = []
  for (const symbol of symbols) {
    const snapshot = parseAlpacaSnapshot(json[symbol])
    if (!snapshot || snapshot.last <= 0) continue
    out.push({
      symbol: toPairKey(symbol),
      price: snapshot.last,
      change24h: snapshot.change24h,
    })
  }
  return out
}
