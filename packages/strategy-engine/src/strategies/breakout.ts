// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { highestHighLast, lowestLowLast } from '../indicators/extremes'
import { volumeMaLast } from '../indicators/volume-ma'
import type { Candle, Regime, SignalPayload } from '@pairlens/shared/types'

const LOOKBACK = 20
const VOLUME_FACTOR = 1.5

export function breakoutStrategy(
  candles: ReadonlyArray<Candle>,
  regime: Regime,
): SignalPayload | null {
  // Need at least LOOKBACK + 2 candles (lookback prior + prev + current)
  if (candles.length < LOOKBACK + 2) return null

  const current = candles[candles.length - 1]
  // Prior candles excluding current
  const prior = candles.slice(0, -1)

  const hh = highestHighLast(prior, LOOKBACK)
  const ll = lowestLowLast(prior, LOOKBACK)
  const volMa = volumeMaLast(candles, LOOKBACK)

  if (Number.isNaN(hh) || Number.isNaN(ll) || Number.isNaN(volMa)) return null

  const volConfirmed = current.volume > volMa * VOLUME_FACTOR
  const range = hh - ll

  let direction: 'long' | 'short' | null = null

  if (current.close > hh && volConfirmed) {
    direction = 'long'
  } else if (current.close < ll && volConfirmed) {
    direction = 'short'
  }

  if (!direction) return null

  // Confidence calculation
  let confidence = 0.5
  if (regime === 'trend') confidence += 0.2
  if (volConfirmed) confidence += 0.2

  // Breakout strength bonus
  if (range > 0) {
    const excess =
      direction === 'long' ? current.close - hh : ll - current.close
    const strength = excess / range
    confidence += Math.min(strength * 0.1, 0.1)
  }

  confidence = Math.max(0, Math.min(1, confidence))

  return {
    strategy: 'breakout',
    direction,
    confidence,
    regime,
    hh,
    ll,
    volConfirmed,
  }
}
