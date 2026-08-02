// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
/**
 * Upbit pair normalization, timeframe mapping, and data parsers.
 *
 * CRITICAL: Upbit uses QUOTE-BASE format (reversed from standard):
 *   Upbit "USDT-BTC" = Pairlens "BTC-USDT"
 *
 * Candle fields use named JSON fields (not arrays):
 *   opening_price, high_price, low_price, trade_price (close), candle_acc_trade_volume
 */

import type { Candle, TickerSnapshot } from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Pairlens "BTC-USDT" → Upbit "USDT-BTC" (reversed) */
export function toUpbitCode(pair: string): string {
  const [base, quote] = pair.split('-')
  if (!base || !quote) return pair
  return `${quote}-${base}`
}

/** Upbit "USDT-BTC" → Pairlens "BTC-USDT" (reversed) */
export function fromUpbitCode(code: string): string {
  const [quote, base] = code.split('-')
  if (!quote || !base) return code
  return `${base}-${quote}`
}

// ── Timeframe mapping ──

// Upbit WS candle types: candle.1s, candle.1m, candle.3m, candle.5m,
// candle.10m, candle.15m, candle.30m, candle.60m, candle.240m
// REST: /v1/candles/minutes/{unit} where unit = 1, 3, 5, 10, 15, 30, 60, 240
// REST: /v1/candles/days for daily

const TF_TO_WS: Record<string, string> = {
  '1m': 'candle.1m',
  '5m': 'candle.5m',
  '15m': 'candle.15m',
  '30m': 'candle.30m',
  '1h': 'candle.60m',
  '4h': 'candle.240m',
}

const TF_TO_REST: Record<string, { path: string; unit?: number }> = {
  '1m': { path: '/v1/candles/minutes/1', unit: 1 },
  '5m': { path: '/v1/candles/minutes/5', unit: 5 },
  '15m': { path: '/v1/candles/minutes/15', unit: 15 },
  '30m': { path: '/v1/candles/minutes/30', unit: 30 },
  '1h': { path: '/v1/candles/minutes/60', unit: 60 },
  '4h': { path: '/v1/candles/minutes/240', unit: 240 },
  '1d': { path: '/v1/candles/days' },
  '1w': { path: '/v1/candles/weeks' },
  // Upbit has no 3-day candles — '3d' stays unmapped (unsupported).
  '1M': { path: '/v1/candles/months' },
}

/** Pairlens timeframe → Upbit WS candle type. */
export function toUpbitWsCandle(tf: string): string | undefined {
  return TF_TO_WS[tf]
}

/** Pairlens timeframe → Upbit REST candle path. */
export function toUpbitRestCandle(
  tf: string,
): { path: string; unit?: number } | undefined {
  return TF_TO_REST[tf]
}

// ── Data parsers ──

/** Parse Upbit REST/WS candle object. */
export function parseUpbitCandle(c: {
  candle_date_time_utc?: string
  timestamp?: number
  opening_price: number
  high_price: number
  low_price: number
  trade_price: number
  candle_acc_trade_volume: number
}): Candle {
  const ts = c.candle_date_time_utc
    ? new Date(c.candle_date_time_utc + 'Z').getTime()
    : (c.timestamp ?? Date.now())
  return {
    ts,
    open: c.opening_price,
    high: c.high_price,
    low: c.low_price,
    close: c.trade_price,
    volume: c.candle_acc_trade_volume,
  }
}

/** Parse Upbit ticker object (REST or WS DEFAULT format). */
export function parseUpbitTicker(t: {
  trade_price: number
  opening_price: number
  high_price: number
  low_price: number
  acc_trade_volume_24h?: number
  signed_change_rate?: number
  best_ask_price?: number
  best_bid_price?: number
  timestamp?: number
  trade_timestamp?: number
}): TickerSnapshot {
  return {
    last: t.trade_price,
    bid: t.best_bid_price ?? t.trade_price,
    ask: t.best_ask_price ?? t.trade_price,
    high24h: t.high_price,
    low24h: t.low_price,
    volume24h: t.acc_trade_volume_24h ?? 0,
    change24h: (t.signed_change_rate ?? 0) * 100,
    ts: t.trade_timestamp ?? t.timestamp ?? Date.now(),
  }
}

// ── Bulk ticker snapshot parsing ──

/**
 * One row of /v1/ticker/all → bulk-quote entry. Upbit market codes are
 * quote-first ('KRW-BTC' → 'BTC-KRW'); `signed_change_rate` is a fraction.
 */
export function parseUpbitBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = fromUpbitCode(String(data['market'] ?? ''))
  if (!symbol.includes('-')) return null
  const price = Number(data['trade_price'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    symbol,
    price,
    change24h: Number(data['signed_change_rate'] ?? 0) * 100,
  }
}
