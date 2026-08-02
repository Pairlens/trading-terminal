// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { emaLast, emaScalar } from '../indicators/ema'
import type { Candle, Regime, SignalPayload } from '@pairlens/shared/types'

const FAST_PERIOD = 9
const SLOW_PERIOD = 21

export function emaPullbackStrategy(
  candles: ReadonlyArray<Candle>,
  regime: Regime,
): SignalPayload | null {
  // Need enough candles for slow EMA + at least 2 data points for fast
  if (candles.length < SLOW_PERIOD + 5) return null

  const current = candles[candles.length - 1]
  const prev = candles[candles.length - 2]

  const [fastPrev, fastNow] = emaLast(candles, FAST_PERIOD, 2)
  const slowNow = emaScalar(candles, SLOW_PERIOD)

  if (
    fastPrev === undefined ||
    fastNow === undefined ||
    Number.isNaN(fastPrev) ||
    Number.isNaN(fastNow) ||
    Number.isNaN(slowNow)
  )
    return null

  const uptrend = fastNow > slowNow
  const downtrend = fastNow < slowNow

  let direction: 'long' | 'short' | null = null

  if (
    uptrend &&
    prev.low <= fastPrev * 1.002 && // touched EMA
    current.close > fastNow && // bounced above
    current.close > current.open // bullish candle
  ) {
    direction = 'long'
  } else if (
    downtrend &&
    prev.high >= fastPrev * 0.998 && // touched EMA
    current.close < fastNow && // rejected below
    current.close < current.open // bearish candle
  ) {
    direction = 'short'
  }

  if (!direction) return null

  // Confidence calculation
  let confidence = 0.5
  if (regime === 'trend') confidence += 0.2

  // EMA gap bonus
  const emaGap = Math.abs((fastNow - slowNow) / slowNow)
  if (emaGap > 0.01) confidence += 0.15

  // Candle body strength bonus
  const bodyRange = current.high - current.low
  if (bodyRange > 0) {
    const bodyStrength = Math.abs(current.close - current.open) / bodyRange
    if (bodyStrength > 0.6) confidence += 0.1
  }

  confidence = Math.max(0, Math.min(1, confidence))

  return {
    strategy: 'ema_pullback',
    direction,
    confidence,
    regime,
    fastEma: fastNow,
    slowEma: slowNow,
    emaGap,
  }
}
