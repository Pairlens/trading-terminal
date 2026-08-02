// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'
import type {
  OrderbookLevel,
  TickerSnapshot,
} from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Normalize a pair string to ByBit format (uppercase, no separators). */
export function normalizePair(raw: string): string {
  return raw.trim().replace(/[-/_]/g, '').toUpperCase()
}

// ── Timeframe mapping ──

const TF_TO_BYBIT: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
  // ByBit has no 3-day interval — '3d' stays unmapped (unsupported).
  '1M': 'M',
}

const BYBIT_TO_TF: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  D: '1d',
  W: '1w',
  M: '1M',
}

export function mapTimeframeToBybitInterval(tf: string): string | null {
  return TF_TO_BYBIT[tf] ?? null
}

export function mapBybitIntervalToTimeframe(interval: string): string | null {
  return BYBIT_TO_TF[interval] ?? null
}

/** Build the kline topic: e.g. "kline.60.BTCUSDT" */
export function buildKlineTopic(
  pair: string,
  timeframe: string,
): string | null {
  const interval = mapTimeframeToBybitInterval(timeframe)
  if (!interval) return null
  return `kline.${interval}.${normalizePair(pair)}`
}

/** Build the ticker topic: e.g. "tickers.BTCUSDT" */
export function buildTickerTopic(pair: string): string {
  return `tickers.${normalizePair(pair)}`
}

/** Build the orderbook topic: e.g. "orderbook.50.BTCUSDT" */
export function buildBookTopic(pair: string): string {
  return `orderbook.50.${normalizePair(pair)}`
}

/**
 * Parse a kline topic back to (interval, symbol).
 * e.g. "kline.60.BTCUSDT" -> ["60", "BTCUSDT"]
 */
export function parseKlineTopic(topic: string): [string, string] | null {
  const parts = topic.split('.')
  if (parts.length !== 3 || parts[0] !== 'kline') return null
  return [parts[1], parts[2]]
}

// ── Candle parsing (WS) ──

/**
 * Parse a ByBit WS kline data entry.
 * Format: { start, open, high, low, close, volume, confirm }
 */
export function parseBybitWsKline(
  k: Record<string, unknown>,
): [Candle, boolean] | null {
  const ts = parseNum(k['start'])
  const open = parseNum(k['open'])
  const high = parseNum(k['high'])
  const low = parseNum(k['low'])
  const close = parseNum(k['close'])
  const volume = parseNum(k['volume'])

  if ([ts, open, high, low, close, volume].some((v) => v === null)) return null

  const isClosed = k['confirm'] === true

  return [
    {
      ts: ts!,
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: volume!,
    },
    isClosed,
  ]
}

/**
 * Parse a ByBit REST kline row.
 * Format: [startTime, open, high, low, close, volume, turnover]
 */
export function parseBybitRestKline(row: Array<string>): Candle | null {
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

// ── Ticker parsing ──

export function parseBybitTicker(
  data: Record<string, unknown>,
): TickerSnapshot {
  return {
    last: Number(data['lastPrice'] ?? 0),
    bid: Number(data['bid1Price'] ?? 0),
    ask: Number(data['ask1Price'] ?? 0),
    high24h: Number(data['highPrice24h'] ?? 0),
    low24h: Number(data['lowPrice24h'] ?? 0),
    volume24h: Number(data['volume24h'] ?? 0),
    change24h: Number(data['price24hPcnt'] ?? 0) * 100,
    ts: Date.now(),
  }
}

// ── Orderbook parsing ──

export function parseBybitBookLevels(
  levels: Array<[string, string]>,
): Array<OrderbookLevel> {
  return levels.map((l) => [Number(l[0]), Number(l[1])])
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

// Quote assets on ByBit spot, longest-first for unambiguous suffix matching.
const BYBIT_QUOTES = [
  'USDT',
  'USDC',
  'USDE',
  'BTC',
  'ETH',
  'EUR',
  'BRL',
  'PLN',
  'TRY',
  'DAI',
  'USD',
].sort((a, b) => b.length - a.length)

/** 'BTCUSDT' → 'BTC-USDT'; null when no known quote suffix matches. */
export function bybitSymbolToCanonical(symbol: string): string | null {
  for (const quote of BYBIT_QUOTES) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return `${symbol.slice(0, -quote.length)}-${quote}`
    }
  }
  return null
}

/**
 * One row of /v5/market/tickers?category=spot → bulk-quote entry.
 * `price24hPcnt` is a fraction ('-0.0025' = -0.25%).
 */
export function parseBybitBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = bybitSymbolToCanonical(String(data['symbol'] ?? ''))
  if (!symbol) return null
  const price = Number(data['lastPrice'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return { symbol, price, change24h: Number(data['price24hPcnt'] ?? 0) * 100 }
}
