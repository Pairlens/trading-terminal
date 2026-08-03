// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase parser — pair normalization, timeframe mapping, response parsing.
 *
 * Coinbase pairs use the same hyphenated format as Pairlens (e.g. BTC-USDT).
 * Candle granularity uses string enums (ONE_HOUR, not "1h" or 3600).
 * All numeric values in API responses are strings.
 */

import type { Candle } from '@pairlens/shared/types'
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type { TickerSnapshot, Trade } from '@pairlens/market-engine/types'

// ── Pair normalization (Coinbase format matches Pairlens) ──

export function normalizePair(raw: string): string {
  return raw.trim().toUpperCase()
}

// ── Timeframe mapping ──

const TF_TO_GRANULARITY: Record<string, string> = {
  '1m': 'ONE_MINUTE',
  '5m': 'FIVE_MINUTE',
  '15m': 'FIFTEEN_MINUTE',
  '30m': 'THIRTY_MINUTE',
  '1h': 'ONE_HOUR',
  '2h': 'TWO_HOUR',
  '6h': 'SIX_HOUR',
  '1d': 'ONE_DAY',
}

const TF_TO_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '6h': 21600,
  '1d': 86400,
}

export function mapTimeframeToGranularity(tf: string): string | null {
  return TF_TO_GRANULARITY[tf] ?? null
}

export function timeframeToMs(tf: string): number {
  return (TF_TO_SECONDS[tf] ?? 300) * 1000
}

export function timeframeToSeconds(tf: string): number {
  return TF_TO_SECONDS[tf] ?? 300
}

// ── Candle parsing ──

/**
 * Parse a Coinbase REST candle object.
 * Format: { start, low, high, open, close, volume } — all strings.
 * `start` is Unix seconds as a string.
 */
export function parseCoinbaseRestCandle(
  obj: Record<string, string>,
): Candle | null {
  const ts = Number(obj['start'])
  const open = Number(obj['open'])
  const high = Number(obj['high'])
  const low = Number(obj['low'])
  const close = Number(obj['close'])
  const volume = Number(obj['volume'])

  if ([ts, open, high, low, close].some((v) => Number.isNaN(v))) return null

  return {
    ts: ts * 1000, // seconds → milliseconds
    open,
    high,
    low,
    close,
    volume: Number.isNaN(volume) ? 0 : volume,
  }
}

// ── Ticker parsing ──

/**
 * Parse Coinbase WS ticker event into TickerSnapshot.
 * WS ticker includes: price, volume_24_h, high_24_h, low_24_h,
 * price_percent_chg_24_h, best_bid, best_ask.
 */
export function parseCoinbaseTicker(
  data: Record<string, string>,
): TickerSnapshot {
  return {
    last: Number(data['price'] ?? 0),
    bid: Number(data['best_bid'] ?? 0),
    ask: Number(data['best_ask'] ?? 0),
    high24h: Number(data['high_24_h'] ?? 0),
    low24h: Number(data['low_24_h'] ?? 0),
    volume24h: Number(data['volume_24_h'] ?? 0),
    change24h: Number(data['price_percent_chg_24_h'] ?? 0),
    ts: Date.now(),
  }
}

// ── Bulk ticker snapshot parsing ──

/**
 * One product row of /market/products → bulk-quote entry. Coinbase
 * product_ids are already canonical 'BASE-QUOTE'. Returns null for
 * unpriced or disabled products.
 */
export function parseCoinbaseBulkProduct(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = String(data['product_id'] ?? '')
  const price = Number(data['price'] ?? 0)
  if (!symbol || !Number.isFinite(price) || price <= 0) return null
  if (data['is_disabled'] === true || data['trading_disabled'] === true) {
    return null
  }
  return {
    symbol,
    price,
    change24h: Number(data['price_percentage_change_24h'] ?? 0),
  }
}

// ── Trade parsing ──

/**
 * One row of the Advanced Trade `market_trades` channel:
 * `{ trade_id, product_id, price, size, side: 'BUY'|'SELL', time }`
 *
 * COINBASE REPORTS THE MAKER'S SIDE, so this INVERTS it. `side: 'BUY'` means
 * the resting order was a bid, which an incoming sell hit — the aggressor is
 * the SELLER. Coinbase is the only venue in this repo that reports the maker
 * rather than the taker, and it is not documented as such.
 *
 * This is measured, not assumed: correlating 282 live prints against
 * top-of-book gave 11% agreement with the direct reading (252 of them
 * contradicted it), against 100% for the OKX and Binance controls in the same
 * run. `time` is ISO-8601 here rather than the usual epoch-ms.
 */
export function parseCoinbaseTrade(
  data: Record<string, unknown>,
): Trade | null {
  const id = String(data['trade_id'] ?? '')
  const price = Number(data['price'] ?? 0)
  const size = Number(data['size'] ?? 0)
  const rawSide = String(data['side'] ?? '').toUpperCase()
  if (!id) return null
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(size) || size <= 0) return null
  if (rawSide !== 'BUY' && rawSide !== 'SELL') return null
  const ts = Date.parse(String(data['time'] ?? ''))
  return {
    id,
    price,
    size,
    side: rawSide === 'BUY' ? 'sell' : 'buy',
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  }
}
