// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'

/** SMA of volume. NaN for first `period - 1` entries. */
export function volumeMa(
  candles: ReadonlyArray<Candle>,
  period: number,
): Array<number> {
  const len = candles.length
  if (len === 0 || period <= 0) return []

  const result = new Array<number>(len).fill(NaN)
  if (len < period) return result

  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i].volume
  result[period - 1] = sum / period

  for (let i = period; i < len; i++) {
    sum += candles[i].volume - candles[i - period].volume
    result[i] = sum / period
  }

  return result
}

/** Single final volume MA value. */
export function volumeMaLast(
  candles: ReadonlyArray<Candle>,
  period: number,
): number {
  const len = candles.length
  if (len < period || period <= 0) return NaN

  let sum = 0
  for (let i = len - period; i < len; i++) sum += candles[i].volume
  return sum / period
}
