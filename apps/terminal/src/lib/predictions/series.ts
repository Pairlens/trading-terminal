// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Many runners, one time axis.
 *
 * A race is not N charts. "Who wins the nomination" is a single question whose
 * answer is the SHAPE of the field over time — who crossed whom, when the
 * favourite broke away, which outcome the news actually moved — and none of
 * that survives being split into one panel per candidate. So the outcomes have
 * to land on a shared grid before anything can draw them, and this module is
 * that grid.
 *
 * Three rules it exists to enforce, all of them about not inventing data.
 *
 * Forward-fill, never back-fill. A prediction outcome is quoted continuously
 * and a bucket with no trade means "nobody traded", not "the probability was
 * zero" — so a gap carries the last close forward, exactly as the price chart's
 * `fillPredictionBars` does. But a runner listed halfway through the window has
 * no price before it existed, and drawing a flat line back to the origin would
 * claim the market gave it that probability for weeks. Its line starts where
 * its data starts.
 *
 * One grid, taken from the requested interval. Venues bucket differently and
 * two runners can return timestamps that never coincide; keying rows on raw
 * timestamps would produce a row per runner per bucket, each with one value and
 * N holes, which recharts draws as N dotted lines. Every point is snapped to
 * the interval instead.
 *
 * A stated cap. Long windows over a fast interval can span tens of thousands of
 * buckets, so the row count is capped by striding — and the stride is part of
 * the result, because a chart that silently drew every fourth minute while its
 * axis said "1m" would be lying about its own resolution.
 */

/** One candle reduced to what a probability line needs. */
export type SeriesPoint = { ts: number; close: number }

/** One runner's history, keyed by the pair the connector routes on. */
export type SeriesInput = {
  key: string
  points: ReadonlyArray<SeriesPoint>
}

/**
 * One row of the aligned grid: a timestamp plus a probability per runner.
 *
 * A runner absent from a row is genuinely absent (before its listing, or past
 * its close), which is what lets the chart break the line rather than draw
 * through the hole.
 */
export type SeriesRow = { ts: number } & Record<string, number | undefined>

export type AlignedSeries = {
  rows: Array<SeriesRow>
  /** Buckets skipped per row, 1 when nothing was dropped. */
  stride: number
  /** The grid interval actually drawn, stride included. */
  intervalMs: number
}

/** Rows a pane may hold. ~1.5 per horizontal pixel on a wide desktop cell. */
export const MAX_ROWS = 720

const EMPTY: AlignedSeries = { rows: [], stride: 1, intervalMs: 0 }

/**
 * Snap every series onto the interval grid, forward-fill inside each runner's
 * own lifetime, and stride the result down to `maxRows`.
 *
 * Rows are oldest-first. Timestamps are bucket starts, so the last row is the
 * forming bucket and a caller streaming a live price overwrites exactly it.
 */
export function alignSeries(
  inputs: ReadonlyArray<SeriesInput>,
  intervalMs: number,
  maxRows: number = MAX_ROWS,
): AlignedSeries {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return EMPTY

  // Bucket → key → close, keeping the LAST point in a bucket: two venue
  // candles landing in one grid slot means the grid is coarser than the
  // venue's, and the close of the slot is the later of the two.
  const buckets = new Map<number, Map<string, number>>()
  /** First bucket each runner has a price in — where its line may start. */
  const firstBucket = new Map<string, number>()
  let min = Infinity
  let max = -Infinity

  for (const input of inputs) {
    for (const point of input.points) {
      if (!Number.isFinite(point.ts) || !Number.isFinite(point.close)) continue
      const bucket = Math.floor(point.ts / intervalMs) * intervalMs
      let row = buckets.get(bucket)
      if (!row) {
        row = new Map()
        buckets.set(bucket, row)
      }
      row.set(input.key, point.close)
      const seen = firstBucket.get(input.key)
      if (seen === undefined || bucket < seen)
        firstBucket.set(input.key, bucket)
      if (bucket < min) min = bucket
      if (bucket > max) max = bucket
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return EMPTY

  const spanned = Math.round((max - min) / intervalMs) + 1
  const stride = Math.max(1, Math.ceil(spanned / Math.max(1, maxRows)))
  const step = intervalMs * stride

  const carry = new Map<string, number>()
  const rows: Array<SeriesRow> = []

  // Walk the dense grid rather than the sparse buckets: the carry has to see
  // every quote, including ones a strided row does not emit, or a runner whose
  // only print in a window falls between two emitted rows vanishes from it.
  for (let ts = min; ts <= max; ts += intervalMs) {
    const bucket = buckets.get(ts)
    if (bucket) for (const [key, close] of bucket) carry.set(key, close)

    // Emit on the stride, and always emit the newest bucket: the right edge is
    // where the eye reads the current probability from, and striding it off
    // would leave the chart ending up to `stride` intervals in the past.
    const offset = Math.round((ts - min) / intervalMs)
    if (offset % stride !== 0 && ts !== max) continue

    const row: SeriesRow = { ts }
    for (const [key, close] of carry) {
      const start = firstBucket.get(key)
      if (start === undefined || ts < start) continue
      row[key] = close
    }
    rows.push(row)
  }

  return { rows, stride, intervalMs: step }
}

/**
 * The last value each runner holds in the aligned rows.
 *
 * The legend prints this rather than the events index's price so the number
 * beside a colour and the right edge of the line it names can never disagree —
 * the index refreshes on a 60-second timer and the chart does not.
 */
export function lastValues(
  rows: ReadonlyArray<SeriesRow>,
  keys: ReadonlyArray<string>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (let i = rows.length - 1; i >= 0 && out.size < keys.length; i--) {
    const row = rows[i]
    if (!row) continue
    for (const key of keys) {
      if (out.has(key)) continue
      const value = row[key]
      if (typeof value === 'number') out.set(key, value)
    }
  }
  return out
}

/**
 * Move over the drawn window, per runner, in probability points.
 *
 * Measured from each runner's OWN first drawn value, not from the window's
 * left edge: a candidate listed on Tuesday has no Monday price, and stating
 * its change against the field's start would credit it with a move it could
 * not have made.
 */
export function windowChange(
  rows: ReadonlyArray<SeriesRow>,
  keys: ReadonlyArray<string>,
): Map<string, number> {
  const first = new Map<string, number>()
  for (const row of rows) {
    for (const key of keys) {
      if (first.has(key)) continue
      const value = row[key]
      if (typeof value === 'number') first.set(key, value)
    }
    if (first.size === keys.length) break
  }

  const out = new Map<string, number>()
  for (const [key, last] of lastValues(rows, keys)) {
    const start = first.get(key)
    if (start === undefined) continue
    out.set(key, last - start)
  }
  return out
}

/**
 * Overwrite the newest row's value for one runner, in place of a re-fetch.
 *
 * The live ticker is a price for the bucket that is still forming, so it
 * replaces that bucket rather than appending past it — appending would put two
 * points inside one interval and bend the last segment of the line.
 *
 * Returns the same array when there is nothing to apply, so a memo downstream
 * does not invalidate on every tick that changed nothing.
 */
export function withLivePoint(
  rows: Array<SeriesRow>,
  key: string,
  price: number | null,
): Array<SeriesRow> {
  if (price === null || !Number.isFinite(price)) return rows
  const last = rows[rows.length - 1]
  if (!last || last[key] === price) return rows
  const next = rows.slice()
  next[rows.length - 1] = { ...last, [key]: price }
  return next
}

/**
 * One tick per calendar day, for a chart whose buckets are finer than a day.
 *
 * Recharts spaces ticks by pixels, so a week of hourly buckets under a
 * date-only label produced "Aug 12 · Aug 12 · Aug 13 · Aug 13" — an axis that
 * reads as duplicated data rather than as a repeated label. Days are the unit
 * the label is stated in, so days are what the ticks have to be.
 *
 * The first row of each local date wins, which keeps every tick on a real data
 * point (recharts draws a tick wherever it is told, data or not, and a tick
 * between two points sits at a time the chart has nothing to say about). Past
 * `max` days the set is strided rather than truncated: an axis that stops
 * labelling two-thirds of the way across looks broken.
 */
export function dayTicks(
  rows: ReadonlyArray<SeriesRow>,
  max = 8,
): Array<number> {
  const seen = new Set<string>()
  const ticks: Array<number> = []
  for (const row of rows) {
    const date = new Date(row.ts)
    if (!Number.isFinite(date.getTime())) continue
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    if (seen.has(key)) continue
    seen.add(key)
    ticks.push(row.ts)
  }
  if (ticks.length <= max) return ticks
  const stride = Math.ceil(ticks.length / max)
  return ticks.filter((_, i) => i % stride === 0)
}
