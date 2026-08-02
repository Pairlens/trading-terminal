// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'

/**
 * Aggregate chronological source candles into target-timeframe buckets.
 *
 * Bucketing: bucketTs = floor((ts - anchor) / targetTfMs) * targetTfMs + anchor
 * (default anchor 0 → epoch-aligned buckets).
 *
 * Per bucket: open = first open, high = max high, low = min low,
 * close = last close, volume = sum. The trailing partial bucket is included.
 *
 * `sourceTfMs` is used only for input validation — the target timeframe must
 * be a strictly larger multiple-friendly duration than the source. Gaps in
 * the source series simply produce no bucket (no synthetic fill).
 */
export function aggregateCandles(
  candles: Array<Candle>,
  sourceTfMs: number,
  targetTfMs: number,
  anchor: number = 0,
): Array<Candle> {
  if (
    !Number.isFinite(sourceTfMs) ||
    sourceTfMs <= 0 ||
    !Number.isFinite(targetTfMs) ||
    targetTfMs <= 0
  ) {
    throw new Error(
      `aggregateCandles: invalid timeframes (source=${sourceTfMs}, target=${targetTfMs})`,
    )
  }
  if (targetTfMs < sourceTfMs) {
    throw new Error(
      `aggregateCandles: target timeframe (${targetTfMs}ms) must be >= source timeframe (${sourceTfMs}ms)`,
    )
  }
  if (candles.length === 0) return []

  const out: Array<Candle> = []
  let current: Candle | null = null

  for (const candle of candles) {
    const bucketTs =
      Math.floor((candle.ts - anchor) / targetTfMs) * targetTfMs + anchor

    if (current === null || current.ts !== bucketTs) {
      // New bucket — flush the previous one and start fresh.
      if (current !== null) out.push(current)
      current = {
        ts: bucketTs,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }
      continue
    }

    if (candle.high > current.high) current.high = candle.high
    if (candle.low < current.low) current.low = candle.low
    current.close = candle.close
    current.volume += candle.volume
  }

  // Include the partial trailing bucket.
  if (current !== null) out.push(current)

  return out
}
