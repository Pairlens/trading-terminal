// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle, Timeframe } from './types'

/**
 * Duration of every interval in the `Timeframe` union, ascending.
 *
 * Exported because "which intervals exist and how long is each" was being
 * re-declared wherever it was needed (the terminal's venue clamp, the
 * provider's default list, the indicator request cache). A `Timeframe` added
 * to the union without a row here is a type error, which is the point: a copy
 * would just silently not know about it.
 */
export const TIMEFRAME_TO_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
  // Calendar months vary in length; 30 days is an approximation used only
  // for bucketing/labels — exchanges own the true monthly candle boundaries.
  '1M': 30 * 24 * 60 * 60_000,
}

/** Every interval in the union, shortest first. Derived, never hand-listed. */
export const TIMEFRAMES = Object.keys(TIMEFRAME_TO_MS) as Array<Timeframe>

/** True when a loose string is one of the union's intervals. */
export const isTimeframe = (value: unknown): value is Timeframe =>
  typeof value === 'string' && value in TIMEFRAME_TO_MS

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const timeframeToMs = (timeframe: Timeframe): number => {
  const value = TIMEFRAME_TO_MS[timeframe]
  if (value) {
    return value
  }
  throw new Error(`Unsupported timeframe: ${timeframe}`)
}

export const expectedLatestClosedTs = (
  nowMs: number,
  timeframeMs: number,
): number => {
  if (
    !Number.isFinite(nowMs) ||
    nowMs <= 0 ||
    !Number.isFinite(timeframeMs) ||
    timeframeMs <= 0
  ) {
    return 0
  }
  const boundary = Math.floor(nowMs / timeframeMs) * timeframeMs
  return Math.max(0, boundary - timeframeMs)
}

export const latestTs = (candles: Array<Candle>): number | null => {
  if (candles.length === 0) {
    return null
  }

  let latest: number | null = null
  for (const candle of candles) {
    if (!isFiniteNumber(candle.ts)) {
      continue
    }
    if (latest === null || candle.ts > latest) {
      latest = candle.ts
    }
  }

  return latest
}

export const isContiguousSeries = (
  candles: Array<Candle>,
  timeframeMs: number,
): boolean => {
  if (candles.length <= 1) {
    return true
  }

  if (!Number.isFinite(timeframeMs) || timeframeMs <= 0) {
    return false
  }

  const ordered = candles
    .map((candle) => candle.ts)
    .filter(isFiniteNumber)
    .sort((left, right) => left - right)

  if (ordered.length <= 1) {
    return true
  }

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] - ordered[index - 1] !== timeframeMs) {
      return false
    }
  }

  return true
}
