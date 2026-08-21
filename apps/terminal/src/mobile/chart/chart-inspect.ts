// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Reading a bar with a finger — the arithmetic behind the inspect crosshair.
 *
 * The chart engine draws its crosshair from `pointermove`, which on a phone
 * only ever fires while a finger is already dragging the chart. So a touch
 * device had no way at all to ask "what was the price here": panning moved the
 * bars, and holding still selected the price readout as if it were an article.
 * The phone's answer is a held crosshair — press and hold to raise it, drag to
 * scrub it along the series, and it stays put on release so the hand is not
 * covering the number it just asked for.
 *
 * Everything here is pure so the parts that are easy to get quietly wrong —
 * which bar an x lands on, where a label clamps at the edge of the plot, what
 * a hold is as opposed to a pan — are testable without a chart or a finger.
 * The gesture itself lives in `use-chart-inspect.ts` and the paint in
 * `chart-inspector.tsx`.
 */
import { RETICLE_FINGER_OFFSET_Y, clampToPlot } from './drawing-placement'
import type { PlacementFrame, ReticlePoint } from './drawing-placement'
import type { ChartBar, Timeframe } from '@pairlens/fast-financial-charts/types'

/**
 * How long a finger has to stay put before the crosshair comes up.
 *
 * Short enough that it does not feel like waiting, long enough to clear a
 * flick: a scroll gesture on a phone commits inside ~120ms, and the iOS
 * long-press recognizer itself fires at 500ms, which reads as sluggish for a
 * gesture whose whole job is to answer a question.
 */
export const INSPECT_HOLD_MS = 340

/**
 * Travel that turns a hold into a pan, in px.
 *
 * The same 10px the tap-to-dismiss layer uses (`TAP_SLOP_PX` in
 * `mobile-chart-surface.tsx`) — one number for "the finger did not move" across
 * the surface.
 */
export const INSPECT_SLOP_PX = 10

/** A finger is a contact patch, not a point: the crosshair floats above it. */
export const INSPECT_FINGER_OFFSET_Y = RETICLE_FINGER_OFFSET_Y

/** Did the finger travel far enough to mean "pan" rather than "hold"? */
export function exceedsSlop(
  from: ReticlePoint,
  to: ReticlePoint,
  slop: number = INSPECT_SLOP_PX,
): boolean {
  return Math.abs(to.x - from.x) > slop || Math.abs(to.y - from.y) > slop
}

/**
 * Where the crosshair sits for a touch at `touch`.
 *
 * `snapY` is the y of the hovered bar's close, or null. In magnet mode — the
 * shipped default, and the same control that drives drawing snap — the
 * horizontal line rides the series and the finger offset is not needed,
 * because the line is nowhere near the fingertip anyway. In free mode the line
 * floats above the finger so the hand never covers it.
 */
export function inspectPoint(
  touch: ReticlePoint,
  frame: PlacementFrame,
  snapY: number | null,
): ReticlePoint {
  return clampToPlot(
    {
      x: touch.x,
      y: snapY ?? touch.y - INSPECT_FINGER_OFFSET_Y,
    },
    frame,
  )
}

/**
 * The bar with this exact timestamp, by binary search.
 *
 * `coordinateToTime` already snaps an x to a bar's ts, so this is a lookup and
 * not a nearest-match: an exact miss means the bars moved under the crosshair
 * between the two reads and the caller should draw nothing rather than a
 * neighbour's prices.
 */
export function findBarByTs(
  bars: ReadonlyArray<ChartBar>,
  ts: number,
): ChartBar | null {
  let low = 0
  let high = bars.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const at = bars[mid]
    if (at.ts === ts) return at
    if (at.ts < ts) low = mid + 1
    else high = mid - 1
  }
  return null
}

export type BarMove = {
  absolute: number
  percent: number
  /** Close at or above open. Flat counts as up, as it does everywhere else. */
  up: boolean
}

/** A bar's own move, open to close — what the legend's percentage means. */
export function barMove(bar: ChartBar): BarMove | null {
  if (!Number.isFinite(bar.open) || bar.open === 0) return null
  const absolute = bar.close - bar.open
  return {
    absolute,
    percent: (absolute / bar.open) * 100,
    up: bar.close >= bar.open,
  }
}

/**
 * Left edge of a label of `width` centred on `centre`, kept inside the plot.
 *
 * A time label half off the screen is the one thing worse than no time label,
 * and at the right-hand edge — where the newest bars are, and where a finger
 * lands most often — that is exactly what centring alone produces.
 */
export function labelLeft(
  centre: number,
  width: number,
  plotWidth: number,
  gutter = 4,
): number {
  const max = Math.max(gutter, plotWidth - width - gutter)
  return Math.min(Math.max(centre - width / 2, gutter), max)
}

/**
 * A bar's volume, in the units the base asset is quoted in.
 *
 * `formatAmount` is the app's shared asset formatter and it is wrong here: it
 * prints four decimals below 1000, so a quiet 15m candle read "Vol 174.4869" —
 * four digits of precision nobody asked for, on the one number in the legend
 * that is an order of magnitude rather than a price.
 */
export function formatVolume(volume: number): string {
  if (!Number.isFinite(volume) || volume < 0) return '—'
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`
  if (volume >= 10_000) return `${(volume / 1_000).toFixed(1)}K`
  if (volume >= 100) return Math.round(volume).toLocaleString()
  if (volume >= 1) return volume.toFixed(2)
  if (volume === 0) return '0'
  return volume.toPrecision(3)
}

/**
 * Does this timeframe's label need a clock?
 *
 * A daily bar is a date; printing "Jul 3, 00:00" for it states a precision the
 * bar does not have. Weekly and monthly are the same case.
 */
export function showsClock(timeframe: Timeframe): boolean {
  return (
    timeframe !== '1d' &&
    timeframe !== '3d' &&
    timeframe !== '1w' &&
    timeframe !== '1M'
  )
}
