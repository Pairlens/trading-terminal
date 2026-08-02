// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'
import type {
  OrderbookLevel,
  TickerSnapshot,
} from '@pairlens/market-engine/types'

// ── Pair normalization ──
//
// Pairlens pairs are 'BASE-QUOTE' ('AAPL-USD'); Alpaca symbols are the bare
// ticker ('AAPL'). Every stock trades against USD, so the quote is implied.

/** Convert a Pairlens pair key to an Alpaca symbol: 'AAPL-USD' → 'AAPL'. */
export function toAlpacaSymbol(pair: string): string {
  return pair.trim().toUpperCase().split(/[-/]/)[0] ?? ''
}

/** Convert an Alpaca symbol to a Pairlens pair key: 'AAPL' → 'AAPL-USD'. */
export function toPairKey(symbol: string): string {
  return `${symbol.trim().toUpperCase()}-USD`
}

// ── Timeframe mapping ──

const TF_TO_ALPACA: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '30m': '30Min',
  '1h': '1Hour',
  '2h': '2Hour',
  '4h': '4Hour',
  '1d': '1Day',
  '1w': '1Week',
  // Alpaca Day bars only come in 1Day — '3d' stays unmapped (unsupported).
  '1M': '1Month',
}

const TF_TO_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
  // 30-day approximation, used only for live-bar bucket rollover.
  '1M': 2_592_000_000,
}

export function mapTimeframeToAlpacaInterval(tf: string): string | null {
  return TF_TO_ALPACA[tf] ?? null
}

export function timeframeToMs(tf: string): number | null {
  return TF_TO_MS[tf] ?? null
}

// ── Candle parsing ──

/**
 * Parse an Alpaca bar (REST or WS — same shape, keys t/o/h/l/c/v).
 * `t` is an RFC-3339 timestamp string; normalized to epoch-ms.
 */
export function parseAlpacaBar(raw: unknown): Candle | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>

  const ts = parseTs(b['t'])
  const open = parseNum(b['o'])
  const high = parseNum(b['h'])
  const low = parseNum(b['l'])
  const close = parseNum(b['c'])
  const volume = parseNum(b['v'])

  if (ts === null || [open, high, low, close, volume].some((v) => v === null)) {
    return null
  }

  return {
    ts,
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
  }
}

/**
 * Merge a fresher (typically 1-minute) bar into the candle for the bucket it
 * falls into. Alpaca's WS only streams 1-minute bars, so the connector
 * aggregates them client-side into the subscribed timeframe.
 *
 * `bucketTs` must be the bucket's open timestamp. When `current` is null or
 * belongs to an older bucket, the bar seeds a fresh candle for the bucket.
 */
export function mergeBarIntoBucket(
  current: Candle | null,
  bar: Candle,
  bucketTs: number,
): Candle {
  if (!current || current.ts !== bucketTs) {
    return { ...bar, ts: bucketTs }
  }
  return {
    ts: bucketTs,
    open: current.open,
    high: Math.max(current.high, bar.high),
    low: Math.min(current.low, bar.low),
    close: bar.close,
    volume: current.volume + bar.volume,
  }
}

/**
 * The open timestamp of the timeframe bucket containing `ts`, anchored to
 * `anchorTs` (the open of any known candle for that timeframe, so buckets
 * stay aligned with the venue's own bar boundaries).
 */
export function bucketTsFor(
  ts: number,
  anchorTs: number,
  durationMs: number,
): number {
  return anchorTs + Math.floor((ts - anchorTs) / durationMs) * durationMs
}

// ── Ticker parsing ──

/**
 * Build a TickerSnapshot from an Alpaca stock snapshot
 * (GET /v2/stocks/snapshots): latestTrade, latestQuote, dailyBar,
 * prevDailyBar. For stocks, "24h" stats map to the current session's daily
 * bar, and change is measured against the previous session's close — the
 * standard convention for equities.
 */
export function parseAlpacaSnapshot(raw: unknown): TickerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, Record<string, unknown> | undefined>

  const trade = s['latestTrade']
  const quote = s['latestQuote']
  const daily = s['dailyBar']
  const prevDaily = s['prevDailyBar']

  const last = parseNum(trade?.['p']) ?? parseNum(daily?.['c'])
  if (last === null) return null

  const prevClose = parseNum(prevDaily?.['c'])
  const change24h =
    prevClose !== null && prevClose > 0
      ? ((last - prevClose) / prevClose) * 100
      : 0

  const ts = parseTs(trade?.['t']) ?? Date.now()

  return {
    last,
    bid: parseNum(quote?.['bp']) ?? 0,
    ask: parseNum(quote?.['ap']) ?? 0,
    high24h: parseNum(daily?.['h']) ?? last,
    low24h: parseNum(daily?.['l']) ?? last,
    volume24h: parseNum(daily?.['v']) ?? 0,
    change24h,
    ts,
  }
}

// ── Quote → top-of-book ──

/**
 * Convert an Alpaca quote (WS 'q' message or latestQuote) into single-level
 * book sides. The IEX feed carries top-of-book only — no depth — so the
 * order book renders one level per side. Sizes are in shares.
 */
export function parseAlpacaQuoteBook(raw: unknown): {
  bids: Array<OrderbookLevel>
  asks: Array<OrderbookLevel>
  ts: number
} | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>

  const bp = parseNum(q['bp'])
  const bs = parseNum(q['bs'])
  const ap = parseNum(q['ap'])
  const as = parseNum(q['as'])
  const ts = parseTs(q['t']) ?? Date.now()

  const bids: Array<OrderbookLevel> =
    bp !== null && bp > 0 ? [[bp, bs ?? 0]] : []
  const asks: Array<OrderbookLevel> =
    ap !== null && ap > 0 ? [[ap, as ?? 0]] : []

  if (bids.length === 0 && asks.length === 0) return null
  return { bids, asks, ts }
}

// ── Utils ──

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

/** Parse an Alpaca timestamp (RFC-3339 string or epoch-ms) to epoch-ms. */
export function parseTs(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const ms = Date.parse(v)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}
