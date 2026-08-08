// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the draggable limit line is allowed to sit.
 *
 * The chart stopped resizing when a panel docks: it is full height in every
 * view and the sheet simply covers it (see `mobile-chart-surface.tsx`'s
 * `CHART_FRAME`). The limit-line overlay shares that box, so the plot it maps
 * prices into is now ~700px tall while only the top `band` px of it — the strip
 * between the chart top and the sheet's top edge — is on screen. A level
 * anywhere below that strip would be drawn, correctly, underneath the sheet:
 * invisible and ungrabbable.
 *
 * So the line has a USABLE RANGE that is shorter than the plot, and one rule
 * covers both what is painted and what a drag may reach:
 *
 *   - price off the plot entirely (above the chart top, past the bottom of the
 *     plot, or unmappable) → hidden, exactly as before;
 *   - price on the plot but below the usable range → PINNED to the bottom of
 *     the range and flagged, so the affordance stays whole and reachable;
 *   - otherwise → drawn at its own y.
 *
 * The range stops `LIMIT_GRAB_HALF` short of the sheet because the grab strip
 * is centred on the line: pinning the line ON the sheet's edge would leave half
 * the tag and half the 44px touch target under a z-40 sheet, which is the
 * defect being fixed rather than a fix for it.
 */

/**
 * Half the grab strip's height, in px — the overlay's strip is 44px tall and
 * centred on the line, and the price tag (26px, centred) fits inside it. It is
 * therefore both the touch target's reach below the line and the inset the
 * pinned line keeps from the sheet's edge, which is why it is one constant.
 */
export const LIMIT_GRAB_HALF = 22

/**
 * How far a re-derived y may sit past the range's bottom before it counts as
 * pinned, in px. A drag that ends exactly at the bottom writes a ROUNDED price
 * back into the draft, and the rounded price maps a fraction of a pixel lower —
 * without the tolerance the line would flag itself pinned the instant the user
 * let go of it there.
 */
const PIN_EPSILON_PX = 1

/**
 * The lowest y the line may be drawn or dragged to.
 *
 * @param plotHeight  the chart's price-mapped box (slot height minus the time axis)
 * @param stripHeight chart band visible above the docked sheet; `Infinity` when
 *                    nothing covers the chart, which yields the plain plot
 */
export function limitStripBottom(
  plotHeight: number,
  stripHeight: number,
): number {
  const usable = Number.isFinite(stripHeight)
    ? stripHeight - LIMIT_GRAB_HALF
    : plotHeight
  return Math.max(0, Math.min(plotHeight, usable))
}

export type LimitLinePlacement = {
  /** y within the plot to draw at. Meaningless when `visible` is false. */
  y: number
  /** The price's own y is below the usable range; this y is the range's floor. */
  pinned: boolean
  /** False when the price is not on the plot at all — the overlay hides. */
  visible: boolean
}

/** Resolve a price's plot y into a drawable placement. */
export function placeLimitLine(
  y: number | null,
  plotHeight: number,
  stripHeight: number,
): LimitLinePlacement {
  if (y == null || !Number.isFinite(y) || y < 0 || y > plotHeight) {
    return { y: 0, pinned: false, visible: false }
  }
  const bottom = limitStripBottom(plotHeight, stripHeight)
  if (y <= bottom) return { y, pinned: false, visible: true }
  return { y: bottom, pinned: y - bottom > PIN_EPSILON_PX, visible: true }
}

/** Clamp a dragged y to the same range the placement above pins against. */
export function clampLimitDragY(
  y: number,
  plotHeight: number,
  stripHeight: number,
): number {
  return Math.min(Math.max(y, 0), limitStripBottom(plotHeight, stripHeight))
}
