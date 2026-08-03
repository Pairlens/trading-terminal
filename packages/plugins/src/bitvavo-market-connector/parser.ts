// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo pair normalization, timeframe mapping, and wire-format parsers.
 *
 * Pair format:
 * - Pairlens:  "BTC-EUR"
 * - Bitvavo:   "BTC-EUR"  (identical — hyphenated, upper-case)
 *
 * So normalization is just an upper-case pass; there is no separator swap.
 *
 * Numeric quirks:
 * - Candle rows carry a numeric epoch-ms timestamp followed by string OHLCV.
 * - Ticker/book values are all strings.
 * - ticker24h exposes no percent field, so 24h change is derived from the
 *   window open vs. last: (last - open) / open * 100.
 */

import type {
  Candle,
  TickerSnapshot,
  Trade,
} from '@pairlens/market-engine/types'

// ── Pair normalization (Bitvavo format matches Pairlens) ──

/** Pairlens "BTC-EUR" → Bitvavo "BTC-EUR" (upper-case, unchanged separator). */
export function toMarket(pair: string): string {
  return pair.trim().toUpperCase()
}

/** Bitvavo "BTC-EUR" → Pairlens "BTC-EUR". */
export function fromMarket(market: string): string {
  return market.trim().toUpperCase()
}

// ── Timeframe mapping ──

const TF_TO_INTERVAL: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '6h': '6h',
  '8h': '8h',
  '12h': '12h',
  '1d': '1d',
}

/** Pairlens timeframe → Bitvavo interval string (or undefined if unsupported). */
export function toInterval(tf: string): string | undefined {
  return TF_TO_INTERVAL[tf]
}

/** Bitvavo interval string → Pairlens timeframe. */
export function fromInterval(interval: string): string | undefined {
  return TF_TO_INTERVAL[interval] ? interval : undefined
}

// ── Data parsers ──

/**
 * Parse a Bitvavo candle row: [timestamp, open, high, low, close, volume].
 * `timestamp` is epoch milliseconds (numeric); OHLCV are strings. This shape
 * is shared by the REST /candles response and the WS `candle` event payload.
 */
export function parseBitvavoCandle(row: Array<string | number>): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null
  const ts = Number(row[0])
  const open = Number(row[1])
  const high = Number(row[2])
  const low = Number(row[3])
  const close = Number(row[4])
  const volume = Number(row[5])
  if ([ts, open, high, low, close].some((v) => Number.isNaN(v))) return null
  return {
    ts,
    open,
    high,
    low,
    close,
    volume: Number.isNaN(volume) ? 0 : volume,
  }
}

/**
 * Parse a Bitvavo ticker24h item into a TickerSnapshot.
 * change24h is derived as a PERCENT from the 24h window open vs. last.
 */
export function parseBitvavoTicker(data: {
  open?: string | number
  high?: string | number
  low?: string | number
  last?: string | number
  volume?: string | number
  bid?: string | number
  ask?: string | number
  timestamp?: string | number
}): TickerSnapshot {
  const open = Number(data.open ?? 0)
  const last = Number(data.last ?? 0)
  const change24h = open !== 0 ? ((last - open) / open) * 100 : 0
  return {
    last,
    bid: Number(data.bid ?? 0),
    ask: Number(data.ask ?? 0),
    high24h: Number(data.high ?? 0),
    low24h: Number(data.low ?? 0),
    volume24h: Number(data.volume ?? 0),
    change24h,
    ts: data.timestamp ? Number(data.timestamp) : Date.now(),
  }
}

/**
 * Parse Bitvavo book levels: [["price","amount"], ...] → [[price, size], ...].
 * A level with amount "0" is a removal and is preserved as [price, 0] so the
 * caller can delete it from its local book.
 */
export function parseBitvavoBookLevels(
  levels: Array<[string, string]> | undefined,
): Array<[number, number]> {
  if (!levels) return []
  const out: Array<[number, number]> = []
  for (const level of levels) {
    const price = Number(level[0])
    const size = Number(level[1])
    if (Number.isNaN(price) || Number.isNaN(size)) continue
    out.push([price, size])
  }
  return out
}

// ── Trade parsing ──

/**
 * A Bitvavo `trades` event:
 * `{ id, amount, price, timestamp, market, side: 'buy'|'sell' }`
 *
 * One execution per event, and `side` is documented as the taker's side; the
 * live cross-check against top-of-book agrees.
 */
export function parseBitvavoTrade(data: Record<string, unknown>): Trade | null {
  const id = String(data['id'] ?? '')
  const price = Number(data['price'] ?? 0)
  const size = Number(data['amount'] ?? 0)
  const side = String(data['side'] ?? '')
  if (!id) return null
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(size) || size <= 0) return null
  if (side !== 'buy' && side !== 'sell') return null
  const ts = Number(data['timestamp'] ?? 0)
  return {
    id,
    price,
    size,
    side,
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  }
}
