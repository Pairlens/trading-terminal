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

/**
 * Chart band left above a sheet dragged to its EXPANDED snap.
 *
 * It used to be 64px — the compact price readout's own row plus air — because
 * the readout had to survive the expanded snap. It no longer does: the readout
 * and the timeframe chip fade out as the sheet approaches the top (see
 * `--pl-sheet-expand`), which is what buys the panel its real estate. So the
 * band is now just the hairline of chart the sheet stops short of, and the
 * sheet reaches essentially the top of the chart band.
 */
export const EXPANDED_BAND = 8

/**
 * The Trade panel's expanded band, which cannot be the generic one.
 *
 * The draggable limit line's grab strip is 44px tall and centred on the line,
 * so 44px is the smallest band that can hold the pinned affordance whole
 * (`limitStripBottom` floors it at `band - LIMIT_GRAB_HALF` = 22, and the strip
 * then spans exactly 0–44). Anything less and half the tag and half the touch
 * target would be clipped by the chart band's own overflow — the defect last
 * round's pinning rule exists to prevent.
 */
export const TRADE_EXPANDED_BAND = 44

/** The two heights one panel's sheet can have, in px, smallest first. */
export type SheetSnaps = {
  /** The panel's designed resting height — `sheetTop(band)` expressed as a height. */
  defaultHeight: number
  /** Dragged to the top: everything but the context bar and the price row. */
  expandedHeight: number
}

/**
 * The sheet's two snap heights.
 *
 * Heights rather than tops because that is what vaul's snap-point model wants:
 * it translates a `top: 0` element down by `viewport - height`, so a snap point
 * IS a height. Both are resolved in px from `window.innerHeight` — never from
 * `svh` — because vaul computes its own offsets from `window.innerHeight` and
 * the two units disagree by the height of the collapsed iOS URL bar. Measuring
 * the same thing vaul measures is what keeps the default snap sitting exactly
 * where `sheetTop(band)` used to put it across a URL-bar collapse.
 *
 * The `defaultHeight + 1` floor is a degenerate-viewport guard, not a design
 * choice: vaul indexes snap points by value, so two equal entries would make
 * the expanded snap unreachable.
 */
export function resolveSheetSnaps(
  band: number,
  chartTop: number,
  viewport: number,
  expandedBand: number = EXPANDED_BAND,
): SheetSnaps {
  const defaultHeight = Math.max(
    viewport - resolveSheetTop(band, chartTop, viewport),
    0,
  )
  return {
    defaultHeight,
    expandedHeight: Math.max(
      viewport - chartTop - expandedBand,
      defaultHeight + 1,
    ),
  }
}

/**
 * How far below the default snap a drag has to end before it dismisses instead
 * of springing back. vaul's own `closeThreshold` (0.25 of the sheet) does not
 * apply once snap points are in play — its snap-point release only closes on a
 * fast flick — so the ratio is reproduced here to keep the shipped feel.
 */
export const SHEET_DISMISS_RATIO = 0.25

/** Never less than this, so a short sheet is not dismissed by a stray nudge. */
const MIN_DISMISS_TRAVEL = 56

export function sheetDismissTravel(defaultHeight: number): number {
  return Math.max(
    MIN_DISMISS_TRAVEL,
    Math.round(defaultHeight * SHEET_DISMISS_RATIO),
  )
}

/**
 * Should a drag that ended with the sheet translated `translateY` px down be
 * treated as a dismiss?
 *
 * Measured against the DEFAULT snap in every case, which is what makes one
 * rule cover both gestures the user described: from the expanded snap a drag
 * down lands on the default first and only dismisses if it keeps going.
 */
export function shouldDismissSheet(
  translateY: number,
  viewport: number,
  defaultHeight: number,
): boolean {
  return (
    translateY - (viewport - defaultHeight) > sheetDismissTravel(defaultHeight)
  )
}

/**
 * The Y translation of a computed `transform`, or null when there is none.
 *
 * Reading the sheet's own matrix beats tracking pointer deltas: it is where
 * the sheet actually IS at the end of the gesture, including vaul's clamping
 * at the top snap, and it cannot be fooled by a gesture that scrolled the list
 * instead of moving the sheet.
 */
export function parseTranslateY(transform: string): number | null {
  if (!transform || transform === 'none') return null
  const match = /matrix(3d)?\(([^)]+)\)/.exec(transform)
  if (!match) return null
  const parts = match[2].split(',').map((part) => Number(part.trim()))
  const value = match[1] ? parts[13] : parts[5]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The same number read off the INLINE `transform` vaul writes.
 *
 * Sampling the sheet's position once per animation frame is the one hot path
 * on this surface, and `getComputedStyle` forces a style recalc every call.
 * vaul sets `translate3d(0, Npx, 0)` inline, so the value can be had off the
 * attribute string for free; `parseTranslateY` stays the fallback for the
 * frames where the transform came from CSS instead.
 */
export function parseInlineTranslateY(transform: string): number | null {
  const match = /translate3d\(\s*[^,]*,\s*(-?[\d.]+)px/.exec(transform)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/**
 * The sheet's live position as the two 0→1 numbers the chart band reacts to.
 *
 * `dock` is how far the sheet has come up from off screen to its default snap;
 * `expand` is how far it has gone on from there to the expanded snap. They are
 * written to CSS custom properties from a rAF (never React state) so the price
 * readout, the timeframe chip and the drawing toolbar can follow a finger
 * frame by frame on the compositor.
 */
export function sheetProgress(
  translateY: number,
  viewport: number,
  snaps: SheetSnaps,
): { dock: number; expand: number } {
  const visible = viewport - translateY
  const span = Math.max(1, snaps.expandedHeight - snaps.defaultHeight)
  return {
    dock: clamp01(snaps.defaultHeight > 0 ? visible / snaps.defaultHeight : 0),
    expand: clamp01((visible - snaps.defaultHeight) / span),
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}
