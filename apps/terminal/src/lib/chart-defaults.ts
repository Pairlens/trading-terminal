// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a chart should look like before the user has said anything.
 *
 * A candle is a summary of a fight between buyers and sellers inside a bucket.
 * A prediction outcome is a probability: it trades a handful of times an hour,
 * and drawing that as candles produces a row of doji ticks separated by
 * whatever the index axis felt like, which reads as a flat market when the
 * market is simply quiet. The honest default there is a step line of close on
 * a cents axis, so this file owns two questions with one answer each: which
 * chart type an asset class opens on, and which compare scale mode it opens
 * on. Desktop and mobile both read them, which is the point of the file.
 *
 * Nothing here is a lock. Every one of the sixteen chart types stays available
 * on every asset class; these are the values a fresh, unscoped chart starts at.
 */
import { TIMEFRAME_TO_MS, isTimeframe } from '@pairlens/shared/timeframe'
import type { AssetClass } from '@pairlens/market-engine'
import type {
  ChartType,
  CompareMode,
} from '@pairlens/fast-financial-charts/types'

/**
 * The class a chart falls back to when nothing has declared one yet — the
 * first paint of a cold load, before the plugin manager has published its
 * venues. Crypto spot is both the most common case and the least surprising
 * wrong guess: it opens on candles, which is what every chart did before.
 */
export const FALLBACK_CHART_ASSET_CLASS: AssetClass = 'crypto-spot'

/**
 * One class out of what a venue declares.
 *
 * Prediction wins when it is present, and that is not arbitrary: a venue that
 * serves outcomes serves nothing else priced 0..1, so the presentation rules
 * below have to apply. Otherwise the connector's own first entry wins, because
 * connectors list their primary class first.
 */
export function primaryAssetClass(
  declared: ReadonlyArray<AssetClass> | undefined,
): AssetClass {
  if (!declared || declared.length === 0) return FALLBACK_CHART_ASSET_CLASS
  if (declared.includes('prediction')) return 'prediction'
  return declared[0] ?? FALLBACK_CHART_ASSET_CLASS
}

/** The chart type a class opens on. Predictions read as probability lines. */
export function defaultChartTypeForAssetClass(
  assetClass: AssetClass | null | undefined,
): ChartType {
  return assetClass === 'prediction' ? 'stepLine' : 'candles'
}

/**
 * The compare scale mode a class opens on.
 *
 * `indexed` rebases every series to 100, which is right for two assets whose
 * prices have nothing to do with each other, and wrong for a prediction: the
 * rebased number goes through the cents formatter and the axis reads `10000¢`,
 * which is the misreading this default exists to stop.
 *
 * The replacement is `dual-axis`, not `price`. A shared price axis is the right
 * answer for two outcomes of one event, since both live in the same 0..1
 * domain. But the compare search resolves the instrument catalog, which holds
 * no prediction rows, so what you can actually overlay on an outcome today is a
 * spot pair, and a shared axis then hands BTC's range to the cents formatter
 * and reads `5378366¢` (measured, not guessed). Dual axis is honest in both
 * cases: the outcome keeps its own cents axis whatever is drawn over it.
 */
export function defaultCompareModeForAssetClass(
  assetClass: AssetClass | null | undefined,
): CompareMode {
  return assetClass === 'prediction' ? 'dual-axis' : 'indexed'
}

/**
 * Per-class storage key for a chart preference.
 *
 * Chart type and compare mode are the two settings whose right answer depends
 * on what is being charted, so they persist per class: candles on BTC and a
 * step line on an election outcome, at the same time, without either one
 * overwriting the other. Panes append their own scope on top, as before.
 */
export function classScopedChartKey(
  base: string,
  assetClass: AssetClass,
  scope?: string,
): string {
  const classed = `${base}.${assetClass}`
  return scope ? `${classed}::${scope}` : classed
}

// ── Probability forward fill ─────────────────────────────────────────

/** A bar as the chart engine takes it. */
export type ChartBarInput = {
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Ceiling on the densified series. A 1m chart of a market that opened three
 * months ago is ~130k buckets, and forward-filling that to draw a line nobody
 * will zoom into costs more than the gap it closes. Past the cap the raw array
 * is returned untouched: a gappy chart is a worse chart, not a broken one.
 */
export const PREDICTION_FILL_MAX_BARS = 5000

/**
 * Carry the last known probability across buckets that never traded.
 *
 * The trade aggregator deliberately refuses to do this. Its `rollIfExpired`
 * doc comment (`packages/plugins/src/ccxt-connector/trade-candle-aggregator.ts`)
 * spells it out: "a flat bar invented from the last close is a lie the chart
 * would draw", because everything downstream of the candle buffer (signals,
 * backtests, the CSV export, an assistant reading candles) would take the
 * invention as a print. That rule is right and it stays.
 *
 * This is a different claim at a different layer. Nothing here reaches the
 * candle buffer, the strategy engine or the export; it produces bars for one
 * chart series and no one else. And the claim it makes is true: an outcome
 * that last traded at 34¢ and has not traded since is still worth 34¢, in a
 * way that "BTC last traded at 64,300 an hour ago" is emphatically not. Volume
 * is 0 on every filled bucket, so the volume pane draws nothing there and the
 * gap stays visible to anyone looking for it.
 *
 * Two things it will not do. It never fills past the newest real bar toward
 * now, so a quiet market ends where its tape ends rather than growing a
 * phantom flat line to the present. And it refuses any gap that is not a whole
 * number of buckets wide, rather than fabricating a grid the data does not sit
 * on.
 *
 * Returns the input array by reference when there is nothing to fill, so a
 * memo above it does not rebuild.
 */
export function fillPredictionBars<T extends ChartBarInput>(
  bars: ReadonlyArray<T>,
  timeframeMs: number,
): Array<T | ChartBarInput> {
  if (bars.length < 2 || !Number.isFinite(timeframeMs) || timeframeMs <= 0) {
    return bars as Array<T>
  }

  const first = bars[0]
  const last = bars[bars.length - 1]
  if (!first || !last) return bars as Array<T>

  // Cheap projection before doing any work: buckets spanned, not bars held.
  const projected = Math.round((last.ts - first.ts) / timeframeMs) + 1
  if (!Number.isFinite(projected) || projected > PREDICTION_FILL_MAX_BARS) {
    return bars as Array<T>
  }

  const out: Array<T | ChartBarInput> = []
  let filled = 0

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]
    if (!bar) continue
    out.push(bar)

    const next = bars[i + 1]
    if (!next) break

    const gap = next.ts - bar.ts
    if (gap <= timeframeMs) continue
    const steps = Math.round(gap / timeframeMs)
    if (steps < 2) continue
    // Unaligned bars — a venue whose buckets do not sit on this interval's
    // grid. Filling would invent timestamps, so leave the gap alone.
    if (Math.abs(gap - steps * timeframeMs) > timeframeMs / 10) continue

    for (let step = 1; step < steps; step++) {
      out.push({
        ts: bar.ts + step * timeframeMs,
        open: bar.close,
        high: bar.close,
        low: bar.close,
        close: bar.close,
        volume: 0,
      })
      filled++
    }
  }

  return filled === 0 ? (bars as Array<T>) : out
}

/** Bucket width for an interval string, or 0 when this build has no row. */
export function chartBucketMs(timeframe: string): number {
  return isTimeframe(timeframe) ? TIMEFRAME_TO_MS[timeframe] : 0
}
