// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'
import type { OrderbookLevel, TickerSnapshot } from './types'

// ── Timestamp unit guard ──
//
// All connectors MUST normalize timestamps to epoch MILLISECONDS before
// emitting Candle/Ticker/Order data. A plausible ms timestamp falls between
// 2001-09-09 (1e12) and ~2286 (1e13). Seconds-epoch values (~1.7e9) and
// failed ISO-string parses fall outside this window, so this check
// mechanically catches the single most common cross-connector bug:
// emitting seconds instead of milliseconds.

const MIN_MS_TS = 1_000_000_000_000 // 2001-09-09T01:46:40Z
const MAX_MS_TS = 10_000_000_000_000 // 2286-11-20T17:46:40Z

/** True when `ts` is a finite epoch-millisecond timestamp in a plausible range. */
export function isMsTimestamp(ts: number): boolean {
  return Number.isFinite(ts) && ts >= MIN_MS_TS && ts <= MAX_MS_TS
}

export type ValidationResult = { ok: boolean; errors: Array<string> }

const ok: ValidationResult = { ok: true, errors: [] }

function fail(errors: Array<string>): ValidationResult {
  return { ok: false, errors }
}

function finitePositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

function finiteNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * Validate a normalized Candle against the canonical contract.
 * Checks: ts is epoch-ms, OHLC are finite positive, volume is finite
 * non-negative, and OHLC obey `low <= {open,close} <= high`.
 */
export function validateCandle(c: Candle): ValidationResult {
  const errors: Array<string> = []

  if (!isMsTimestamp(c.ts)) {
    errors.push(
      `ts ${c.ts} is not a plausible epoch-ms timestamp (seconds or unparsed?)`,
    )
  }
  for (const [k, v] of [
    ['open', c.open],
    ['high', c.high],
    ['low', c.low],
    ['close', c.close],
  ] as const) {
    if (!finitePositive(v))
      errors.push(`${k} ${v} is not a finite positive number`)
  }
  if (!finiteNonNegative(c.volume)) {
    errors.push(`volume ${c.volume} is not a finite non-negative number`)
  }

  // Only assert OHLC ordering when all four are valid numbers — otherwise the
  // comparisons are meaningless and would produce noisy duplicate errors.
  if (
    finitePositive(c.open) &&
    finitePositive(c.high) &&
    finitePositive(c.low) &&
    finitePositive(c.close)
  ) {
    if (c.high < Math.max(c.open, c.close, c.low)) {
      errors.push(`high ${c.high} is below open/close/low`)
    }
    if (c.low > Math.min(c.open, c.close, c.high)) {
      errors.push(`low ${c.low} is above open/close/high`)
    }
  }

  return errors.length ? fail(errors) : ok
}

/**
 * Validate a normalized TickerSnapshot against the canonical contract.
 * Checks: ts is epoch-ms, numeric fields finite, last/volume non-negative,
 * and bid <= ask when both are populated (0 means "not provided").
 */
export function validateTicker(t: TickerSnapshot): ValidationResult {
  const errors: Array<string> = []

  if (!isMsTimestamp(t.ts)) {
    errors.push(`ts ${t.ts} is not a plausible epoch-ms timestamp`)
  }
  for (const [k, v] of [
    ['last', t.last],
    ['bid', t.bid],
    ['ask', t.ask],
    ['high24h', t.high24h],
    ['low24h', t.low24h],
    ['volume24h', t.volume24h],
  ] as const) {
    if (!finiteNonNegative(v)) {
      errors.push(`${k} ${v} is not a finite non-negative number`)
    }
  }
  if (typeof t.change24h !== 'number' || !Number.isFinite(t.change24h)) {
    errors.push(`change24h ${t.change24h} is not a finite number`)
  }
  if (t.bid > 0 && t.ask > 0 && t.bid > t.ask) {
    errors.push(`crossed book: bid ${t.bid} > ask ${t.ask}`)
  }

  return errors.length ? fail(errors) : ok
}

/**
 * Validate one side of an orderbook (bids or asks). Each level must be a
 * `[price, size]` pair of finite numbers with price > 0 and size >= 0.
 */
export function validateOrderbookSide(
  levels: Array<OrderbookLevel>,
  side: 'bids' | 'asks',
): ValidationResult {
  const errors: Array<string> = []
  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i]
    if (!Array.isArray(lvl) || lvl.length !== 2) {
      errors.push(`${side}[${i}] is not a [price, size] pair`)
      continue
    }
    const [price, size] = lvl
    if (!finitePositive(price))
      errors.push(`${side}[${i}] price ${price} invalid`)
    if (!finiteNonNegative(size))
      errors.push(`${side}[${i}] size ${size} invalid`)
  }
  return errors.length ? fail(errors) : ok
}
