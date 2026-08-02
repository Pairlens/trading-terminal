// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'

/** Full EMA series, length-matched to input. NaN for periods before seed. */
export function ema(
  candles: ReadonlyArray<Candle>,
  period: number,
): Array<number> {
  const len = candles.length
  if (len === 0 || period <= 0) return []

  const result = new Array<number>(len).fill(NaN)
  if (len < period) return result

  const multiplier = 2 / (period + 1)

  // Seed: SMA of first `period` closes
  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i].close
  let prev = sum / period
  result[period - 1] = prev

  for (let i = period; i < len; i++) {
    prev = (candles[i].close - prev) * multiplier + prev
    result[i] = prev
  }

  return result
}

/** Last `count` EMA values. */
export function emaLast(
  candles: ReadonlyArray<Candle>,
  period: number,
  count: number,
): Array<number> {
  const full = ema(candles, period)
  return full.slice(-count)
}

/** Single final EMA value. */
export function emaScalar(
  candles: ReadonlyArray<Candle>,
  period: number,
): number {
  const len = candles.length
  if (len < period || period <= 0) return NaN

  const multiplier = 2 / (period + 1)

  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i].close
  let prev = sum / period

  for (let i = period; i < len; i++) {
    prev = (candles[i].close - prev) * multiplier + prev
  }

  return prev
}
