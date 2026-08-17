// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning the server's two-dimensional liquidation grid into the one-dimensional
 * strip the map draws.
 *
 * The wire carries buckets on both axes — minute in time, uniform width in price
 * — because that is the shape a future chart overlay needs. The liquidation map
 * is a strip over a PRICE axis, so it collapses the time axis entirely and the
 * window becomes a selector rather than a second dimension. Everything here is
 * that collapse, plus the scaling that decides how dark a slab is drawn.
 *
 * Two rules the pane depends on:
 *
 * - Sides are kept apart all the way to the render. A price where longs were
 *   liquidated and a price where shorts were are different facts, and summing
 *   them into one "activity" number is the mistake that makes a liquidation map
 *   look like a volume profile.
 * - Intensity is scaled by square root, never linearly. Liquidated notional is
 *   heavy-tailed: one cascade minute is routinely a hundred times a normal one,
 *   and a linear ramp against that maximum renders every other bucket invisible.
 */
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
 * The side that carried most of the bucket's notional.
 *
 * A tie resolves to 'long' rather than being drawn neutral: an exactly balanced
 * price bucket is a coincidence of rounding, not a third kind of event, and a
 * third colour on the strip would have to be explained in the legend.
 */
export function dominantSide(cluster: PriceCluster): LiquidationSide {
  return cluster.shortNotional > cluster.longNotional ? 'short' : 'long'
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
