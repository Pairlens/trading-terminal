// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Normalize a pair string to KuCoin format (uppercase, dashes). */
export function normalizePair(raw: string): string {
  return raw.trim().toUpperCase()
}

// ── Timeframe mapping ──

const TF_TO_KUCOIN: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1hour',
  '2h': '2hour',
  '4h': '4hour',
  '1d': '1day',
  '1w': '1week',
  // KuCoin has no 3-day type — '3d' stays unmapped (unsupported).
  '1M': '1month',
}

const KUCOIN_TYPE_TO_TF: Record<string, string> = {
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '1hour': '1h',
  '2hour': '2h',
  '4hour': '4h',
  '1day': '1d',
  '1week': '1w',
  '1month': '1M',
}

export function mapTimeframeToKucoinType(tf: string): string | null {
  return TF_TO_KUCOIN[tf] ?? null
}

export function mapKucoinTypeToTimeframe(kucoinType: string): string | null {
  return KUCOIN_TYPE_TO_TF[kucoinType] ?? null
}

// ── Candle parsing ──

/**
 * Parse a KuCoin REST candle row.
 * KuCoin OCHL order: [time_seconds, open, CLOSE, high, low, volume, amount]
 * Note: Close is index 2, NOT index 4!
 */
export function parseKucoinRestKline(row: Array<unknown>): Candle | null {
  if (row.length < 6) return null

  const ts = parseNum(row[0])
  const open = parseNum(row[1])
  const close = parseNum(row[2]) // OCHL — close is index 2
  const high = parseNum(row[3])
  const low = parseNum(row[4])
  const volume = parseNum(row[5])

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
 * Parse a KuCoin WS candle array.
 * Same OCHL format as REST: [time_seconds, open, close, high, low, volume, amount]
 */
export function parseKucoinWsKline(candles: Array<unknown>): Candle | null {
  if (candles.length < 6) return null

  const ts = parseNum(candles[0])
  const open = parseNum(candles[1])
  const close = parseNum(candles[2]) // OCHL — close is index 2
  const high = parseNum(candles[3])
  const low = parseNum(candles[4])
  const volume = parseNum(candles[5])

  if ([ts, open, close, high, low, volume].some((v) => v === null)) return null

  return {
    ts: ts! * 1000, // WS candle timestamps are in seconds
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
  }
}

// ── Ticker / Stats parsing ──

/** Parse KuCoin 24h stats (from REST /api/v1/market/stats) into a TickerSnapshot. */
export function parseKucoinStats(data: Record<string, string>): TickerSnapshot {
  const last = Number(data['last'] ?? 0)
  const changeRate = Number(data['changeRate'] ?? 0)

  return {
    last,
    bid: Number(data['buy'] ?? 0),
    ask: Number(data['sell'] ?? 0),
    high24h: Number(data['high'] ?? 0),
    low24h: Number(data['low'] ?? 0),
    volume24h: Number(data['vol'] ?? 0),
    change24h: changeRate * 100,
    ts: Number(data['time'] ?? Date.now()),
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
 * One row of /api/v1/market/allTickers → bulk-quote entry. KuCoin symbols
 * are already canonical 'BASE-USDT'; `changeRate` is a fraction.
 */
export function parseKucoinBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = String(data['symbol'] ?? '')
  if (!symbol.includes('-')) return null
  const price = Number(data['last'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return { symbol, price, change24h: Number(data['changeRate'] ?? 0) * 100 }
}
