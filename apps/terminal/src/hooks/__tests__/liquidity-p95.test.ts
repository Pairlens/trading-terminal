// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import {
  bucketOf,
  histAdd,
  histEvict,
  histMaxLiquidity,
  makeHist,
} from '../liquidity-p95'

const BIN_COUNT = 150
const P95_LOG_STEP = Math.log1p(1e12) / 512

// Deterministic PRNG (mulberry32) so the test never flakes.
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A sample of 150 bins; ~`fill` fraction are non-zero notionals spanning 1e2..1e8.
function makeBins(rand: () => number, fill = 0.6): Float64Array {
  const bins = new Float64Array(BIN_COUNT)
  const lo = Math.log(1e2)
  const hi = Math.log(1e8)
  for (let i = 0; i < BIN_COUNT; i++) {
    if (rand() < fill) bins[i] = Math.exp(rand() * (hi - lo) + lo)
  }
  return bins
}

// Exact windowed p95, matching the original collect-all-and-sort definition
// that the histogram replaces.
function exactP95(samples: Array<Float64Array>): number {
  const vals: Array<number> = []
  for (const b of samples) for (const v of b) if (v > 0) vals.push(v)
  if (vals.length === 0) return 0
  vals.sort((a, b) => a - b)
  return vals[Math.floor(vals.length * 0.95)]
}

// The histogram returns the p95 bucket's upper edge, so it can differ from the
// exact element by at most a couple of buckets in log space.
function expectCloseInLog(hist: number, exact: number, buckets = 3): void {
  const delta = Math.abs(Math.log1p(hist) - Math.log1p(exact))
  expect(delta).toBeLessThanOrEqual(buckets * P95_LOG_STEP)
}

describe('liquidity-p95 histogram', () => {
  test('empty histogram reports 0', () => {
    expect(histMaxLiquidity(makeHist())).toBe(0)
  })

  test('all-zero bins contribute nothing', () => {
    const h = makeHist()
    histAdd(h, new Float64Array(BIN_COUNT))
    expect(h.total).toBe(0)
    expect(histMaxLiquidity(h)).toBe(0)
  })

  test('tracks the exact windowed p95 within a few buckets', () => {
    const rand = rng(42)
    const h = makeHist()
    const samples: Array<Float64Array> = []
    for (let i = 0; i < 300; i++) {
      const b = makeBins(rand)
      histAdd(h, b)
      samples.push(b)
    }
    expectCloseInLog(histMaxLiquidity(h), exactP95(samples))
  })

  test('FIFO eviction keeps counts and p95 matching the live window', () => {
    const rand = rng(7)
    const K = 200
    const h = makeHist()
    const win: Array<Float64Array> = []
    for (let i = 0; i < 1000; i++) {
      const b = makeBins(rand)
      histAdd(h, b)
      win.push(b)
      if (win.length > K) histEvict(h, win.shift()!)
    }

    let nonZero = 0
    for (const b of win) for (const v of b) if (v > 0) nonZero++
    expect(h.total).toBe(nonZero) // exact count bookkeeping after eviction

    expectCloseInLog(histMaxLiquidity(h), exactP95(win))
  })

  test('evicting everything returns to empty', () => {
    const h = makeHist()
    const b = makeBins(rng(1))
    histAdd(h, b)
    histEvict(h, b)
    expect(h.total).toBe(0)
    expect(histMaxLiquidity(h)).toBe(0)
  })

  test('NaN / non-positive bin values are ignored, not corrupting counts', () => {
    const h = makeHist()
    const b = new Float64Array(BIN_COUNT)
    b[0] = NaN
    b[1] = -5
    b[2] = 100
    histAdd(h, b)
    expect(h.total).toBe(1) // only the one positive value counted
  })

  test('bucketOf is monotonic and clamped to the fixed domain', () => {
    expect(bucketOf(-5)).toBe(0)
    expect(bucketOf(0)).toBe(0)
    expect(bucketOf(1e30)).toBe(511) // beyond the ceiling clamps to the top bucket

    let prev = -1
    for (const v of [1, 10, 100, 1e4, 1e6, 1e9, 1e12]) {
      const bk = bucketOf(v)
      expect(bk).toBeGreaterThanOrEqual(prev)
      prev = bk
    }
  })

  test('a dominant liquidity level pins the p95 near that value', () => {
    const h = makeHist()
    // 200 samples where almost all mass sits at ~5_000_000 notional.
    for (let i = 0; i < 200; i++) {
      const b = new Float64Array(BIN_COUNT)
      for (let k = 0; k < 140; k++) b[k] = 5_000_000
      histAdd(h, b)
    }
    expectCloseInLog(histMaxLiquidity(h), 5_000_000, 2)
  })
})
