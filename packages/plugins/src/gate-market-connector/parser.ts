// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'
import type { TickerSnapshot, Trade } from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Normalize a pair string to Gate.io format: `BTC_USDT` (uppercase, underscore). */
export function normalizePair(raw: string): string {
  return raw.trim().replace(/[-]/g, '_').toUpperCase()
}

/** Denormalize a Gate.io pair back to display format: `BTC-USDT`. */
export function denormalizePair(symbol: string): string {
  return symbol.replace(/_/g, '-')
}

// ── Timeframe mapping ──

const TF_TO_GATE: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '7d',
  // Gate has no 3-day interval — '3d' stays unmapped (unsupported).
  '1M': '30d',
}

const GATE_TO_TF: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '7d': '1w',
  '30d': '1M',
}

export function mapTimeframeToGateInterval(tf: string): string | null {
  return TF_TO_GATE[tf] ?? null
}

export function mapGateIntervalToTimeframe(interval: string): string | null {
  return GATE_TO_TF[interval] ?? null
}

// ── Candle parsing ──

/**
 * Parse a Gate.io REST candle row (string array).
 *
 * CRITICAL: Gate.io candle array order is NON-STANDARD:
 *   [t, quote_vol, CLOSE, high, low, OPEN, base_vol, closed]
 *
 * Index 2 is CLOSE, index 5 is OPEN!
 */
export function parseGateRestKline(row: Array<unknown>): Candle | null {
  if (row.length < 7) return null

  const ts = parseNum(row[0])
  const close = parseNum(row[2]) // index 2 = close
  const high = parseNum(row[3])
  const low = parseNum(row[4])
  const open = parseNum(row[5]) // index 5 = open
  const volume = parseNum(row[6]) // index 6 = base_vol

  if ([ts, open, close, high, low, volume].some((v) => v === null)) return null

  return {
    ts: ts! * 1000, // REST timestamps are in seconds
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
  }
}

/**
 * Parse a Gate.io WS candle update.
 *
 * WS candle fields: { t, o, c, h, l, a (base_vol), v (quote_vol), n (name), w (closed_bool) }
 * Returns [Candle, isClosed].
 */
export function parseGateWsKline(
  data: Record<string, unknown>,
): [Candle, boolean] | null {
  const ts = parseNum(data['t'])
  const open = parseNum(data['o'])
  const close = parseNum(data['c'])
  const high = parseNum(data['h'])
  const low = parseNum(data['l'])
  const volume = parseNum(data['a']) // base volume

  if ([ts, open, close, high, low, volume].some((v) => v === null)) return null

  // `w` is a boolean string or boolean — true means candle is closed
  const isClosed = data['w'] === true || data['w'] === 'true'

  return [
    {
      ts: ts! * 1000, // WS timestamps are in seconds
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: volume!,
    },
    isClosed,
  ]
}

// ── Ticker parsing ──

/**
 * Parse a Gate.io ticker response into a TickerSnapshot.
 *
 * Works for both REST (array element) and WS ticker updates.
 * Gate.io ticker includes full 24h data.
 */
export function parseGateTicker(data: Record<string, unknown>): TickerSnapshot {
  const last = Number(data['last'] ?? 0)
  const changePercent = Number(data['change_percentage'] ?? 0)

  return {
    last,
    bid: Number(data['highest_bid'] ?? 0),
    ask: Number(data['lowest_ask'] ?? 0),
    high24h: Number(data['high_24h'] ?? 0),
    low24h: Number(data['low_24h'] ?? 0),
    volume24h: Number(data['base_volume'] ?? 0),
    change24h: changePercent,
    ts: Date.now(),
  }
}

// ── Utils ──

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

// ── Bulk ticker snapshot parsing ──

/**
 * One row of /api/v4/spot/tickers → bulk-quote entry. Gate pairs are
 * underscored ('BTC_USDT'); `change_percentage` is already in percent.
 */
export function parseGateBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const pair = String(data['currency_pair'] ?? '')
  if (!pair.includes('_')) return null
  const price = Number(data['last'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    symbol: pair.replace(/_/g, '-'),
    price,
    change24h: Number(data['change_percentage'] ?? 0),
  }
}

// ── Trade parsing ──

/**
 * One `spot.trades` result:
 * `{ id, create_time_ms, side: 'buy'|'sell', amount, price }`
 *
 * Gate emits one execution per frame (not a batch) and documents `side` as
 * the taker's side; the live cross-check against top-of-book agrees.
 * `create_time_ms` arrives as a fractional-millisecond STRING.
 */
export function parseGateTrade(data: Record<string, unknown>): Trade | null {
  const id = data['id']
  const price = Number(data['price'] ?? 0)
  const size = Number(data['amount'] ?? 0)
  const side = String(data['side'] ?? '')
  if (id === undefined || id === null || id === '') return null
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(size) || size <= 0) return null
  if (side !== 'buy' && side !== 'sell') return null
  const ts = Math.trunc(Number(data['create_time_ms'] ?? 0))
  return {
    id: String(id),
    price,
    size,
    side,
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  }
}
