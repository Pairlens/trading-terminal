// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What unit the limit line is in.
 *
 * The order draft holds ONE price field, and on a probability venue that field
 * is in CENTS while the chart plots probabilities in dollars (0..1) — the
 * boundary the two tickets state as "cents in the field, dollars everywhere
 * else". The line straddles it in both directions, which is what made the
 * mismatch a live bug rather than a cosmetic one: a 53¢ limit was handed to
 * `priceToCoordinate` as the price 53, mapped far above a 0..1 plot, and pinned
 * to the bottom edge; then dragging it wrote a probability like `0.61` back into
 * a field the ticket reads as cents, i.e. an order at 0.61¢ that the ticket's
 * own range check then refused.
 *
 * So the overlay no longer knows the unit at all. It asks for a scale once and
 * converts through it at both edges, which is the same discipline the desktop
 * ticket's price field uses (a `cents` flag, and `centsToPrice` / `priceToCents`
 * at that component's boundary) rather than a second one invented here.
 *
 * Pure and separate for the same reason `limit-line-geometry.ts` is: a
 * conversion pair is the thing that silently drifts, or inverts, and a test can
 * pin both directions here without mounting a chart.
 */
import { formatPredictionPrice } from '@/lib/format-price'
import {
  centsToPrice,
  clampPriceCents,
  priceToCents,
} from '@/lib/predictions/ticket-math'

export type LimitLineScale = {
  /**
   * Draft field → the price the chart plots, or null when the field is not a
   * price this instrument can have. Null hides the line, which is the point on
   * a probability venue: a `60000` inherited from a spot draft is not a
   * probability, and drawing it would pin a meaningless level to the plot edge.
   */
  toChartPrice: (field: string) => number | null
  /** A dragged chart price → the string the draft field expects. */
  toField: (chartPrice: number) => string
  /** The tag's reading, in the unit the price axis beside it is using. */
  formatTag: (chartPrice: number, locale: string) => string
}

/** Decimals a price of this magnitude is quoted in — mirrors formatChartPrice. */
function priceDecimals(price: number): number {
  if (price >= 1000) return 2
  if (price >= 1) return 4
  if (price >= 0.01) return 6
  return 8
}

const priceScale: LimitLineScale = {
  toChartPrice: (field) => {
    const parsed = Number(field)
    return field !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : null
  },
  // The pair's own precision, so the field stays a value the user could have
  // typed and the venue's tick accepts.
  toField: (chartPrice) =>
    String(Number(chartPrice.toFixed(priceDecimals(chartPrice)))),
  formatTag: (chartPrice, locale) =>
    chartPrice.toLocaleString(locale, {
      minimumFractionDigits: Math.min(2, priceDecimals(chartPrice)),
      maximumFractionDigits: priceDecimals(chartPrice),
    }),
}

const centsScale: LimitLineScale = {
  toChartPrice: (field) => (field === '' ? null : centsToPrice(field)),
  // Clamped, unlike the field→chart direction: this number came from the user's
  // finger on this outcome's axis, and the range is the venue's, not a guess.
  toField: (chartPrice) => String(clampPriceCents(priceToCents(chartPrice))),
  // The axis formatter, not a locale number: `53¢` beside an axis labelled in
  // cents, where a bare `0.53` would read as a different market entirely. The
  // unit is the reading, so there is nothing locale-dependent left to pass.
  formatTag: (chartPrice) => formatPredictionPrice(chartPrice),
}

/**
 * The scale for the instrument on screen.
 *
 * Two frozen singletons rather than a constructed object: the overlay holds this
 * in a ref that its rAF paint path reads, and a fresh identity per render would
 * make "did the unit change" impossible to answer with a dependency check.
 */
export function limitLineScale(prediction: boolean): LimitLineScale {
  return prediction ? centsScale : priceScale
}
