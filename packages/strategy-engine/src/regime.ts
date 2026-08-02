// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { atr } from './indicators/atr'
import type { Candle, Regime } from '@pairlens/shared/types'

const ATR_PERIOD = 14
const SMA_LOOKBACK = 20
const TREND_THRESHOLD = 1.5

/** Detect regime from pre-computed ATR values. */
export function detectRegimeWithAtr(
  atrValues: ReadonlyArray<number>,
): Regime | null {
  // Find last valid ATR
  let current = NaN
  for (let i = atrValues.length - 1; i >= 0; i--) {
    if (!Number.isNaN(atrValues[i])) {
      current = atrValues[i]!
      break
    }
  }
  if (Number.isNaN(current)) return null

  // SMA of last 20 valid ATR values
  const valid: Array<number> = []
  for (
    let i = atrValues.length - 1;
    i >= 0 && valid.length < SMA_LOOKBACK;
    i--
  ) {
    if (!Number.isNaN(atrValues[i])) valid.push(atrValues[i])
  }
  if (valid.length < SMA_LOOKBACK) return null

  const sma = valid.reduce((a, b) => a + b, 0) / valid.length
  return current > sma * TREND_THRESHOLD ? 'trend' : 'chop'
}

/** Detect regime from candles. Requires at least 34 candles. */
export function detectRegime(candles: ReadonlyArray<Candle>): Regime | null {
  if (candles.length < ATR_PERIOD + SMA_LOOKBACK) return null
  const atrValues = atr(candles, ATR_PERIOD)
  return detectRegimeWithAtr(atrValues)
}
