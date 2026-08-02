// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { Candle } from '@pairlens/shared/types'

const DEFAULT_MAX = 500

/**
 * How far back push() scans for a matching timestamp when a candle arrives
 * out of order (late final confirm after the next bar opened, reconnect
 * replay). Bounded so the hot path stays O(1).
 */
const LATE_UPDATE_SCAN = 5

/**
 * Normalize a candle series to the canonical contract: strictly ascending by
 * timestamp, de-duplicated (last write wins for an equal ts). Connectors must
 * emit candles in this order — the chart engine and CandleBuffer both assume
 * the newest candle is last. Exchanges disagree on REST ordering (some newest-
 * first, some oldest-first) and silently change it, so sorting deterministically
 * here is order-assumption-free and shields against that contract drift. Cheap:
 * already-sorted input is the common case and the sort is near-linear on it.
 */
export function sortCandlesAscending(candles: Array<Candle>): Array<Candle> {
  const sorted = [...candles].sort((a, b) => a.ts - b.ts)
  // Collapse duplicate timestamps, keeping the later occurrence.
  const out: Array<Candle> = []
  for (const c of sorted) {
    const prev = out[out.length - 1]
    if (prev && prev.ts === c.ts) out[out.length - 1] = c
    else out.push(c)
  }
  return out
}

/**
 * Circular buffer for candles. Supports push (upsert-or-append),
 * snapshot, and clear. Max capacity is configurable (default 500).
 */
export class CandleBuffer {
  private buffer: Array<Candle> = []
  private readonly max: number
  private dropped = 0

  constructor(max = DEFAULT_MAX) {
    this.max = max
  }

  /** Total candles in buffer. */
  get length(): number {
    return this.buffer.length
  }

  /** Stale out-of-order candles dropped because no matching ts was found. */
  get droppedCount(): number {
    return this.dropped
  }

  /**
   * Push a candle. If the last candle has the same timestamp,
   * update it in place (upsert). Otherwise append.
   * A candle older than the last one is a late update: it replaces the
   * matching entry in place (bounded backward scan) or is dropped as stale —
   * appending it would break the ascending-order invariant.
   * Evicts the oldest candle if buffer is at capacity.
   */
  push(candle: Candle): void {
    const last =
      this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null
    if (last && last.ts === candle.ts) {
      // Upsert — update in place
      this.buffer[this.buffer.length - 1] = candle
    } else if (last && candle.ts < last.ts) {
      // Out-of-order: late update to a recent candle (e.g. final confirm
      // arriving after the next bar opened, or a reconnect replay).
      const lowest = Math.max(0, this.buffer.length - LATE_UPDATE_SCAN)
      for (let i = this.buffer.length - 2; i >= lowest; i--) {
        if (this.buffer[i].ts === candle.ts) {
          this.buffer[i] = candle
          return
        }
      }
      // No match in the recent window — stale, drop it.
      this.dropped++
    } else {
      // Append — evict oldest if at capacity
      if (this.buffer.length >= this.max) {
        this.buffer.shift()
      }
      this.buffer.push(candle)
    }
  }

  /** Bulk load candles (e.g., from REST backfill). Clears existing data. */
  load(candles: Array<Candle>): void {
    this.buffer = candles.slice(-this.max)
  }

  /** Get a snapshot (copy) of all candles in chronological order. */
  snapshot(): Array<Candle> {
    return [...this.buffer]
  }

  /** Get the last candle, or null if empty. */
  last(): Candle | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null
  }

  /** Clear all candles. */
  clear(): void {
    this.buffer = []
  }
}
