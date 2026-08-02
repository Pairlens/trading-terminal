// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { emaScalar } from '../indicators/ema'
import { atrLast } from '../indicators/atr'
import { volumeMaLast } from '../indicators/volume-ma'
import type { Candle, Regime, SignalPayload } from '@pairlens/shared/types'

const EMA_PERIOD = 20
const ATR_PERIOD = 14
const ATR_MULTIPLIER = 2.0
const VOLUME_FACTOR = 1.2

export function meanReversionStrategy(
  candles: ReadonlyArray<Candle>,
  regime: Regime,
  precomputedAtrLast?: number,
): SignalPayload | null {
  // Need EMA_PERIOD + ATR_PERIOD + 5 = 39 candles
  if (candles.length < EMA_PERIOD + ATR_PERIOD + 5) return null

  const current = candles[candles.length - 1]

  const emaVal = emaScalar(candles, EMA_PERIOD)
  const atrVal = precomputedAtrLast ?? atrLast(candles, ATR_PERIOD)

  if (Number.isNaN(emaVal) || Number.isNaN(atrVal)) return null

  const upperBand = emaVal + ATR_MULTIPLIER * atrVal
  const lowerBand = emaVal - ATR_MULTIPLIER * atrVal

  let direction: 'long' | 'short' | null = null

  if (current.close < lowerBand && current.close > current.open) {
    // Bounce from oversold
    direction = 'long'
  } else if (current.close > upperBand && current.close < current.open) {
    // Rejection from overbought
    direction = 'short'
  }

  if (!direction) return null

  // Confidence calculation
  let confidence = 0.5
  if (regime === 'chop') confidence += 0.2

  // Deviation bonus
  if (atrVal > 0) {
    const deviation =
      direction === 'long'
        ? (lowerBand - current.close) / atrVal
        : (current.close - upperBand) / atrVal
    confidence += Math.min(deviation * 0.1, 0.2)
  }

  // Volume confirmation bonus
  const volMa = volumeMaLast(candles, EMA_PERIOD)
  if (!Number.isNaN(volMa) && current.volume > volMa * VOLUME_FACTOR) {
    confidence += 0.1
  }

  confidence = Math.max(0, Math.min(1, confidence))

  return {
    strategy: 'mean_reversion',
    direction,
    confidence,
    regime,
    ema: emaVal,
    atr: atrVal,
    upperBand,
    lowerBand,
  }
}
