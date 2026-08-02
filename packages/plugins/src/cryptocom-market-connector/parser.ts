// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
/**
 * Crypto.com pair normalization, timeframe mapping, and data parsers.
 *
 * Pair format: uppercase with underscore — BTC_USDT, ETH_USD, CRO_USDT.
 * Candle timeframes: 1m, 5m, 15m, 30m, 1h, 2h, 4h, 12h, 1D, 7D, 14D, 1M.
 *
 * All numeric values in API responses are strings.
 */

import type { Candle, TickerSnapshot } from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Pairlens "BTC-USDT" -> Crypto.com "BTC_USDT" */
export function toCryptocomSymbol(pair: string): string {
  return pair.replace('-', '_')
}

/** Crypto.com "BTC_USDT" -> Pairlens "BTC-USDT" */
export function fromCryptocomSymbol(symbol: string): string {
  return symbol.replace('_', '-')
}

// ── Timeframe mapping ──

const TF_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1d': '1D',
  '1w': '7D',
  // Crypto.com has no 3-day timeframe — '3d' stays unmapped (unsupported).
  '1M': '1M',
}

const REVERSE_TF: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1D': '1d',
  '7D': '1w',
  '1M': '1M',
}

/** Pairlens timeframe -> Crypto.com timeframe string. */
export function toCryptocomTimeframe(tf: string): string | undefined {
  return TF_MAP[tf]
}

/** Crypto.com timeframe -> Pairlens timeframe. */
export function fromCryptocomTimeframe(tf: string): string | undefined {
  return REVERSE_TF[tf]
}

// ── Data parsers ──

/**
 * Parse Crypto.com candle data.
 * Fields: t (start time ms), o, h, l, c, v — all as strings or numbers.
 */
export function parseCryptocomCandle(tick: {
  t: number
  o: number | string
  h: number | string
  l: number | string
  c: number | string
  v: number | string
}): Candle {
  return {
    ts: tick.t,
    open: Number(tick.o),
    high: Number(tick.h),
    low: Number(tick.l),
    close: Number(tick.c),
    volume: Number(tick.v),
  }
}

/**
 * Parse Crypto.com ticker data.
 * Fields: a (last price), b (best bid), k (best ask),
 * h/l (24h high/low), v (volume), c (24h change decimal), t (timestamp ms).
 */
export function parseCryptocomTicker(tick: {
  a: number | string
  b: number | string
  k: number | string
  h: number | string
  l: number | string
  v: number | string
  vv?: number | string
  c: number | string
  t: number
}): TickerSnapshot {
  return {
    last: Number(tick.a),
    bid: Number(tick.b),
    ask: Number(tick.k),
    high24h: Number(tick.h),
    low24h: Number(tick.l),
    volume24h: Number(tick.v),
    change24h: Number(tick.c) * 100, // API returns decimal (e.g. 0.05 = 5%)
    ts: tick.t,
  }
}

// ── Bulk ticker snapshot parsing ──

/**
 * One row of /exchange/v1/public/get-tickers → bulk-quote entry. Spot
 * instruments are underscored ('BTC_USD') — derivative names ('BTCUSD-PERP')
 * are skipped. `a` is the last price; `c` is the 24h change as a fraction.
 */
export function parseCryptocomBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const instrument = String(data['i'] ?? '')
  if (!instrument.includes('_')) return null
  const price = Number(data['a'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    symbol: fromCryptocomSymbol(instrument),
    price,
    change24h: Number(data['c'] ?? 0) * 100,
  }
}
