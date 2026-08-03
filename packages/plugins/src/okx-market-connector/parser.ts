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

/** Normalize a pair string to OKX format (uppercase, dashes). */
export function normalizePair(raw: string): string {
  return raw.trim().replace(/[/_]/g, '-').toUpperCase()
}

// ── Timeframe mapping ──

const TF_TO_OKX: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
  '2h': '2H',
  '4h': '4H',
  '1d': '1D',
  '3d': '3D',
  '1w': '1W',
  '1M': '1M',
}

// Case matters for the month bar: OKX 'candle1M' (month) must not collide
// with 'candle1m' (minute), so exact-case keys are listed alongside the
// legacy lowercase ones.
const OKX_CHANNEL_TO_TF: Record<string, string> = {
  candle1m: '1m',
  candle5m: '5m',
  candle15m: '15m',
  candle30m: '30m',
  candle1h: '1h',
  candle2h: '2h',
  candle4h: '4h',
  candle1d: '1d',
  candle3d: '3d',
  candle1w: '1w',
  candle1M: '1M',
}

export function mapTimeframeToOkxBar(tf: string): string | null {
  return TF_TO_OKX[tf] ?? null
}

export function mapTimeframeToOkxChannel(tf: string): string | null {
  const bar = mapTimeframeToOkxBar(tf)
  return bar ? `candle${bar}` : null
}

export function mapOkxChannelToTimeframe(channel: string): string | null {
  // Exact match first ('candle1M' month vs 'candle1m' minute), then the
  // case-insensitive fallback for the hour/day/week channels ('candle1H' …).
  return (
    OKX_CHANNEL_TO_TF[channel] ??
    OKX_CHANNEL_TO_TF[channel.toLowerCase()] ??
    null
  )
}

// ── Candle parsing ──

/**
 * Parse an OKX candle row [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm].
 * Returns [candle, isClosed].
 */
export function parseOkxCandleRow(
  row: Array<unknown>,
): [Candle, boolean] | null {
  if (row.length < 6) return null

  const ts = parseNum(row[0])
  const open = parseNum(row[1])
  const high = parseNum(row[2])
  const low = parseNum(row[3])
  const close = parseNum(row[4])
  const volume = parseNum(row[5])

  if ([ts, open, high, low, close, volume].some((v) => v === null)) return null

  const isClosed = row.length > 8 ? String(row[8]) === '1' : true

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

// ── Ticker parsing ──

export function parseOkxTicker(data: Record<string, string>): TickerSnapshot {
  return {
    last: Number(data['last'] ?? 0),
    bid: Number(data['bidPx'] ?? 0),
    ask: Number(data['askPx'] ?? 0),
    high24h: Number(data['high24h'] ?? 0),
    low24h: Number(data['low24h'] ?? 0),
    volume24h: Number(data['vol24h'] ?? 0),
    change24h: Number(data['sodUtc0'] ?? 0)
      ? ((Number(data['last'] ?? 0) - Number(data['sodUtc0'] ?? 0)) /
          Number(data['sodUtc0'] ?? 1)) *
        100
      : 0,
    ts: Number(data['ts'] ?? Date.now()),
  }
}

// ── Bulk ticker snapshot parsing ──

/**
 * One row of /api/v5/market/tickers → bulk-quote entry. OKX instIds are
 * already canonical 'BASE-QUOTE'. Returns null for unpriced rows.
 */
export function parseOkxBulkTickerRow(
  data: Record<string, string>,
): BulkTickerEntry | null {
  const symbol = data['instId'] ?? ''
  const last = Number(data['last'] ?? 0)
  if (!symbol || !Number.isFinite(last) || last <= 0) return null
  const open = Number(data['open24h'] ?? 0) || Number(data['sodUtc0'] ?? 0)
  return {
    symbol,
    price: last,
    change24h: open > 0 ? ((last - open) / open) * 100 : 0,
  }
}

// ── Orderbook parsing ──

export function parseOkxBookLevels(
  levels: Array<Array<string>>,
): Array<OrderbookLevel> {
  return levels.map((l) => [Number(l[0]), Number(l[1])])
}

// ── Trade parsing ──

/**
 * One row of the OKX `trades` channel.
 *
 * OKX reports `side` as the TAKER's side already, so it maps straight onto
 * Trade.side (the aggressor) with no inversion. Rows missing an id, or with a
 * non-positive price or size, are dropped rather than rendered as a zero
 * print.
 */
export function parseOkxTrade(data: Record<string, string>): Trade | null {
  const id = data['tradeId'] ?? ''
  const price = Number(data['px'] ?? 0)
  const size = Number(data['sz'] ?? 0)
  const side = data['side']
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

// ── Utils ──

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}
