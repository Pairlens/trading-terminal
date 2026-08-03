// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
/**
 * HTX (formerly Huobi) pair normalization, timeframe mapping, and data parsers.
 *
 * Pair format: lowercase concatenated — btcusdt, ethbtc, dogeusdt.
 * Candle periods: 1min, 5min, 15min, 30min, 60min, 4hour, 1day, 1week.
 *
 * Quirk: `amount` = base volume, `vol` = quote volume (opposite of many exchanges).
 */

import type {
  Candle,
  TickerSnapshot,
  Trade,
} from '@pairlens/market-engine/types'

// ── Pair normalization ──

const KNOWN_QUOTES = ['USDT', 'USDC', 'BTC', 'ETH', 'EUR', 'USD', 'BUSD']

/** Pairlens "BTC-USDT" → HTX "btcusdt" */
export function toHtxSymbol(pair: string): string {
  return pair.replace('-', '').toLowerCase()
}

/** HTX "btcusdt" → Pairlens "BTC-USDT" */
export function fromHtxSymbol(symbol: string): string {
  const upper = symbol.toUpperCase()
  for (const q of KNOWN_QUOTES) {
    if (upper.endsWith(q) && upper.length > q.length) {
      return `${upper.slice(0, -q.length)}-${q}`
    }
  }
  return upper
}

// ── Timeframe mapping ──

const TF_TO_PERIOD: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '60min',
  '4h': '4hour',
  '1d': '1day',
  '1w': '1week',
  // HTX has no 3-day period — '3d' stays unmapped (unsupported).
  '1M': '1mon',
}

const PERIOD_TO_TF: Record<string, string> = {
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '60min': '1h',
  '4hour': '4h',
  '1day': '1d',
  '1week': '1w',
  '1mon': '1M',
}

/** Pairlens timeframe → HTX period string. */
export function toHtxPeriod(tf: string): string | undefined {
  return TF_TO_PERIOD[tf]
}

/** HTX period → Pairlens timeframe. */
export function fromHtxPeriod(period: string): string | undefined {
  return PERIOD_TO_TF[period]
}

// ── Data parsers ──

/**
 * Parse HTX candle tick.
 * `id` is candle start timestamp in seconds.
 * `amount` is base volume (NOT quote volume).
 */
export function parseHtxCandle(tick: {
  id: number
  open: number
  high: number
  low: number
  close: number
  amount: number
}): Candle {
  return {
    ts: tick.id * 1000,
    open: tick.open,
    high: tick.high,
    low: tick.low,
    close: tick.close,
    volume: tick.amount, // base volume
  }
}

/** Parse HTX market detail (24h stats) into a partial TickerSnapshot. */
export function parseHtxTicker(
  detail: {
    open: number
    close: number
    high: number
    low: number
    amount: number
  },
  bbo?: { bid: number; ask: number },
): TickerSnapshot {
  const change =
    detail.open > 0 ? ((detail.close - detail.open) / detail.open) * 100 : 0

  return {
    last: detail.close,
    bid: bbo?.bid ?? detail.close,
    ask: bbo?.ask ?? detail.close,
    high24h: detail.high,
    low24h: detail.low,
    volume24h: detail.amount,
    change24h: change,
    ts: Date.now(),
  }
}

// ── Bulk ticker snapshot parsing ──

/**
 * One row of /market/tickers → bulk-quote entry. HTX symbols are
 * lowercase concatenated ('btcusdt'); open/close span the rolling 24h
 * window, so the change is derived.
 */
export function parseHtxBulkTickerRow(
  data: Record<string, unknown>,
): BulkTickerEntry | null {
  const symbol = fromHtxSymbol(String(data['symbol'] ?? ''))
  if (!symbol.includes('-')) return null
  const close = Number(data['close'] ?? 0)
  if (!Number.isFinite(close) || close <= 0) return null
  const open = Number(data['open'] ?? 0)
  return {
    symbol,
    price: close,
    change24h: open > 0 ? ((close - open) / open) * 100 : 0,
  }
}

// ── Trade parsing ──

/**
 * One row of HTX's `market.{symbol}.trade.detail` tick:
 * `{ tradeId, ts, amount, price, direction: 'buy'|'sell' }`
 *
 * Amounts arrive in scientific notation (`9.99E-4`), which Number() handles.
 * `direction` is documented as the taker's direction; the live cross-check
 * against top-of-book agrees.
 */
export function parseHtxTrade(data: Record<string, unknown>): Trade | null {
  const id = data['tradeId'] ?? data['id']
  const price = Number(data['price'] ?? 0)
  const size = Number(data['amount'] ?? 0)
  const dir = String(data['direction'] ?? '')
  if (id === undefined || id === null || id === '') return null
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(size) || size <= 0) return null
  if (dir !== 'buy' && dir !== 'sell') return null
  const ts = Number(data['ts'] ?? 0)
  return {
    id: String(id),
    price,
    size,
    side: dir,
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  }
}
