// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'

// ── Pair normalization ──

/** Normalize a pair string to MEXC format (uppercase, no separators). */
export function normalizePair(raw: string): string {
  return raw.trim().replace(/[-/_]/g, '').toUpperCase()
}

// ── Timeframe mapping ──

const TF_TO_MEXC: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '60m',
  '4h': '4h',
  '1d': '1d',
  '1w': '1W',
  // MEXC has no 3-day interval — '3d' stays unmapped (unsupported).
  '1M': '1M',
}

export function mapTimeframeToMexcInterval(tf: string): string | null {
  return TF_TO_MEXC[tf] ?? null
}

// Bar length per timeframe. MEXC ignores `endTime` unless `startTime` is sent
// with it (measured), so paged history has to compute an explicit window.
const TF_TO_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
}

export function mexcTimeframeMs(tf: string): number {
  return TF_TO_MS[tf] ?? 900_000
}

/** WS channel kline intervals — different naming from REST. */
const TF_TO_WS_INTERVAL: Record<string, string> = {
  '1m': 'Min1',
  '5m': 'Min5',
  '15m': 'Min15',
  '30m': 'Min30',
  '1h': 'Min60',
  '4h': 'Hour4',
  '1d': 'Day1',
  '1w': 'Week1',
  '1M': 'Month1',
}

export function mapTimeframeToWsInterval(tf: string): string | null {
  return TF_TO_WS_INTERVAL[tf] ?? null
}

// ── Candle parsing (REST kline rows) ──

/**
 * Parse a MEXC REST kline row.
 * Format: [openTime, open, high, low, close, volume, closeTime, ...]
 * Same layout as Binance.
 */
export function parseMexcRestKline(row: Array<unknown>): Candle | null {
  if (row.length < 6) return null

  const ts = parseNum(row[0])
  const open = parseNum(row[1])
  const high = parseNum(row[2])
  const low = parseNum(row[3])
  const close = parseNum(row[4])
  const volume = parseNum(row[5])

  if ([ts, open, high, low, close, volume].some((v) => v === null)) return null

  return {
    ts: ts!,
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
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

// Quote assets on MEXC spot, longest-first for unambiguous suffix matching.
const MEXC_QUOTES = [
  'USDT',
  'USDC',
  'TUSD',
  'BTC',
  'ETH',
  'EUR',
  'TRY',
  'BRL',
  'USD',
].sort((a, b) => b.length - a.length)

/** 'BTCUSDT' → 'BTC-USDT'; null when no known quote suffix matches. */
export function mexcSymbolToCanonical(symbol: string): string | null {
  for (const quote of MEXC_QUOTES) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return `${symbol.slice(0, -quote.length)}-${quote}`
    }
  }
  return null
}

/**
 * One row of /api/v3/ticker/24hr → bulk-quote entry. Unlike Binance,
 * MEXC's `priceChangePercent` is a fraction ('-0.0393' = -3.93%).
 */
export function parseMexcBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = mexcSymbolToCanonical(String(data['symbol'] ?? ''))
  if (!symbol) return null
  const price = Number(data['lastPrice'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    symbol,
    price,
    change24h: Number(data['priceChangePercent'] ?? 0) * 100,
  }
}
