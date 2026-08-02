// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { atr, atrLast } from './indicators/atr'
import { detectRegimeWithAtr } from './regime'
import { breakoutStrategy } from './strategies/breakout'
import { emaPullbackStrategy } from './strategies/ema-pullback'
import { meanReversionStrategy } from './strategies/mean-reversion'
import type { Candle, Regime, SignalPayload } from '@pairlens/shared/types'

/**
 * Compute signals with regime detection. Returns both regime and best signal.
 * ATR(14) is computed once and shared across regime detection and mean reversion.
 */
export function computeSignalsWithRegime(
  candles: ReadonlyArray<Candle>,
): [Regime | null, SignalPayload | null] {
  if (candles.length < 22) return [null, null]

  // Compute ATR once, share across regime + mean reversion
  const atrValues = atr(candles, 14)
  const regime = detectRegimeWithAtr(atrValues) ?? 'chop'

  const lastAtr = atrLast(candles, 14)

  const candidates: Array<SignalPayload> = []

  const breakout = breakoutStrategy(candles, regime)
  if (breakout) candidates.push(breakout)

  const pullback = emaPullbackStrategy(candles, regime)
  if (pullback) candidates.push(pullback)

  const meanRev = meanReversionStrategy(candles, regime, lastAtr)
  if (meanRev) candidates.push(meanRev)

  if (candidates.length === 0) return [regime, null]

  // Pick highest confidence
  let best = candidates[0]
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].confidence > best.confidence) best = candidates[i]!
  }

  return [regime, best]
}

/** Compute signals, returning only the best signal (or null). */
export function computeSignals(
  candles: ReadonlyArray<Candle>,
): SignalPayload | null {
  return computeSignalsWithRegime(candles)[1]
}

/**
 * Scan backwards through last `lookback` candle positions to find the most
 * recent signal. Used after backfill so clients see a signal immediately.
 * Minimum: 39 candles required (MR_EMA_PERIOD + MR_ATR_PERIOD + 5).
 */
export function findRecentSignal(
  candles: ReadonlyArray<Candle>,
  lookback: number,
): SignalPayload | null {
  const minRequired = 39
  if (candles.length < minRequired) return null

  const start = Math.max(minRequired, candles.length - lookback)
  for (let end = candles.length; end >= start; end--) {
    const slice = candles.slice(0, end)
    const signal = computeSignals(slice)
    if (signal) return signal
  }

  return null
}
