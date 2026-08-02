// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'

/** True Range for candle at index i. */
function trueRange(candles: ReadonlyArray<Candle>, i: number): number {
  const c = candles[i]
  const hl = c.high - c.low
  if (i === 0) return hl
  const prevClose = candles[i - 1].close
  const hc = Math.abs(c.high - prevClose)
  const lc = Math.abs(c.low - prevClose)
  return Math.max(hl, hc, lc)
}

/** Full ATR series. NaN for first `period` entries. Uses Wilder's smoothing. */
export function atr(
  candles: ReadonlyArray<Candle>,
  period: number,
): Array<number> {
  const len = candles.length
  if (len === 0 || period <= 0) return []

  const result = new Array<number>(len).fill(NaN)
  if (len <= period) return result

  // Initial ATR: SMA of first `period` true ranges (at index `period`)
  let sum = 0
  for (let i = 1; i <= period; i++) sum += trueRange(candles, i)
  let prev = sum / period
  result[period] = prev

  // Wilder's smoothing
  for (let i = period + 1; i < len; i++) {
    const tr = trueRange(candles, i)
    prev = (prev * (period - 1) + tr) / period
    result[i] = prev
  }

  return result
}

/** Single final ATR value. */
export function atrLast(
  candles: ReadonlyArray<Candle>,
  period: number,
): number {
  const full = atr(candles, period)
  for (let i = full.length - 1; i >= 0; i--) {
    if (!Number.isNaN(full[i])) return full[i]
  }
  return NaN
}

/** Last `count` ATR values. */
export function atrLastN(
  candles: ReadonlyArray<Candle>,
  period: number,
  count: number,
): Array<number> {
  const full = atr(candles, period)
  return full.slice(-count)
}
