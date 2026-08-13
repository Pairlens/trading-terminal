// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pure normalizers for ccxt's UNIFIED payload shapes.
 *
 * One module for all fourteen venues, because that is the whole point of the
 * bridge: ccxt has already collapsed every wire format into one, so there is
 * exactly one place left where a unit can be wrong. Everything here is
 * synchronous and side-effect free so the golden conformance suite can drive
 * it directly (`import * as ccxt from '../ccxt-connector/parser'`).
 *
 * Two conversions carry all the risk, and both are asserted by the golden
 * suite:
 *
 * - `change24h` must be a PERCENT. ccxt's `percentage` already is one (OKX's
 *   fraction, Bybit's `price24hPcnt`, Upbit's `signed_change_rate` are all
 *   normalized upstream), so this file must NOT multiply it again. Where a
 *   venue omits it, we derive it from `open` rather than reporting 0.
 * - Timestamps must be epoch MILLISECONDS. ccxt is consistently ms, but a
 *   missing timestamp is common (Binance's orderbook carries none), and
 *   stamping 0 would fail `isMsTimestamp` and silently drop the frame.
 *
 * Kraken's WS candles arrive as strings and Bitfinex's `info` is a positional
 * array — `num()` coerces rather than trusting `typeof`, so the venue fan-out
 * inherits that for free.
 */

import type { Candle } from '@pairlens/shared/types'
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type {
  OrderbookLevel,
  TickerSnapshot,
  Trade,
} from '@pairlens/market-engine/types'
import type {
  CcxtOhlcvRow,
  CcxtOrderBookLike,
  CcxtTickerLike,
  CcxtTradeLike,
} from './types'

// ── Pair / symbol mapping ────────────────────────────────────────────────

/** Canonical Pairlens pair: BASE-QUOTE, uppercase, dash separated. */
export function normalizePair(raw: string): string {
  return raw.trim().replace(/[/_]/g, '-').toUpperCase()
}

/** 'BTC-USDT' → 'BTC/USDT' (the ccxt unified symbol). */
export function toCcxtSymbol(pair: string): string {
  return normalizePair(pair).replace('-', '/')
}

/** 'BTC/USDT' → 'BTC-USDT'. Settlement suffixes ('BTC/USDT:USDT') are dropped. */
export function fromCcxtSymbol(symbol: string): string {
  const spot = symbol.split(':')[0] ?? symbol
  return normalizePair(spot)
}

// ── Timeframes ───────────────────────────────────────────────────────────

/**
 * The app's `Timeframe` union. ccxt keys its own `timeframes` table by these
 * exact strings for every venue in the fleet, so the mapping is identity —
 * the value lookup happens inside ccxt (`safeString(this.timeframes, tf, tf)`).
 * What this guards is the CASE trap: '1M' (month) and '1m' (minute) are
 * distinct keys and a lowercasing normalizer silently turns a month chart into
 * a minute chart.
 */
const SUPPORTED_TIMEFRAMES = new Set([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
  '3d',
  '1w',
  '1M',
])

/** The ccxt timeframe key for a Pairlens timeframe, or null if unsupported. */
export function mapTimeframeToCcxt(tf: string): string | null {
  return SUPPORTED_TIMEFRAMES.has(tf) ? tf : null
}

// ── Candles ──────────────────────────────────────────────────────────────

/**
 * Parse one ccxt unified OHLCV row: `[ts, open, high, low, close, volume]`.
 *
 * Returns null on anything non-finite rather than emitting a candle the
 * runtime guard would drop later — a dropped candle at least logs once, a
 * NaN candle poisons the buffer's ordering.
 */
export function parseCcxtOhlcv(row: CcxtOhlcvRow): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null
  const ts = num(row[0])
  const open = num(row[1])
  const high = num(row[2])
  const low = num(row[3])
  const close = num(row[4])
  const volume = num(row[5])
  if (
    ts === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null
  ) {
    return null
  }
  return { ts, open, high, low, close, volume }
}

/** Parse a batch of unified OHLCV rows, dropping malformed ones. */
export function parseCcxtOhlcvBatch(rows: Array<CcxtOhlcvRow>): Array<Candle> {
  const out: Array<Candle> = []
  for (const row of rows) {
    const candle = parseCcxtOhlcv(row)
    if (candle) out.push(candle)
  }
  return out
}

// ── Ticker ───────────────────────────────────────────────────────────────

/**
 * Parse a ccxt unified ticker.
 *
 * `percentage` is ALREADY a percent in ccxt's unified shape — every venue's
 * native unit (fraction, basis points, a prior price) is converted upstream in
 * that venue's `parseTicker`. Multiplying here is the single most likely way
 * to ship a 100x-wrong 24h change, so the only fallback is deriving from
 * `open`, which is a price, not a rate.
 *
 * `bid`/`ask` default to 0, which the validator reads as "not provided" — some
 * venues omit top-of-book on the ticker channel and a fabricated spread is
 * worse than none.
 */
export function parseCcxtTicker(raw: CcxtTickerLike): TickerSnapshot {
  const last = num(raw['last']) ?? num(raw['close']) ?? 0
  const open = num(raw['open'])
  const percentage = num(raw['percentage'])
  const change24h =
    percentage !== null
      ? percentage
      : open !== null && open > 0 && last > 0
        ? ((last - open) / open) * 100
        : 0

  return {
    last,
    bid: num(raw['bid']) ?? 0,
    ask: num(raw['ask']) ?? 0,
    high24h: num(raw['high']) ?? 0,
    low24h: num(raw['low']) ?? 0,
    volume24h: num(raw['baseVolume']) ?? num(raw['quoteVolume']) ?? 0,
    change24h,
    ts: msTimestamp(raw['timestamp']),
  }
}

/**
 * One entry of a `fetchTickers` result → a bulk-quote row. Returns null for
 * unpriced (delisted) rows, so the snapshot doubles as listing detection.
 */
export function parseCcxtBulkTickerRow(
  symbol: string,
  raw: CcxtTickerLike,
): BulkTickerEntry | null {
  const pair = fromCcxtSymbol(symbol)
  if (!pair.includes('-')) return null
  const price = num(raw['last']) ?? num(raw['close']) ?? 0
  if (!Number.isFinite(price) || price <= 0) return null
  const percentage = num(raw['percentage'])
  const open = num(raw['open'])
  const change24h =
    percentage !== null
      ? percentage
      : open !== null && open > 0
        ? ((price - open) / open) * 100
        : 0
  return { symbol: pair, price, change24h }
}

// ── Orderbook ────────────────────────────────────────────────────────────

/**
 * Copy one side of a ccxt orderbook into plain tuples.
 *
 * The copy is mandatory, not tidiness: `OrderBook.limit()` returns the LIVE
 * instance and its `bids`/`asks` are Array subclasses that the next WS frame
 * mutates in place. Handing them across the plugin boundary would let a
 * consumer's "snapshot" change underneath it between renders.
 *
 * Zero-size levels are deletion markers ccxt has already applied; anything
 * left with a non-positive price is malformed and dropped.
 */
export function parseCcxtBookLevels(
  levels: Array<Array<number>>,
): Array<OrderbookLevel> {
  const out: Array<OrderbookLevel> = []
  for (const level of levels) {
    const price = num(level[0])
    const size = num(level[1])
    if (price === null || size === null) continue
    if (price <= 0 || size < 0) continue
    out.push([price, size])
  }
  return out
}

/** Epoch-ms stamp for a book frame; Binance's carries none, so fall back. */
export function ccxtBookTimestamp(book: CcxtOrderBookLike): number {
  return msTimestamp(book.timestamp)
}

// ── Trades ───────────────────────────────────────────────────────────────

/**
 * Parse a ccxt unified public trade.
 *
 * `side` is the AGGRESSOR. ccxt normalizes the venue's convention into the
 * taker side — verified live against top-of-book on both PoC venues: Binance
 * sends `m` ("was the buyer the maker?") and ccxt inverts it; OKX sends the
 * taker directly and ccxt passes it through. Coinbase reports the MAKER and
 * ccxt propagates that, so the venue fan-out must re-check each venue against
 * live top-of-book before declaring `market-data:trades`.
 */
export function parseCcxtTrade(raw: CcxtTradeLike): Trade | null {
  const id = raw['id']
  if (id === undefined || id === null || id === '') return null
  const price = num(raw['price'])
  const size = num(raw['amount'])
  if (price === null || price <= 0) return null
  if (size === null || size <= 0) return null
  const side = raw['side']
  if (side !== 'buy' && side !== 'sell') return null
  return {
    id: String(id),
    price,
    size,
    side,
    ts: msTimestamp(raw['timestamp']),
  }
}

// ── Utils ────────────────────────────────────────────────────────────────

/**
 * Coerce to a finite number. Strings are accepted because ccxt is not
 * uniformly numeric: Kraken's WS OHLCV values come through as strings while
 * the same symbol's REST rows are numbers.
 */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Epoch-ms stamp, falling back to now.
 *
 * A missing timestamp is routine (Binance's unified orderbook has none) and
 * emitting 0 would fail `isMsTimestamp` and drop the frame. Seconds-scale
 * values are promoted rather than passed through — the seconds/milliseconds
 * mix-up is the single most common connector bug the validator exists to
 * catch, and it is cheaper to fix here than to drop the data.
 */
function msTimestamp(value: unknown): number {
  const parsed = num(value)
  if (parsed === null || parsed <= 0) return Date.now()
  // 1e12 ms ≈ 2001-09; anything smaller was quoted in seconds.
  if (parsed < 1_000_000_000_000) return Math.round(parsed * 1000)
  return Math.round(parsed)
}
