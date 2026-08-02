// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'

/** Rolling highest high over lookback window. NaN where window is incomplete. */
export function highestHigh(
  candles: ReadonlyArray<Candle>,
  lookback: number,
): Array<number> {
  const len = candles.length
  if (len === 0 || lookback <= 0) return []

  const result = new Array<number>(len).fill(NaN)
  for (let i = lookback - 1; i < len; i++) {
    let max = -Infinity
    for (let j = i - lookback + 1; j <= i; j++) {
      if (candles[j].high > max) max = candles[j].high
    }
    result[i] = max
  }
  return result
}

/** Highest high of the last `lookback` candles. */
export function highestHighLast(
  candles: ReadonlyArray<Candle>,
  lookback: number,
): number {
  const len = candles.length
  if (len === 0 || lookback <= 0) return NaN

  const start = Math.max(0, len - lookback)
  let max = -Infinity
  for (let i = start; i < len; i++) {
    if (candles[i].high > max) max = candles[i].high
  }
  return max
}

/** Rolling lowest low over lookback window. NaN where window is incomplete. */
export function lowestLow(
  candles: ReadonlyArray<Candle>,
  lookback: number,
): Array<number> {
  const len = candles.length
  if (len === 0 || lookback <= 0) return []

  const result = new Array<number>(len).fill(NaN)
  for (let i = lookback - 1; i < len; i++) {
    let min = Infinity
    for (let j = i - lookback + 1; j <= i; j++) {
      if (candles[j].low < min) min = candles[j].low
    }
    result[i] = min
  }
  return result
}

/** Lowest low of the last `lookback` candles. */
export function lowestLowLast(
  candles: ReadonlyArray<Candle>,
  lookback: number,
): number {
  const len = candles.length
  if (len === 0 || lookback <= 0) return NaN

  const start = Math.max(0, len - lookback)
  let min = Infinity
  for (let i = start; i < len; i++) {
    if (candles[i].low < min) min = candles[i].low
  }
  return min
}
