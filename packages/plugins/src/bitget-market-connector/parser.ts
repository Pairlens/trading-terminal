// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
/**
 * Bitget parser — pair normalization, timeframe mapping, response parsing.
 *
 * Bitget V2 symbol format: concatenated base+quote e.g. "BTCUSDT"
 * Pairlens uses "BTC-USDT" — normalization strips the hyphen.
 *
 * Candle intervals differ between REST and WS:
 *   REST: 1min, 5min, 15min, 30min, 1h, 4h, 6h, 12h, 1day, 1week
 *   WS:   candle1m, candle5m, candle15m, candle30m, candle1H, candle4H, ...
 */

import type { Candle } from '@pairlens/shared/types'
import type { TickerSnapshot, Trade } from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Convert Pairlens "BTC-USDT" → Bitget "BTCUSDT" */
export function normalizePair(raw: string): string {
  return raw.trim().replace(/-/g, '').toUpperCase()
}

/** Convert Bitget "BTCUSDT" → Pairlens "BTC-USDT" (best-effort) */
export function denormalizePair(symbol: string): string {
  // Common quote currencies — match longest first
  for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'EUR', 'USD']) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return `${symbol.slice(0, -quote.length)}-${quote}`
    }
  }
  return symbol
}

// ── Timeframe mapping ──

const TF_TO_REST: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1h',
  '4h': '4h',
  '6h': '6h',
  '1d': '1day',
  '3d': '3day',
  '1w': '1week',
  '1M': '1M',
}

const TF_TO_WS: Record<string, string> = {
  '1m': 'candle1m',
  '5m': 'candle5m',
  '15m': 'candle15m',
  '30m': 'candle30m',
  '1h': 'candle1H',
  '4h': 'candle4H',
  '6h': 'candle6H',
  '1d': 'candle1D',
  '3d': 'candle3D',
  '1w': 'candle1W',
  '1M': 'candle1M',
}

// Reverse: WS channel → Pairlens timeframe
const WS_TO_TF: Record<string, string> = Object.fromEntries(
  Object.entries(TF_TO_WS).map(([k, v]) => [v, k]),
)

export function mapTimeframeToRestGranularity(tf: string): string | null {
  return TF_TO_REST[tf] ?? null
}

export function mapTimeframeToWsChannel(tf: string): string | null {
  return TF_TO_WS[tf] ?? null
}

export function mapWsChannelToTimeframe(channel: string): string | null {
  return WS_TO_TF[channel] ?? null
}

// ── Candle parsing ──

/**
 * Parse Bitget REST/WS candle array.
 * Format: [timestamp, open, high, low, close, baseVolume, quoteVolume, usdtVolume]
 * All values are strings. Timestamp is milliseconds.
 */
export function parseBitgetCandle(row: Array<string>): Candle | null {
  if (row.length < 6) return null

  const ts = Number(row[0])
  const open = Number(row[1])
  const high = Number(row[2])
  const low = Number(row[3])
  const close = Number(row[4])
  const volume = Number(row[5]) // baseVolume

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

// ── Ticker parsing ──

/**
 * Parse Bitget ticker (REST or WS) into TickerSnapshot.
 * WS uses open24h; REST uses open.
 */
export function parseBitgetTicker(
  data: Record<string, string>,
): TickerSnapshot {
  const last = Number(data['lastPr'] ?? 0)
  const open = Number(data['open24h'] ?? data['open'] ?? data['openUtc'] ?? 0)
  const change = open > 0 ? ((last - open) / open) * 100 : 0

  return {
    last,
    bid: Number(data['bidPr'] ?? 0),
    ask: Number(data['askPr'] ?? 0),
    high24h: Number(data['high24h'] ?? 0),
    low24h: Number(data['low24h'] ?? 0),
    volume24h: Number(data['baseVolume'] ?? 0),
    change24h:
      Number(data['change24h'] ?? data['changeUtc24h'] ?? 0) * 100 || change,
    ts: Number(data['ts'] ?? Date.now()),
  }
}

// ── Bulk ticker snapshot parsing ──

/**
 * One row of /api/v2/spot/market/tickers → bulk-quote entry. `change24h`
 * is a fraction ('0.0153' = 1.53%); symbols are concatenated ('BTCUSDT').
 */
export function parseBitgetBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = denormalizePair(String(data['symbol'] ?? ''))
  if (!symbol.includes('-')) return null
  const price = Number(data['lastPr'] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return { symbol, price, change24h: Number(data['change24h'] ?? 0) * 100 }
}

// ── Trade parsing ──

/**
 * One row of Bitget's `trade` channel:
 * `{ ts, price, size, side: 'buy'|'sell', tradeId }`
 *
 * Bitget documents `side` as the taker's direction; the live cross-check
 * against top-of-book agrees.
 */
export function parseBitgetTrade(data: Record<string, unknown>): Trade | null {
  const id = String(data['tradeId'] ?? '')
  const price = Number(data['price'] ?? 0)
  const size = Number(data['size'] ?? 0)
  const side = String(data['side'] ?? '')
  if (!id) return null
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(size) || size <= 0) return null
  if (side !== 'buy' && side !== 'sell') return null
  const ts = Number(data['ts'] ?? 0)
  return {
    id,
    price,
    size,
    side,
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  }
}
