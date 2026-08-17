// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Reshaping the server's liquidation grid into the two things the terminal
 * draws: a time-by-price heatmap, and a price-only collapse of it.
 *
 * The wire carries buckets on both axes, minute in time and uniform width in
 * price. `buildHeatmapGrid` keeps both and re-buckets the time axis onto the
 * chart's candle columns, which is what the liquidation map paints behind its
 * candles. `aggregateByPrice` collapses the time axis entirely, which is what a
 * price-only consumer (the assistant's market tools) wants.
 *
 * Three rules every consumer depends on:
 *
 * - Sides are kept apart all the way to the render. A price where longs were
 *   liquidated and a price where shorts were are different facts, and summing
 *   them into one "activity" number is the mistake that makes a liquidation map
 *   look like a volume profile.
 * - Intensity is scaled by square root, never linearly. Liquidated notional is
 *   heavy-tailed: one cascade minute is routinely a hundred times a normal one,
 *   and a linear ramp against that maximum renders every other bucket invisible.
 * - Notional is the only figure comparable across venues. `count` is not:
 *   Binance's stream samples at most one print per symbol per second while
 *   Bybit's carries every one, so raw counts differ by an order of magnitude
 *   for identical market activity. Intensity therefore scales on notional.
 */
import type { Timeframe } from '@pairlens/shared/types'
import type {
  LiquidationBucket,
  LiquidationSide,
} from '@pairlens/shared/instrument-types'

/** Windows the chips offer, in hours. The last one is the server's retention. */
export const LIQUIDATION_WINDOWS = [1, 6, 24, 72] as const

export type LiquidationWindowHours = (typeof LIQUIDATION_WINDOWS)[number]

/** Faintest a slab that exists at all may be drawn. Below this it reads as absent. */
const MIN_INTENSITY = 0.12

export type PriceCluster = {
  /** Price bucket lower bound, as the server bucketed it. */
  price: number
  longNotional: number
  shortNotional: number
  /** Both sides summed — the figure the slab's intensity is scaled against. */
  total: number
  count: number
}

/**
 * Every minute bucket collapsed onto its price bucket.
 *
 * Ordered by price ascending, which is the order the strip draws in. Buckets
 * with no notional never make it into the list, so a caller can treat an empty
 * result as "nothing was liquidated in this window" without a second check.
 */
export function aggregateByPrice(
  buckets: ReadonlyArray<LiquidationBucket>,
): Array<PriceCluster> {
  const byPrice = new Map<number, PriceCluster>()
  for (const bucket of buckets) {
    if (!Number.isFinite(bucket.price) || bucket.price <= 0) continue
    const notional = Number(bucket.notionalUsd)
    if (!Number.isFinite(notional) || notional <= 0) continue

    let cluster = byPrice.get(bucket.price)
    if (!cluster) {
      cluster = {
        price: bucket.price,
        longNotional: 0,
        shortNotional: 0,
        total: 0,
        count: 0,
      }
      byPrice.set(bucket.price, cluster)
    }
    if (bucket.side === 'long') cluster.longNotional += notional
    else cluster.shortNotional += notional
    cluster.total += notional
    cluster.count += Number.isFinite(bucket.count) ? bucket.count : 0
  }
  return Array.from(byPrice.values()).sort((a, b) => a.price - b.price)
}

/** The heaviest cluster in the strip, which every other slab is drawn against. */
export function peakNotional(clusters: ReadonlyArray<PriceCluster>): number {
  let peak = 0
  for (const cluster of clusters) {
    if (cluster.total > peak) peak = cluster.total
  }
  return peak
}

/**
 * How dark a slab is drawn, 0..1.
 *
 * Square root rather than linear, for the reason in the module note: a cascade
 * bucket a hundred times the median would otherwise flatten every other bucket
 * to nothing, and the shape of the strip is the whole information. The floor
 * means a bucket that exists is always visible; a bucket that does not exist is
 * never drawn at all, so the floor never invents density.
 */
export function clusterIntensity(total: number, peak: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  if (!Number.isFinite(peak) || peak <= 0) return 0
  const scaled = Math.sqrt(Math.min(total / peak, 1))
  return Math.min(Math.max(scaled, MIN_INTENSITY), 1)
}

/**
 * The side that carried most of a bucket's notional.
 *
 * A tie resolves to 'long' rather than being drawn neutral: an exactly balanced
 * bucket is a coincidence of rounding, not a third kind of event, and a third
 * colour would have to be explained in the legend.
 *
 * Typed on the two fields it reads rather than on `PriceCluster`, so the
 * heatmap's time-by-price cells settle their colour through the same rule the
 * price-only collapse does. One tie-break, one place.
 */
export function dominantSide(bucket: {
  longNotional: number
  shortNotional: number
}): LiquidationSide {
  return bucket.shortNotional > bucket.longNotional ? 'short' : 'long'
}

export type LiquidationTotals = {
  long: number
  short: number
  total: number
  count: number
}

/** What the legend states: how much of each side the window actually held. */
export function liquidationTotals(
  buckets: ReadonlyArray<LiquidationBucket>,
): LiquidationTotals {
  const totals: LiquidationTotals = { long: 0, short: 0, total: 0, count: 0 }
  for (const bucket of buckets) {
    const notional = Number(bucket.notionalUsd)
    if (!Number.isFinite(notional) || notional <= 0) continue
    if (bucket.side === 'long') totals.long += notional
    else totals.short += notional
    totals.total += notional
    totals.count += Number.isFinite(bucket.count) ? bucket.count : 0
  }
  return totals
}

/**
 * The price extremes the strip spans, so the pane's axis can be widened to hold
 * it. The top of the highest bucket is its lower bound plus one width — a slab
 * clipped at the axis edge would misreport where liquidations stopped.
 */
export function clusterPriceBounds(
  clusters: ReadonlyArray<PriceCluster>,
  bucketWidth: number,
): Array<number> {
  if (clusters.length === 0) return []
  const width =
    Number.isFinite(bucketWidth) && bucketWidth > 0 ? bucketWidth : 0
  const first = clusters[0]
  const last = clusters[clusters.length - 1]
  return [first.price, last.price + width]
}

// ── Data sources ─────────────────────────────────────────────────────

/** The shape of a manifest this module needs, and nothing more. */
export type LiquidationCapabilityCarrier = {
  capabilities: ReadonlyArray<{
    id: string
    markets: ReadonlyArray<string>
  }>
}

/**
 * Every venue some active plugin holds a liquidation collector for, focused
 * venue first.
 *
 * Read from the manifests rather than a list kept here, for the reason the
 * clusters hook gives: a wildcard declaration would claim every exchange, so
 * the capability's explicit `markets` array IS the answer to "does a collector
 * watch this venue", and it costs no request to ask. A `'*'` entry is dropped
 * rather than expanded — a source picker offering "everything" would be a
 * promise the collector cannot keep.
 *
 * The focused venue leads when it is collected, because that is the only source
 * whose prints and whose candles are the same exchange. The rest are alphabetical
 * so the picker does not reorder itself when a plugin is enabled.
 */
export function collectedLiquidationVenues(
  manifests: ReadonlyArray<LiquidationCapabilityCarrier>,
  focusedVenue: string,
): Array<string> {
  const venues = new Set<string>()
  for (const manifest of manifests) {
    for (const capability of manifest.capabilities) {
      if (capability.id !== 'market-data:liquidations') continue
      for (const venue of capability.markets) {
        if (venue && venue !== '*') venues.add(venue)
      }
    }
  }
  const ordered = Array.from(venues)
    .filter((venue) => venue !== focusedVenue)
    .sort()
  if (venues.has(focusedVenue)) ordered.unshift(focusedVenue)
  return ordered
}

// ── Time-by-price grid ───────────────────────────────────────────────

/**
 * The candle interval each window is drawn at.
 *
 * These are COLUMN widths, not a claim about the data: the wire is always
 * minute-resolution and every one of these intervals is a whole number of
 * minutes, so re-bucketing never splits a wire bucket across two columns. The
 * widths are picked so any window lands near a hundred columns. 72 hours at the
 * wire's own resolution would be 4,320 columns across a pane a few hundred
 * pixels wide, which is a sub-pixel column per print: a texture, not a map.
 *
 * A venue that does not serve the interval gets the nearest one it does, which
 * `fetchHistory`/`probeVenueHistory` clamp on the way out. The grid is always
 * built from the bars that actually came back, never from this table.
 */
export const LIQUIDATION_WINDOW_TIMEFRAME: Record<
  LiquidationWindowHours,
  Timeframe
> = {
  1: '1m',
  6: '5m',
  24: '15m',
  72: '1h',
}

/** How many bars to ask a venue for to cover a window, plus a little lead-in. */
export function barsForWindow(hours: LiquidationWindowHours, barMs: number) {
  if (!Number.isFinite(barMs) || barMs <= 0) return 0
  return Math.ceil((hours * 3_600_000) / barMs) + 12
}

/** One (candle column × price row) cell of the heatmap. */
export type LiquidationCell = {
  /** Column: start of the candle bucket this cell's prints landed in. */
  barTs: number
  /** Row: price bucket lower bound, exactly as the server bucketed it. */
  price: number
  longNotional: number
  shortNotional: number
  /** Both sides summed — the figure the cell's intensity is scaled against. */
  total: number
  count: number
}

export type LiquidationHeatmapGrid = {
  /**
   * Cells by column start. A Map rather than a flat array because the paint
   * loop walks the chart's visible bars and asks for each one's cells: one
   * lookup per visible column, no scan, no per-frame allocation.
   */
  columns: Map<number, Array<LiquidationCell>>
  /** Heaviest single CELL, which every cell's intensity is scaled against. */
  peak: number
  cellCount: number
  /** Column width the grid was built at, ms. */
  barMs: number
}

const EMPTY_GRID: LiquidationHeatmapGrid = {
  columns: new Map(),
  peak: 0,
  cellCount: 0,
  barMs: 0,
}

/**
 * Every wire bucket placed on the (candle column × price row) grid the map
 * paints.
 *
 * Columns are epoch-aligned by flooring, which is the same alignment every
 * venue closes a candle on for these intervals, so a cell always sits under the
 * bar whose period contains its prints. Empty cells are never created: a cell
 * that exists is a liquidation that happened, and that is what lets the pane
 * treat `cellCount === 0` as "nothing was liquidated in this window" rather
 * than "nothing loaded yet".
 *
 * Peak is the heaviest single cell, NOT the heaviest column. Scaling a cell
 * against a column total would make a quiet minute inside a cascade bar look
 * busy, and scaling against the window total would flatten everything but the
 * cascade itself.
 */
export function buildHeatmapGrid(
  buckets: ReadonlyArray<LiquidationBucket>,
  barMs: number,
): LiquidationHeatmapGrid {
  if (!Number.isFinite(barMs) || barMs <= 0) return EMPTY_GRID

  const columns = new Map<number, Array<LiquidationCell>>()
  const byCell = new Map<string, LiquidationCell>()
  let peak = 0

  for (const bucket of buckets) {
    if (!Number.isFinite(bucket.price) || bucket.price <= 0) continue
    if (!Number.isFinite(bucket.ts)) continue
    const notional = Number(bucket.notionalUsd)
    if (!Number.isFinite(notional) || notional <= 0) continue

    const barTs = Math.floor(bucket.ts / barMs) * barMs
    const key = `${barTs}|${bucket.price}`
    let cell = byCell.get(key)
    if (!cell) {
      cell = {
        barTs,
        price: bucket.price,
        longNotional: 0,
        shortNotional: 0,
        total: 0,
        count: 0,
      }
      byCell.set(key, cell)
      let column = columns.get(barTs)
      if (!column) {
        column = []
        columns.set(barTs, column)
      }
      column.push(cell)
    }

    if (bucket.side === 'long') cell.longNotional += notional
    else cell.shortNotional += notional
    cell.total += notional
    cell.count += Number.isFinite(bucket.count) ? bucket.count : 0
    if (cell.total > peak) peak = cell.total
  }

  return { columns, peak, cellCount: byCell.size, barMs }
}
