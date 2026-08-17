// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "When did this question change its mind?"
 *
 * The probability history of an event contract is mostly flat with a handful
 * of step changes in it, and those steps are the whole story: a jobs print, a
 * ruling, a withdrawal. A chart shows them, but a chart does not say WHEN or
 * BY HOW MUCH, and a timeline that has to be read off a line is not a timeline.
 *
 * The detector is a rolling window with greedy non-overlap. Every window of
 * `windowBars` is scored by its net displacement, the biggest is taken, and
 * every window it touches is removed before the next is taken. That last rule
 * is the one a user notices when it breaks: without it a single 12-point rally
 * reports as six overlapping 12-point moves an hour apart, and the pane reads
 * as a market in permanent turmoil.
 *
 * Net displacement, not peak-to-trough: a spike that fully retraced inside the
 * window did not move the market's mind, and a timeline that claims it did
 * sends the reader looking for news that explains nothing.
 *
 * Both endpoints are read as a three-bar median rather than a bare close, for
 * the same reason. A thin event contract prints the occasional 72¢ on a book
 * that is 50¢ either side of it, and a window anchored on that print reports a
 * 22-point collapse that never happened.
 */
import type { Candle } from '@pairlens/shared/types'

export type ProbabilityMove = {
  /** Close timestamp of the bar the window opened on. */
  startTs: number
  /** Close timestamp of the bar the window closed on. */
  endTs: number
  /** Probability level at the start of the window, collateral units (0..1). */
  from: number
  /** Probability level at the end of the window. `to - from` IS the delta. */
  to: number
  /** Signed move in cents — what the row prints. */
  deltaCents: number
  /** Contracts traded inside the window, when the venue reports volume. */
  volume: number
}

export type MoveOptions = {
  /** Bars the window spans. See `movesWindowBars`. */
  windowBars: number
  /** Smallest move worth a row, in cents. */
  minDeltaCents: number
  /** Rows to keep, biggest first, before the result is re-sorted by time. */
  limit: number
}

/**
 * How many bars a "move" should span, for a series of unknown timeframe.
 *
 * The pane reads whatever timeframe the chart is on, so a fixed bar count
 * means a 6-minute window on 1m and a six-day window on 1d. The target is a
 * day of wall-clock either way, because that is the unit a prediction market's
 * news cycle runs in, clamped so a 1d series still gets a usable window and a
 * 1m series does not get a 1440-bar one.
 *
 * Also capped at a quarter of the series: a window longer than that leaves
 * room for at most three non-overlapping moves, which is a timeline that
 * cannot show a busy week.
 */
export function movesWindowBars(spacingMs: number, count: number): number {
  const byQuarter = Math.floor(count / 4)
  if (!Number.isFinite(spacingMs) || spacingMs <= 0) {
    return Math.max(2, Math.min(6, byQuarter))
  }
  const target = Math.round(86_400_000 / spacingMs)
  return Math.max(2, Math.min(24, target, Math.max(2, byQuarter)))
}

/** Median gap between bars — robust to the one long gap a halted market leaves. */
export function candleSpacingMs(candles: Array<Candle>): number {
  if (candles.length < 2) return 0
  const gaps: Array<number> = []
  for (let i = 1; i < candles.length; i++) {
    const gap = candles[i].ts - candles[i - 1].ts
    if (gap > 0) gaps.push(gap)
  }
  if (gaps.length === 0) return 0
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

/**
 * The moves worth naming, newest first.
 *
 * Candles are assumed oldest-first, which is what every consumer of the candle
 * buffer already receives; a series shorter than one window has no move to
 * report and returns empty rather than degenerating to bar-to-bar noise.
 */
export function detectProbabilityMoves(
  candles: Array<Candle>,
  { windowBars, minDeltaCents, limit }: MoveOptions,
): Array<ProbabilityMove> {
  const span = Math.max(1, Math.floor(windowBars))
  if (candles.length <= span || limit <= 0) return []

  const level = smoothedCloses(candles)
  const candidates: Array<ProbabilityMove & { magnitude: number }> = []
  for (let end = span; end < candles.length; end++) {
    const start = end - span
    const from = level[start]
    const to = level[end]
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    const deltaCents = (to - from) * 100
    const magnitude = Math.abs(deltaCents)
    if (magnitude < minDeltaCents) continue
    let volume = 0
    for (let i = start + 1; i <= end; i++) {
      const bar = candles[i].volume
      if (Number.isFinite(bar)) volume += bar
    }
    candidates.push({
      startTs: candles[start].ts,
      endTs: candles[end].ts,
      from,
      to,
      // One decimal: a 6.42¢ move and a 6.38¢ move are the same event, and a
      // column that disagrees about its decimal count does not align.
      deltaCents: Math.round(deltaCents * 10) / 10,
      volume,
      magnitude,
    })
  }

  // Biggest first, then greedily reject anything that overlaps an accepted
  // window. Ties broken by recency so a flat market's identical windows report
  // the most recent one rather than an arbitrary one.
  candidates.sort((a, b) => b.magnitude - a.magnitude || b.endTs - a.endTs)

  const taken: Array<ProbabilityMove> = []
  for (const candidate of candidates) {
    if (taken.length >= limit) break
    const overlaps = taken.some(
      (move) =>
        candidate.startTs < move.endTs && move.startTs < candidate.endTs,
    )
    if (overlaps) continue
    const { magnitude: _magnitude, ...move } = candidate
    taken.push(move)
  }

  return taken.sort((a, b) => b.endTs - a.endTs)
}

/**
 * Each bar's close replaced by the median of itself and its neighbours.
 *
 * A median rather than a mean because the thing being suppressed is one wild
 * value, and a mean carries a third of it through. Bars with no finite close
 * are dropped from their own neighbourhood; a bar with no finite neighbour at
 * all stays NaN and every window touching it is skipped.
 */
function smoothedCloses(candles: Array<Candle>): Array<number> {
  return candles.map((_, i) => {
    const window: Array<number> = []
    for (
      let j = Math.max(0, i - 1);
      j <= Math.min(candles.length - 1, i + 1);
      j++
    ) {
      const close = candles[j].close
      if (Number.isFinite(close)) window.push(close)
    }
    if (window.length === 0) return Number.NaN
    window.sort((a, b) => a - b)
    const mid = window.length >> 1
    return window.length % 2 === 1
      ? window[mid]
      : (window[mid - 1] + window[mid]) / 2
  })
}
