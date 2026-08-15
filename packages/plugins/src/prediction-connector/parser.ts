// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pure normalizers for ccxt's PREDICTION payload shapes.
 *
 * A separate module from the spot parser because the inputs are separate
 * types: `PredictionTicker` carries `outcome`/`label`/`openInterest` where the
 * spot one carries `symbol`, `PredictionOrderBook` levels are `[Num, Num]`
 * tuples that may hold nulls, and `PredictionPosition` has no spot equivalent
 * at all. What it shares with the spot parser is the contract on the way OUT —
 * `Candle`, `TickerSnapshot`, `OrderbookLevel`, `Trade` — so the same
 * conformance assertions apply.
 *
 * Two units are worth stating because both venues would otherwise be read
 * wrong:
 *
 * - **Prices are probabilities in collateral units, 0..1.** ccxt converts
 *   Kalshi's integer cents to dollars in its own parser and Polymarket is
 *   natively 0..1, so both arrive on the same scale and nothing here rescales.
 *   Cents are a DISPLAY choice and belong in the terminal's formatter.
 * - **Sizes are contract counts**, not base-asset amounts. One contract settles
 *   at 1 unit of collateral if the outcome wins and 0 otherwise.
 */

import type { Candle } from '@pairlens/shared/types'
import type { OrderbookLevel } from '@pairlens/market-engine/types'
import type { PredictionOhlcvRow, PredictionOrderBookLike } from './types'

// ── Candles ──────────────────────────────────────────────────────────────

/**
 * One unified OHLCV row → a candle, or null when a PRICE field is non-finite.
 *
 * Volume is optional here, unlike on spot. A prediction candle series is not
 * built from a trade tape on every venue: Polymarket's `fetchOHLCV` buckets the
 * CLOB price-history endpoint, which returns `{t, p}` ticks and no size at all,
 * so `parseOHLCV` emits `undefined` in slot 5 for every row. Requiring volume
 * the way the spot parser does dropped the ENTIRE series — 300 rows in, zero
 * candles out — which the terminal then read as "this pair is not listed here"
 * and used to hide the working book, tape and ticket along with the chart.
 *
 * A missing volume becomes 0, which is the honest reading: no size was
 * reported. A missing PRICE is still fatal, because a NaN price poisons the
 * buffer's ordering and there is nothing sensible to substitute.
 */
export function parsePredictionOhlcv(row: PredictionOhlcvRow): Candle | null {
  if (!Array.isArray(row) || row.length < 5) return null
  const ts = num(row[0])
  const open = num(row[1])
  const high = num(row[2])
  const low = num(row[3])
  const close = num(row[4])
  if (
    ts === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null
  }
  return { ts, open, high, low, close, volume: num(row[5]) ?? 0 }
}

/** A batch of unified OHLCV rows, malformed ones dropped. */
export function parsePredictionOhlcvBatch(
  rows: Array<PredictionOhlcvRow>,
): Array<Candle> {
  const out: Array<Candle> = []
  for (const row of rows) {
    const candle = parsePredictionOhlcv(row)
    if (candle) out.push(candle)
  }
  return out
}

// ── Ticker and trades ────────────────────────────────────────────────────
//
// Both are the ccxt-connector's, re-exported rather than reimplemented.
//
// `PredictionTicker` and `PredictionTrade` differ from their spot counterparts
// only by ADDING fields (`outcome`, `label`, `openInterest`) — every field
// either parser reads is present, identically named and identically united, in
// both. The prediction copies of these functions were byte-for-byte identical
// to the spot ones, which meant the `percentage`-is-already-a-percent rule and
// the seconds-to-milliseconds promotion each had two places to drift. One
// definition, one golden row, one place to fix a unit bug.
//
// The genuinely different parsers stay local: OHLCV (volume is optional here,
// see above) and the order book (levels are probabilities bounded by 0 and 1).

export {
  parseCcxtTicker as parsePredictionTicker,
  parseCcxtTrade as parsePredictionTrade,
} from '../ccxt-connector/parser'

// ── Orderbook ────────────────────────────────────────────────────────────

/**
 * One side of a prediction book → plain tuples.
 *
 * The copy is mandatory for the same reason as on spot: a watched book is the
 * live instance and the next frame rewrites it in place. Prediction levels are
 * additionally allowed to be `[Num, Num]` with nulls, so the coercion has to
 * reject rather than trust the tuple type.
 */
export function parsePredictionBookLevels(
  levels: Array<Array<number>>,
): Array<OrderbookLevel> {
  const out: Array<OrderbookLevel> = []
  if (!Array.isArray(levels)) return out
  for (const level of levels) {
    const price = num(level?.[0])
    const size = num(level?.[1])
    if (price === null || size === null) continue
    // A probability outside (0, 1) is not a price on either venue — a 0 or a 1
    // is a settled outcome, and the book should be empty by then.
    if (price <= 0 || price >= 1 || size < 0) continue
    out.push([price, size])
  }
  return out
}

/** Epoch-ms stamp for a book frame, falling back to now. */
export function predictionBookTimestamp(book: PredictionOrderBookLike): number {
  return msTimestamp(book.timestamp)
}

// ── Utils ────────────────────────────────────────────────────────────────

/** Coerce to a finite number; ccxt mixes numeric and string money fields. */
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
 * Kept local (rather than shared with the ccxt-connector, where it is private)
 * because `predictionBookTimestamp` needs it: Kalshi's REST rows are
 * seconds-scale in several places and its candlestick cursor is seconds
 * throughout, so passing a seconds value through would fail `isMsTimestamp` and
 * drop the frame.
 */
function msTimestamp(value: unknown): number {
  const parsed = num(value)
  if (parsed === null || parsed <= 0) return Date.now()
  if (parsed < 1_000_000_000_000) return Math.round(parsed * 1000)
  return Math.round(parsed)
}
