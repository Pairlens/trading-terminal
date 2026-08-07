// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

/**
 * Geometry for the discovery mini price charts.
 *
 * Kept pure and DOM-free because the rows that draw it are virtualized and
 * re-mount constantly: the failure mode worth pinning down in a test is a
 * window that silently collapses (one candle, a stablecoin's zero range) and
 * reads as "no trend" when it should read as "no data" or "flat".
 */

export type SparklineGeometry = {
  /** `M…L…` path through every close, left to right. */
  line: string
  /** The same path closed along the bottom edge, for the gradient fill. */
  area: string
  /** Where the window ends relative to where it started. */
  up: boolean
  /** Last point, so callers can cap the line with a dot. */
  lastX: number
  lastY: number
}

/** Two decimals is under a tenth of a pixel at these sizes, and keeps the
 * `d` attribute short enough that hundreds of rows stay cheap to diff. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Returns null when there is nothing honest to draw — fewer than two points,
 * or a degenerate box. Callers render an empty slot of the same size so the
 * row height never depends on whether the data arrived.
 */
export function buildSparkline(
  values: Array<number>,
  width: number,
  height: number,
  pad = 1.5,
): SparklineGeometry | null {
  if (values.length < 2 || width <= 0 || height <= 0) return null

  const first = values[0]
  const last = values[values.length - 1]

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const usableHeight = Math.max(height - pad * 2, 0)

  const xAt = (i: number) => round((i / (values.length - 1)) * width)
  // A flat window has no scale to speak of — draw it down the middle rather
  // than dividing by zero or pinning every point to the top edge.
  const yAt = (value: number) =>
    round(
      span === 0
        ? height / 2
        : height - pad - ((value - min) / span) * usableHeight,
    )

  const line = values
    .map((value, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(value)}`)
    .join('')

  return {
    line,
    area: `${line}L${round(width)},${round(height)}L0,${round(height)}Z`,
    up: last >= first,
    lastX: xAt(values.length - 1),
    lastY: yAt(last),
  }
}
