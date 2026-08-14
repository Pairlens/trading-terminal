// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Row-magnitude intensity for the terminal's tabular tapes ──────────
//
// Shared by the order book (level size) and the data log (candle volume):
// wherever a list of rows needs "how big is this one against its
// neighbours" painted as colour strength.
//
// In the order book this rides alongside a second variable — the depth bar's
// WIDTH is cumulative depth ("how much sits between here and the spread"),
// its COLOUR STRENGTH is this module. Two orthogonal variables on two
// orthogonal channels, so a wall reads as a hot band even when it sits deep
// in the book where the cumulative bar is already near full width.
//
// Normalization has to survive both a flat book and a single 100x whale, so
// the reference is `median × REFERENCE_MULTIPLE`, not the max:
//
//   • max as reference → one whale crushes every other row to near-zero, and
//     a perfectly flat book paints every row at full strength.
//   • median × k → the row scale means "how many times the typical level is
//     this", which is what a trader actually reads off the book. A flat book
//     settles at a mid tone; only genuine outliers saturate.
//
// The curve is a square root because size distributions are heavy-tailed: on
// a linear ramp everything below ~2x the median collapses into one
// indistinguishable band.

/** A row at `REFERENCE_MULTIPLE`x the median magnitude saturates the ramp. */
const REFERENCE_MULTIPLE = 6

/** Compression exponent (0.5 = sqrt) applied to magnitude/reference. */
const CURVE = 0.5

/** Intensity of a median row — the tape's resting tone. */
const MEDIAN_INTENSITY = (1 / REFERENCE_MULTIPLE) ** CURVE

/**
 * Magnitude that maps to full intensity, derived from the visible rows.
 *
 * Variadic so the order book can pool bids and asks into ONE scale: an equal
 * bid and ask must paint identically, or the book lies about which side is
 * heavier. Single-group callers (the data log) just pass one array.
 *
 * O(n log n) over the visible rows only (≈20-40), once per tick — the same
 * order of work these panes already do slicing and formatting those rows.
 */
export function computeMagnitudeReference(
  ...groups: Array<Array<number>>
): number {
  const values: Array<number> = []
  for (const group of groups) {
    for (const value of group) {
      if (value > 0) values.push(value)
    }
  }
  if (values.length === 0) return 0

  values.sort((a, b) => a - b)
  const mid = values.length >> 1
  const median =
    values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2

  return median * REFERENCE_MULTIPLE
}

/**
 * Map a row's magnitude to 0..1 against `computeMagnitudeReference`.
 *
 * With no usable reference (empty or all-zero rows) everything falls back to
 * the median tone, so the tape keeps its resting look instead of going blank.
 */
export function magnitudeIntensity(value: number, reference: number): number {
  if (reference <= 0) return MEDIAN_INTENSITY
  if (value <= 0) return 0
  const ratio = value / reference
  return ratio >= 1 ? 1 : ratio ** CURVE
}

/**
 * Resolution of the quantized intensity ladder. See `magnitudeIntensityStep`.
 *
 * 24 steps spread over the tint's 6%→26% ramp puts consecutive steps 0.83
 * percentage points of `color-mix` apart, which is below what the eye
 * resolves against a dark pane — the ladder is a render optimisation, not a
 * visual one, and it must not be visible as banding.
 */
export const INTENSITY_STEPS = 24

/**
 * The same intensity, snapped to a small integer.
 *
 * For the tape this is the difference between re-rendering every row on every
 * flush and re-rendering almost none of them. The reference is a median over
 * the visible rows, so one new print nudges it, so every row's raw intensity
 * moves by a hair, so every memoized row sees a changed prop and re-renders —
 * 200 rows, ten times a second, to repaint colours nobody can tell apart.
 * Comparing the STEP instead means a row re-renders only when its tint has
 * somewhere to go.
 */
export function magnitudeIntensityStep(
  value: number,
  reference: number,
): number {
  return Math.round(magnitudeIntensity(value, reference) * INTENSITY_STEPS)
}

/** The other half of the ladder: a step back to the 0..1 the colours take. */
export function intensityFromStep(step: number): number {
  return step / INTENSITY_STEPS
}

/** Row tint, in `color-mix` percent, at rest and at a full wall. */
const FILL_MIN_PCT = 6
const FILL_MAX_PCT = 26

/**
 * Directional tint for a row. A median row lands at ~14%, which is where the
 * order book's flat 13% tint used to sit — the familiar body tone is
 * preserved and only the extremes move.
 */
export function magnitudeFillColor(
  direction: 'up' | 'down',
  intensity: number,
): string {
  const pct = FILL_MIN_PCT + intensity * (FILL_MAX_PCT - FILL_MIN_PCT)
  return `color-mix(in oklch, var(--${direction}) ${pct.toFixed(1)}%, transparent)`
}

/**
 * Floor for the value column's brightness ramp. Quiet rows are only softened,
 * never dimmed to the point of being hard to read — the tint carries the
 * signal, the text just reinforces it.
 */
const TEXT_MIN_PCT = 62

/** Value-column colour: quiet sits back toward muted, walls read full strength. */
export function magnitudeTextColor(intensity: number): string {
  const pct = TEXT_MIN_PCT + intensity * (100 - TEXT_MIN_PCT)
  return `color-mix(in oklch, var(--foreground) ${pct.toFixed(1)}%, var(--muted-foreground))`
}
