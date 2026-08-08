// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Sheet geometry — one formula instead of twenty magic numbers.
 *
 * The design's absolute offsets are measured at 402 × 874 (iPhone 16 Pro
 * logical). Hard-coding them would letterbox every other phone, so what is
 * preserved is the *chart band height* each screen was drawn with: the sheet
 * top is `--pl-chart-top + band`, and any extra viewport height goes to the
 * sheet rather than to the chart. That reproduces the design's proportions at
 * 874px and stays honest on a taller or shorter screen.
 *
 * The `min()` against the viewport is the short-phone guard (iPhone SE at
 * 667px): without it the Co-pilot sheet would open with 60px of content area.
 * It is why this is a helper and not a literal at each call site.
 */

/** Chart-band height, in px, below the context bar for each panel. */
export const SHEET_BAND = {
  /** Design sheet top 246. */
  drawingTools: 96,
  /** Design sheet top 274. */
  discover: 124,
  /** Design sheet top 300. */
  watchlist: 150,
  /** Design sheet top 310. Both Trade states share it — one screen, two states. */
  trade: 160,
  /** Design sheet top 336. */
  copilot: 186,
} as const

export type SheetBand = (typeof SHEET_BAND)[keyof typeof SHEET_BAND]

/** Full-height sheets and overlays start at the chart top. */
export const SHEET_TOP_FULL = 0

/**
 * The chart engine's time-axis gutter, in px.
 *
 * `MobileChart` pins it in the theme it hands the engine so this is a fact and
 * not an assumption: the engine maps price ↔ y against `mainHeight -
 * timeAxisHeight`, so anything drawing over the chart in price space (the
 * limit line) has to subtract it to know where the plot actually ends.
 */
export const CHART_TIME_AXIS_HEIGHT = 22

/**
 * Smallest content height a sheet is allowed to have. Below this the sheet
 * stops following the band and pins itself, so a short phone gets a usable
 * panel instead of a sliver.
 */
export const MIN_SHEET_HEIGHT = 240

/**
 * CSS `top` for a sheet with the given chart band.
 *
 * Returns a `calc()` string rather than a number: `--pl-chart-top` resolves
 * safe-area insets that only the browser knows, and `100svh` is the only
 * viewport unit that survives the mobile URL-bar collapse.
 */
export function sheetTop(band: number | 'full'): string {
  const offset = band === 'full' ? SHEET_TOP_FULL : band
  if (offset <= 0) return 'var(--pl-chart-top)'
  return `min(calc(var(--pl-chart-top) + ${offset}px), calc(100svh - ${MIN_SHEET_HEIGHT}px))`
}

/**
 * Pure resolution of the same formula, for tests and for callers that already
 * know the concrete pixel values (the chart band's own height, say).
 *
 * @param band       chart-band height, or 'full'
 * @param chartTop   resolved `--pl-chart-top`
 * @param viewport   resolved `100svh`
 */
export function resolveSheetTop(
  band: number | 'full',
  chartTop: number,
  viewport: number,
): number {
  const offset = band === 'full' ? SHEET_TOP_FULL : band
  if (offset <= 0) return chartTop
  return Math.min(chartTop + offset, viewport - MIN_SHEET_HEIGHT)
}
