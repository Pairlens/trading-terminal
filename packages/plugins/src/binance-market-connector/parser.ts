// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type {
  OrderbookLevel,
  TickerSnapshot,
  Trade,
} from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Normalize a pair string to Binance format (uppercase, no separators). */
export function normalizePair(raw: string): string {
  return raw.trim().replace(/[-/_]/g, '').toUpperCase()
}

/** Convert Binance symbol to lowercase stream format. */
export function toStreamSymbol(pair: string): string {
  return normalizePair(pair).toLowerCase()
}

// ── Timeframe mapping ──

const TF_TO_BINANCE: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1d': '1d',
  '3d': '3d',
  '1w': '1w',
  '1M': '1M', // Binance intervals are case-sensitive: '1M' month, '1m' minute
}

const BINANCE_TO_TF: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1d': '1d',
  '3d': '3d',
  '1w': '1w',
  '1M': '1M',
}

export function mapTimeframeToBinanceInterval(tf: string): string | null {
  return TF_TO_BINANCE[tf] ?? null
}

export function mapBinanceIntervalToTimeframe(interval: string): string | null {
  return BINANCE_TO_TF[interval] ?? null
}

/** Build the kline stream name: e.g. "btcusdt@kline_1h" */
export function buildKlineStream(
  pair: string,
  timeframe: string,
): string | null {
  const interval = mapTimeframeToBinanceInterval(timeframe)
  if (!interval) return null
  return `${toStreamSymbol(pair)}@kline_${interval}`
}

/** Build the ticker stream name: e.g. "btcusdt@ticker" */
export function buildTickerStream(pair: string): string {
  return `${toStreamSymbol(pair)}@ticker`
}

/** Build the orderbook partial depth stream: e.g. "btcusdt@depth20@100ms" */
export function buildBookStream(pair: string): string {
  return `${toStreamSymbol(pair)}@depth20@100ms`
}

/** Build the raw trade stream: e.g. "btcusdt@trade" */
export function buildTradeStream(pair: string): string {
  return `${toStreamSymbol(pair)}@trade`
}

// ── Candle parsing ──

/**
 * Parse a Binance WS kline event.
 * Format: { e: "kline", k: { t, o, h, l, c, v, x, i } }
 * Returns [candle, isClosed, interval].
 */
export function parseBinanceWsKline(
  k: Record<string, unknown>,
): [Candle, boolean, string] | null {
  const ts = parseNum(k['t'])
  const open = parseNum(k['o'])
  const high = parseNum(k['h'])
  const low = parseNum(k['l'])
  const close = parseNum(k['c'])
  const volume = parseNum(k['v'])

  if ([ts, open, high, low, close, volume].some((v) => v === null)) return null

  const isClosed = k['x'] === true
  const interval = String(k['i'] ?? '')

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
    interval,
  ]
}

/**
 * Parse a Binance REST kline row.
 * Format: [openTime, open, high, low, close, volume, closeTime, ...]
 */
export function parseBinanceRestKline(row: Array<unknown>): Candle | null {
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

export function parseBinanceTicker(
  data: Record<string, unknown>,
): TickerSnapshot {
  return {
    last: Number(data['c'] ?? 0),
    bid: Number(data['b'] ?? 0),
    ask: Number(data['a'] ?? 0),
    high24h: Number(data['h'] ?? 0),
    low24h: Number(data['l'] ?? 0),
    volume24h: Number(data['v'] ?? 0),
    change24h: Number(data['P'] ?? 0),
    ts: Date.now(),
  }
}

// ── Bulk ticker snapshot parsing ──

// Quote assets seen on Binance/Binance.US spot, longest-first so suffix
// matching is unambiguous ('BTCTUSD' → BTC-TUSD, not BTCT-USD).
const BINANCE_QUOTES = [
  'FDUSD',
  'USDT',
  'USDC',
  'TUSD',
  'BUSD',
  'DOGE',
  'USD',
  'EUR',
  'TRY',
  'BRL',
  'JPY',
  'ARS',
  'BTC',
  'ETH',
  'BNB',
  'SOL',
  'XRP',
  'DAI',
].sort((a, b) => b.length - a.length)

/** 'BTCUSDT' → 'BTC-USDT'; null when no known quote suffix matches. */
export function binanceSymbolToCanonical(symbol: string): string | null {
  for (const quote of BINANCE_QUOTES) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return `${symbol.slice(0, -quote.length)}-${quote}`
    }
  }
  return null
}

/**
 * One row of /api/v3/ticker/24hr → bulk-quote entry. Returns null for
 * unpriced (delisted) rows or symbols with no recognizable quote asset.
 */
export function parseBinanceBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = binanceSymbolToCanonical(String(data['symbol'] ?? ''))
  if (!symbol) return null
  const price = Number(data['lastPrice'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return { symbol, price, change24h: Number(data['priceChangePercent'] ?? 0) }
}

// ── Orderbook parsing ──

export function parseBinanceBookLevels(
  levels: Array<[string, string]>,
): Array<OrderbookLevel> {
  return levels.map((l) => [Number(l[0]), Number(l[1])])
}

// ── Trade parsing ──

/**
 * Parse a Binance `@trade` event:
 * `{ e: 'trade', t: id, p: price, q: qty, T: tradeTime, m: buyerIsMaker }`
 *
 * `m` answers "was the BUYER the maker?", which is the inverse of what the
 * tape shows. Buyer-is-maker means the resting bid was hit by an incoming
 * sell, so the aggressor is the SELLER — `m === true` maps to 'sell'. Reading
 * `m` as the aggressor directly is the classic way to invert an entire tape.
 */
export function parseBinanceTrade(data: Record<string, unknown>): Trade | null {
  const id = data['t']
  const price = parseNum(data['p'])
  const size = parseNum(data['q'])
  const buyerIsMaker = data['m']
  if (id === undefined || id === null || id === '') return null
  if (price === null || !Number.isFinite(price) || price <= 0) return null
  if (size === null || !Number.isFinite(size) || size <= 0) return null
  if (typeof buyerIsMaker !== 'boolean') return null
  const ts = parseNum(data['T'])
  return {
    id: String(id),
    price,
    size,
    side: buyerIsMaker ? 'sell' : 'buy',
    ts: ts !== null && Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
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
