// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a stacked band is painted, on both shells.
 *
 * Flat fills at a single opacity gave the first stacked build its problem: on
 * a dark plot eight solid slabs desaturate into one muddy column, and the
 * hairline between two of them is the only thing saying where one runner ends
 * and the next begins. Two changes fix both.
 *
 * **A gradient per band, not one across the chart.** Each band's gradient is
 * mapped to its OWN bounding box (SVG's default `objectBoundingBox`), so a 22%
 * band and a 2% band get the same fade over their own height rather than a
 * slice of a chart-wide wash that would leave the floor solid and the ceiling
 * bare. Strong at the top, falling away toward the bottom, which puts the
 * weight of the colour on the edge the eye follows.
 *
 * **The edge is a real line.** An `Area`'s stroke draws only its top curve,
 * which in a stack IS the divider against the band above. So it carries the
 * band's own colour at full opacity over a fill that has faded to under half,
 * and a band too thin to read as an area still reads as a line.
 *
 * The numbers live here rather than in either chart because the desktop pane
 * and the phone draw the same field, and a band that was brighter on one of
 * them would be the one place in the product where the same contract reads as
 * two charts. The `<defs>` themselves are written out in each chart: recharts
 * drops any child that is not a literal SVG element, so a shared component
 * returning `<defs>` would silently render nothing.
 */

/** Top and bottom stops of a runner's band. */
export const BAND_FILL_TOP = 0.95
export const BAND_FILL_BOTTOM = 0.42

/** The band the route is on, carrying a little more weight. */
export const ACTIVE_BAND_FILL_TOP = 1
export const ACTIVE_BAND_FILL_BOTTOM = 0.58

/**
 * The remainder, and the one band whose gradient runs the other way.
 *
 * A runner's band is strongest at its top because that is where its edge is
 * drawn and where the eye reads it. The remainder has no edge worth drawing:
 * its top is the ceiling of the plot, and stroking that just puts a border
 * around the chart. Its meaningful boundary is at its BOTTOM, against the last
 * runner, so it is strongest there and fades upward into the background, which
 * is what "everything else, thinning out" should look like.
 */
export const REST_FILL_AT_FIELD = 0.28
export const REST_FILL_AT_CEILING = 0.08

/**
 * The divider between one band and the next.
 *
 * Two pixels rather than a hairline. At eight bands in a docked pane the
 * thinnest runner is three pixels tall, and a 0.6px edge over a faded fill
 * left the boundary to be inferred from a colour change.
 */
export const BAND_EDGE_WIDTH = 2
export const ACTIVE_BAND_EDGE_WIDTH = 2.75

/**
 * `useId()` output, made safe to put in an SVG id.
 *
 * React's ids carry colons, which are legal in an id attribute but need
 * escaping in a selector and have bitten `url(#...)` lookups before. Same
 * treatment `ChartContainer` gives its own generated id.
 */
export function paintScope(reactId: string): string {
  return `band-${reactId.replace(/:/g, '')}`
}

/** The gradient a band at this stack position paints with. */
export function bandGradientId(scope: string, index: number): string {
  return `${scope}-${index}`
}

/** The gradient the remainder paints with. */
export function restGradientId(scope: string): string {
  return `${scope}-rest`
}
