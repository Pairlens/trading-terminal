// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a stacked band is painted, on both shells.
 *
 * The shape being copied is the one a single probability series has everywhere
 * it is drawn well: a bright line, and underneath it a wash that dissolves
 * into the background. The line is the data; the fill only says which side of
 * it the probability lives on. Eight solid slabs at one opacity say the
 * opposite, which is how the first stacked build ended up a muddy column.
 *
 * So the line carries the runner's colour at full strength and the fill starts
 * at half that and falls to nothing:
 *
 * **A gradient per band, mapped to its own box.** SVG's default
 * `objectBoundingBox` means a 22% band and a 2% band each get the whole ramp
 * over their own height, rather than a slice of a chart-wide wash that would
 * leave the floor solid and the ceiling bare. Three stops rather than two: the
 * glow has to hug the line and then let go, and a straight ramp spreads it
 * evenly over the band instead.
 *
 * **The edge is a real line.** An `Area` strokes only its top curve, which in
 * a stack IS the divider against the band above, so it needs no separate
 * element. Full opacity over a fill that has already faded past 0.2, which is
 * the contrast the reference has and flat fills cannot.
 *
 * What that costs, stated plainly: a band no longer reads as a solid slab of
 * mass, and the space just above each line goes dark. That is the trade the
 * shape makes everywhere it is used. The probability is still the distance
 * between one line and the next, and the lines are now the most legible thing
 * on the chart.
 *
 * The numbers live here rather than in either chart because the desktop pane
 * and the phone draw the same field, and a band brighter on one of them would
 * be the one place in the product where the same contract reads as two charts.
 * The `<defs>` themselves are written out in each chart: recharts keeps only
 * children whose type is a literal SVG tag, so a shared component returning
 * `<defs>` renders nothing at all.
 */

/** One stop of a band's vertical gradient, top of the band first. */
export type BandStop = { offset: string; opacity: number }

/**
 * A runner's band: bright against its own line, gone by the floor.
 *
 * The middle stop is what makes it read as a glow rather than a tint. Two
 * stops ramp linearly and put 0.25 through the middle of the band, which is
 * still a slab, just a paler one.
 */
export const BAND_STOPS: ReadonlyArray<BandStop> = [
  { offset: '0%', opacity: 0.5 },
  { offset: '55%', opacity: 0.14 },
  { offset: '100%', opacity: 0 },
]

/** The band the route is on, carrying more of its own colour. */
export const ACTIVE_BAND_STOPS: ReadonlyArray<BandStop> = [
  { offset: '0%', opacity: 0.68 },
  { offset: '55%', opacity: 0.22 },
  { offset: '100%', opacity: 0 },
]

/**
 * The remainder, the one band whose ramp runs the other way.
 *
 * A runner's fill hangs below its line. The remainder has no line: its top is
 * the ceiling of the plot, and stroking that draws a border around the chart
 * rather than a boundary in the data. Its edge is at the BOTTOM, against the
 * last runner, so it is strongest there and dissolves upward, which is what
 * "everything else, thinning out" should look like.
 */
export const REST_STOPS: ReadonlyArray<BandStop> = [
  { offset: '0%', opacity: 0 },
  { offset: '45%', opacity: 0.06 },
  { offset: '100%', opacity: 0.2 },
]

/**
 * The line above each band.
 *
 * Two pixels rather than a hairline. At eight bands in a docked pane the
 * thinnest runner is three pixels tall, and with the fill now dissolving it is
 * the line, not the area, that has to carry that runner at all.
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
