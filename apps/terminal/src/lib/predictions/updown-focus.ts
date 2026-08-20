// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The arithmetic behind the focused up/down window: one asset, one clock, and
 * the tape running at the number it settles against.
 *
 * The scanner table beside this answers "which of thirteen windows is
 * mispriced". It is the right shape for that question and the wrong shape for
 * the one people actually open these contracts asking, which is "is BTC going
 * to be above 71,860 in four minutes". That question is a picture: a line, a
 * target, and the distance closing or opening between them.
 *
 * So this module is the geometry that picture needs. The pane keeps a rolling
 * buffer of sampled spot, seeded from minute candles so the chart has a shape
 * the moment it mounts rather than growing one from the right edge, and every
 * function here is pure over plain arrays for the same reason
 * `crypto-updown.ts` is: the y-domain rule that keeps the target line on
 * screen is worth testing against numbers, not against a rendered SVG.
 */

import type { Candle } from '@pairlens/shared/types'
import type { PredictionUpDownHorizon } from '@pairlens/shared/instrument-types'
import type { UpDownRow } from '@/lib/predictions/crypto-updown'

/** One point on the spot line. */
export type SpotPoint = { ts: number; price: number }

/**
 * The widest run-up the chart will draw, whatever the contract's own length.
 *
 * A fifteen-minute window fits whole. A daily one does not: 1,440 minute bars
 * is a request nobody wants and a line whose last four minutes — the only part
 * that decides anything — are three pixels wide. Ninety minutes is the
 * compromise, and the axis says what it is showing rather than implying the
 * whole window.
 */
export const MAX_CHART_SPAN_MS = 90 * 60_000

/** Minute bars asked for to seed the line. Covers `MAX_CHART_SPAN_MS`. */
export const CHART_SEED_BARS = 120

/**
 * How often the live tape is allowed to extend the line.
 *
 * One point a second. Fast enough to read as live, slow enough that a
 * fifteen-minute window is 900 points rather than the tens of thousands a
 * busy pair prints, and the chart is an SVG path re-laid-out on every one.
 */
export const SAMPLE_MS = 1_000

/**
 * Preferred order of the asset switcher.
 *
 * Fixed rather than sorted by volume, because the switcher is a place people
 * build muscle memory: a row of chips that reorders itself between renders is
 * a row you have to read every time. Anything the venues add that is not
 * listed here keeps its arrival order behind these.
 */
export const FOCUS_ASSET_ORDER: ReadonlyArray<string> = [
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'DOGE',
]

/** Distinct assets across the open windows, in switcher order. */
export function focusAssets(rows: ReadonlyArray<UpDownRow>): Array<string> {
  const seen: Array<string> = []
  for (const row of rows) {
    if (!seen.includes(row.meta.asset)) seen.push(row.meta.asset)
  }
  return seen.sort((a, b) => {
    const ai = FOCUS_ASSET_ORDER.indexOf(a)
    const bi = FOCUS_ASSET_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return seen.indexOf(a) - seen.indexOf(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

/**
 * The window the focus card shows: soonest to close, for the chosen asset and
 * horizon.
 *
 * Soonest, always, because that is the one with a book. Both venues list the
 * next several windows and every one but the first sits at a flat coin flip
 * with nothing behind it, so "the BTC hourly" means the one closing next and
 * never the one that opens in six hours.
 */
export function pickFocusRow(
  rows: ReadonlyArray<UpDownRow>,
  asset: string | null,
  horizon: PredictionUpDownHorizon | null,
): UpDownRow | null {
  let best: UpDownRow | null = null
  for (const row of rows) {
    if (asset !== null && row.meta.asset !== asset) continue
    if (horizon !== null && row.meta.horizon !== horizon) continue
    if (!best || row.msToClose < best.msToClose) best = row
  }
  return best
}

/**
 * What one contract pays per unit staked, Kalshi's own framing.
 *
 * A price of 8¢ is a probability AND an 11.5x payout, and the second one is
 * what makes a long shot legible: nobody reads 0.08 as "twelve to one". Undefined
 * below a cent, where the multiple runs away to numbers that describe rounding
 * rather than odds.
 */
export function payoutMultiple(price: number | undefined): number | undefined {
  if (price === undefined || !Number.isFinite(price)) return undefined
  if (price < 0.01 || price > 1) return undefined
  return 1 / price
}

/**
 * How much of the window has run, 0..1.
 *
 * Clamped at both ends: a row whose open is in the future (the venue listed the
 * next window early) reads as not started rather than as negative progress.
 */
export function windowProgress(row: UpDownRow, now: number): number {
  const span = row.meta.closesMs - row.meta.opensMs
  if (!(span > 0)) return 0
  const elapsed = now - row.meta.opensMs
  return Math.min(Math.max(elapsed / span, 0), 1)
}

/** Which side of the target the tape is on. `at` only on an exact match. */
export function sideOfTarget(
  spot: number | undefined,
  reference: number | undefined,
): 'above' | 'below' | 'at' | 'unknown' {
  if (spot === undefined || reference === undefined) return 'unknown'
  if (spot > reference) return 'above'
  if (spot < reference) return 'below'
  return 'at'
}

/**
 * Minute candles into the seed line, clipped to the window the chart draws.
 *
 * Closes rather than opens: a close is where the tape actually was at the end
 * of that minute, and the last seeded point has to sit continuous with the
 * first live sample or the line steps by a bar's range at the join.
 */
export function seedSeries(
  candles: ReadonlyArray<Candle> | undefined,
  fromMs: number,
  toMs: number,
): Array<SpotPoint> {
  if (!candles || candles.length === 0) return []
  const out: Array<SpotPoint> = []
  for (const candle of candles) {
    if (candle.ts < fromMs || candle.ts > toMs) continue
    if (!Number.isFinite(candle.close)) continue
    out.push({ ts: candle.ts, price: candle.close })
  }
  out.sort((a, b) => a.ts - b.ts)
  return out
}

/**
 * Where the chart's left edge sits: the window's own open, or
 * `MAX_CHART_SPAN_MS` back, whichever is later.
 */
export function chartStart(row: UpDownRow, now: number): number {
  return Math.max(row.meta.opensMs, now - MAX_CHART_SPAN_MS)
}

/**
 * Append a live sample, drop what has scrolled off the left, and refuse a
 * point that would move the line backwards.
 *
 * Returns the SAME array when nothing changed, which the pane leans on: this
 * runs on a one-second timer under a chart that re-lays-out its path on every
 * new reference, and a tape that has printed the same price twice is not a
 * reason to redraw.
 */
export function appendSample(
  series: ReadonlyArray<SpotPoint>,
  sample: SpotPoint,
  fromMs: number,
): Array<SpotPoint> {
  const last = series[series.length - 1]
  if (last && sample.ts <= last.ts) {
    if (last.price === sample.price) return series as Array<SpotPoint>
    // Same second, new price: replace rather than append, so the series stays
    // strictly increasing in time and the path has no zero-width segment.
    const next = series.slice(0, -1)
    next.push({ ts: last.ts, price: sample.price })
    return next
  }
  const next = series.filter((point) => point.ts >= fromMs)
  next.push(sample)
  return next
}

export type SeriesBounds = { min: number; max: number }

/**
 * The y-domain, and the one rule that matters: the target is always on it.
 *
 * A window whose tape has run well clear of its reference would otherwise draw
 * the target line off the top of the box, which is the single most misleading
 * thing this chart could do — the distance to the target IS the subject, and a
 * chart that crops it out shows a price going up with nothing to go up
 * against. Padding is a share of the range, with a floor so a dead-flat minute
 * does not divide by zero and draw a line of infinite thickness.
 */
export function seriesBounds(
  points: ReadonlyArray<SpotPoint>,
  reference: number | undefined,
): SeriesBounds | null {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    if (point.price < min) min = point.price
    if (point.price > max) max = point.price
  }
  if (reference !== undefined && Number.isFinite(reference)) {
    if (reference < min) min = reference
    if (reference > max) max = reference
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const span = max - min
  // A tenth of a basis point of the level, when the range is zero. Small
  // enough that the line reads as flat, non-zero so the projection is defined.
  const pad = span > 0 ? span * 0.12 : Math.max(Math.abs(max) * 1e-5, 1e-8)
  return { min: min - pad, max: max + pad }
}

/**
 * Points to an SVG path in a `width` x `height` box.
 *
 * Returns an empty string for anything unplottable — one point, a degenerate
 * domain, a zero-size box — because an `<path d="">` renders nothing, where a
 * path built from NaN renders a console full of warnings.
 */
export function seriesPath(
  points: ReadonlyArray<SpotPoint>,
  bounds: SeriesBounds,
  fromMs: number,
  toMs: number,
  width: number,
  height: number,
): string {
  if (points.length < 2 || width <= 0 || height <= 0) return ''
  const spanMs = toMs - fromMs
  const spanY = bounds.max - bounds.min
  if (spanMs <= 0 || spanY <= 0) return ''
  let d = ''
  for (const [index, point] of points.entries()) {
    const x = ((point.ts - fromMs) / spanMs) * width
    const y = height - ((point.price - bounds.min) / spanY) * height
    d += `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return d
}

/** Where a price sits in the box, top-down. Clamped so a stale seed cannot escape. */
export function priceToY(
  price: number,
  bounds: SeriesBounds,
  height: number,
): number {
  const span = bounds.max - bounds.min
  if (span <= 0 || height <= 0) return height / 2
  const y = height - ((price - bounds.min) / span) * height
  return Math.min(Math.max(y, 0), height)
}

/** What a print is, as far as the flow summary is concerned. */
export type FlowPrint = { side: 'buy' | 'sell'; price: number; size: number }

export type TapeFlow = {
  /** Notional bought, in quote currency. */
  buyUsd: number
  sellUsd: number
  /** Buys as a share of both sides, 0..1. Null when nothing has printed. */
  buyShare: number | null
  /** The largest single print, which is what the row bars are drawn against. */
  maxUsd: number
}

const EMPTY_FLOW: TapeFlow = {
  buyUsd: 0,
  sellUsd: 0,
  buyShare: null,
  maxUsd: 0,
}

/**
 * The tape summed into the only two numbers a prediction trader wants from it.
 *
 * A short-dated up/down contract does not care what price a print went off at:
 * every print in the last minute is within a few cents of the last, so a column
 * of prices is five near-identical numbers and no information. What decides the
 * window is which side is pushing and how much money is behind it — a buy moves
 * the tape toward Up settling, a sell toward Down.
 *
 * Notional rather than base size, because "0.7" and "6.2" are not comparable
 * across assets and dollars are.
 */
export function tapeFlow(prints: ReadonlyArray<FlowPrint>): TapeFlow {
  if (prints.length === 0) return EMPTY_FLOW
  let buyUsd = 0
  let sellUsd = 0
  let maxUsd = 0
  for (const print of prints) {
    const usd = print.price * print.size
    if (!Number.isFinite(usd) || usd <= 0) continue
    if (print.side === 'buy') buyUsd += usd
    else sellUsd += usd
    if (usd > maxUsd) maxUsd = usd
  }
  const total = buyUsd + sellUsd
  return {
    buyUsd,
    sellUsd,
    // Null rather than 0.5 on an empty tape: "no prints" and "perfectly
    // balanced" are the same picture and must not be the same number.
    buyShare: total > 0 ? buyUsd / total : null,
    maxUsd,
  }
}

/**
 * How wide a print's bar is, against the largest one on screen.
 *
 * A floor of 4%, so the smallest print is still a mark rather than nothing: the
 * bar's job is comparison, and a row that renders as empty reads as a row that
 * failed to load.
 */
export function printBarFraction(usd: number, maxUsd: number): number {
  if (!(maxUsd > 0) || !Number.isFinite(usd) || usd <= 0) return 0.04
  return Math.min(Math.max(usd / maxUsd, 0.04), 1)
}
