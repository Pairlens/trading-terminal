// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Incremental p95 for liquidity-heatmap colour normalization ────────
//
// `maxLiquidity` normalizes the colour ramp (t = log1p(val)/log1p(maxLiq)).
// It is the 95th percentile of every non-zero bin value across the live sample
// window. Re-collecting and sorting all ~300k values every second is pure
// GC-churning waste, so instead we keep a fixed log-domain histogram that is
// incremented per sample and decremented on FIFO eviction — O(bins) per update,
// O(buckets) to read, and a single ~2 KB Uint32Array for the store's lifetime.
// Quantization lands on the log axis the ramp already uses, so the error is
// sub-perceptual.
//
// The domain MUST stay fixed for a histogram's lifetime (it is discarded and
// remade per pair): increments and decrements have to map to the same bucket,
// so `bucketOf` reads only module constants.

const P95_BUCKETS = 512
/** ≈27.6; a hard over-estimate of any single-bin notional (size×price sum). */
const P95_LOG_HI = Math.log1p(1e12)
const P95_LOG_STEP = P95_LOG_HI / P95_BUCKETS
const P95_QUANTILE = 0.95

export type P95Hist = {
  /** counts[b] = number of live non-zero bin values whose log1p falls in bucket b */
  counts: Uint32Array
  /** running sum of counts (max 2000×150 = 300k, well within u32) */
  total: number
}

export function makeHist(): P95Hist {
  return { counts: new Uint32Array(P95_BUCKETS), total: 0 }
}

/** Map a positive notional bin value to its fixed log-domain bucket. */
export function bucketOf(val: number): number {
  const b = (Math.log1p(val) / P95_LOG_STEP) | 0
  return b < 0 ? 0 : b >= P95_BUCKETS ? P95_BUCKETS - 1 : b
}

/** Fold one sample's non-zero bins into the histogram. */
export function histAdd(hist: P95Hist, bins: Float64Array): void {
  const counts = hist.counts
  for (const v of bins) {
    if (v > 0) {
      counts[bucketOf(v)]++
      hist.total++
    }
  }
}

/** Remove one evicted sample's non-zero bins from the histogram. */
export function histEvict(hist: P95Hist, bins: Float64Array): void {
  const counts = hist.counts
  for (const v of bins) {
    if (v > 0) {
      const bk = bucketOf(v)
      if (counts[bk] > 0) counts[bk]-- // guard: never trips with a fixed domain
      if (hist.total > 0) hist.total--
    }
  }
}

/** Read the p95 back as a linear value (`expm1` of the p95 bucket's upper edge). */
export function histMaxLiquidity(hist: P95Hist): number {
  if (hist.total === 0) return 0
  const counts = hist.counts
  const target = hist.total * P95_QUANTILE
  let cum = 0
  let b = 0
  for (; b < P95_BUCKETS; b++) {
    cum += counts[b]
    // `>` (not `>=`) matches the replaced `allVals[floor(N*0.95)]` rank at the
    // integer boundary (total % 20 === 0); identical for non-integer targets.
    if (cum > target) break
  }
  if (b >= P95_BUCKETS) b = P95_BUCKETS - 1
  // Upper edge of the p95 bucket in log1p space == log1p(maxLiquidity).
  return Math.expm1((b + 1) * P95_LOG_STEP)
}
