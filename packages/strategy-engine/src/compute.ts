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

/** A signal occurrence found by scanning historical bars. */
export interface DetectedSignal {
  /** Payload as evaluated on the most recent bar of the run. */
  signal: SignalPayload
  /** Bar timestamp where the signal first appeared (the detection moment). */
  firstTs: number
  /** Most recent bar timestamp where the signal still evaluated. */
  lastTs: number
  /** The signal still evaluates on the newest scanned bar. */
  active: boolean
}

export interface SignalScan {
  regime: Regime | null
  /** How many bar positions were actually evaluated. */
  scannedBars: number
  /** Detected signal runs, newest-first. */
  signals: Array<DetectedSignal>
}

/**
 * Scan the last `lookback` bar positions and return every signal occurrence,
 * collapsing consecutive bars where the same strategy+direction keeps firing
 * into a single run. Lets clients show "what fired recently and when" from a
 * fresh history backfill instead of waiting for a live bar to trigger.
 * Minimum: 39 candles required (MR_EMA_PERIOD + MR_ATR_PERIOD + 5).
 */
export function scanSignals(
  candles: ReadonlyArray<Candle>,
  lookback: number,
): SignalScan {
  const [regime] = computeSignalsWithRegime(candles)

  const minRequired = 39
  if (candles.length < minRequired) {
    return { regime, scannedBars: 0, signals: [] }
  }

  const start = Math.max(minRequired, candles.length - lookback + 1)
  const signals: Array<DetectedSignal> = []
  let run: DetectedSignal | null = null

  for (let end = start; end <= candles.length; end++) {
    const signal = computeSignals(candles.slice(0, end))
    const bar = candles[end - 1]
    if (signal) {
      if (
        run &&
        run.signal.strategy === signal.strategy &&
        run.signal.direction === signal.direction
      ) {
        run.signal = signal
        run.lastTs = bar.ts
      } else {
        if (run) signals.push(run)
        run = { signal, firstTs: bar.ts, lastTs: bar.ts, active: false }
      }
    } else if (run) {
      signals.push(run)
      run = null
    }
  }
  if (run) {
    run.active = true
    signals.push(run)
  }

  signals.reverse()
  return { regime, scannedBars: candles.length - start + 1, signals }
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
