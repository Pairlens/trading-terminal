// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Output alignment helpers — pure so they run under plain `bun test`.
 *
 * A script's compute() may return, per series key: a scalar (broadcast to
 * every bar), an array shorter than the candle window (right-aligned — the
 * last element maps to the latest candle, missing leading bars are NaN), or a
 * longer array (only the trailing window is kept).
 */

/** Align one output value to `length` bars. Always returns a fresh, transferable array. */
export function alignSeries(
  value: Float64Array | number,
  length: number,
): Float64Array {
  if (typeof value === 'number') {
    return new Float64Array(length).fill(value)
  }
  if (value.length === length) {
    return value
  }
  if (value.length > length) {
    return value.slice(value.length - length)
  }
  const out = new Float64Array(length).fill(Number.NaN)
  out.set(value, length - value.length)
  return out
}

/** Align every series of a compute() result to the candle window length. */
export function alignOutputs(
  outputs: Record<string, Float64Array | number>,
  length: number,
): Record<string, Float64Array> {
  const aligned: Record<string, Float64Array> = {}
  for (const [key, value] of Object.entries(outputs)) {
    aligned[key] = alignSeries(value, length)
  }
  return aligned
}
