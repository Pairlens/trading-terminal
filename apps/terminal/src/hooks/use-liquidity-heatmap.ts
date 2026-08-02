// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'

import type { OrderbookStreamValue } from '@/lib/chart-terminal-context'
import type { P95Hist } from '@/hooks/liquidity-p95'
import {
  histAdd,
  histEvict,
  histMaxLiquidity,
  makeHist,
} from '@/hooks/liquidity-p95'

// ── Types ────────────────────────────────────────────────────────────

export type HeatmapMeta = {
  priceLow: number
  priceHigh: number
  binCount: number
  binSize: number
  maxLiquidity: number
}

export type HeatmapSample = {
  ts: number
  bins: Float64Array
  /**
   * Price range these bins were computed against. Stored per-sample so the
   * renderer can map each bin back to its true price — the visible range
   * drifts as price moves, and older samples must not be re-projected onto a
   * newer, wider grid (that misplaces their liquidity at the wrong prices).
   */
  priceLow: number
  binSize: number
}

export type HeatmapDataStore = {
  /** All orderbook samples sorted by timestamp */
  samples: Array<HeatmapSample>
  meta: HeatmapMeta
  /** Incremented on every update — lets consumers know to re-render */
  version: number
}

// ── Config ───────────────────────────────────────────────────────────

/** How many vertical price bins */
const BIN_COUNT = 150

/** Max samples to keep in memory */
const MAX_SAMPLES = 2000

/** Minimum sample interval in ms */
const SAMPLE_INTERVAL_MS = 1_000

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * Accumulates orderbook snapshots at ~1s resolution into a sorted
 * sample array. Consumers (the primitive renderer) find samples
 * within each candle bar's time range and render sub-columns.
 */
export function useLiquidityHeatmapData(
  orderbookData: OrderbookStreamValue | null,
): React.RefObject<HeatmapDataStore> {
  const storeRef = useRef<HeatmapDataStore>({
    samples: [],
    meta: {
      priceLow: 0,
      priceHigh: 0,
      binCount: BIN_COUNT,
      binSize: 0,
      maxLiquidity: 0,
    },
    version: 0,
  })
  const lastSampleRef = useRef(0)
  const p95Ref = useRef<P95Hist>(makeHist())

  // Sample orderbook on every update (throttled)
  useEffect(() => {
    const orderbook = orderbookData?.orderbook
    if (!orderbook?.bids.length || !orderbook?.asks.length) return

    const now = Date.now()
    if (now - lastSampleRef.current < SAMPLE_INTERVAL_MS) return
    lastSampleRef.current = now

    const store = storeRef.current

    // Derive price range from actual orderbook levels (trim outliers)
    const allLevels = [...orderbook.bids, ...orderbook.asks].sort(
      (a, b) => a.price - b.price,
    )
    const totalLiq = allLevels.reduce((s, l) => s + l.size * l.price, 0)
    let dataLow = allLevels[0]!.price
    let dataHigh = allLevels[allLevels.length - 1]!.price
    const threshold = totalLiq * 0.025

    let cumLiq = 0
    for (const l of allLevels) {
      cumLiq += l.size * l.price
      if (cumLiq >= threshold) {
        dataLow = l.price
        break
      }
    }
    cumLiq = 0
    for (let i = allLevels.length - 1; i >= 0; i--) {
      cumLiq += allLevels[i]!.size * allLevels[i]!.price
      if (cumLiq >= threshold) {
        dataHigh = allLevels[i]!.price
        break
      }
    }

    const dataRange = dataHigh - dataLow
    const padding = dataRange * 0.1
    // Each sample uses its own instantaneous price range. We deliberately do
    // NOT union with prior ranges: liquidity clusters move with price, and the
    // renderer maps each sample's bins back to price using the range stored on
    // that sample — so old and new samples stay at their true price levels.
    const low = dataLow - padding
    const high = dataHigh + padding

    const binSize = (high - low) / BIN_COUNT
    if (binSize <= 0) return

    // Bin the orderbook levels
    const bins = new Float64Array(BIN_COUNT)
    for (const level of orderbook.bids) {
      const idx = Math.floor((level.price - low) / binSize)
      if (idx >= 0 && idx < BIN_COUNT) {
        bins[idx] += level.size * level.price
      }
    }
    for (const level of orderbook.asks) {
      const idx = Math.floor((level.price - low) / binSize)
      if (idx >= 0 && idx < BIN_COUNT) {
        bins[idx] += level.size * level.price
      }
    }

    const hist = p95Ref.current
    histAdd(hist, bins)
    store.samples.push({ ts: now, bins, priceLow: low, binSize })
    if (store.samples.length > MAX_SAMPLES) {
      // FIFO-evict the oldest samples, uncounting each from the histogram so it
      // reflects exactly the live window (normally 0 or 1 removed per sample).
      const removed = store.samples.splice(
        0,
        store.samples.length - MAX_SAMPLES,
      )
      for (const s of removed) histEvict(hist, s.bins)
    }

    store.meta = {
      priceLow: low,
      priceHigh: high,
      binCount: BIN_COUNT,
      binSize,
      maxLiquidity: histMaxLiquidity(hist),
    }
    store.version++
  }, [orderbookData])

  // Reset when orderbook disappears (pair change). Gate on a stable boolean:
  // the orderbook object gets a fresh reference on every WS tick, so depending
  // on it directly would re-run this effect (and its guard) many times a second
  // for no reason. The boolean only flips on an actual presence change.
  const hasOrderbook = Boolean(orderbookData?.orderbook)
  useEffect(() => {
    if (!hasOrderbook) {
      storeRef.current = {
        samples: [],
        meta: {
          priceLow: 0,
          priceHigh: 0,
          binCount: BIN_COUNT,
          binSize: 0,
          maxLiquidity: 0,
        },
        version: 0,
      }
      lastSampleRef.current = 0
      p95Ref.current = makeHist()
    }
  }, [hasOrderbook])

  return storeRef
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Binary search: find the index of the first sample with ts >= target.
 */
export function findFirstSampleIndex(
  samples: Array<HeatmapSample>,
  targetTs: number,
): number {
  let lo = 0
  let hi = samples.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (samples[mid].ts < targetTs) lo = mid + 1
    else hi = mid
  }
  return lo
}
